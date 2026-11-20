import AuthenticationServices
import Foundation
import LukiFittiAPI
import LukiFittiModels
import UIKit

/// Runs the native sign-in ceremonies against the account-security API: Google via
/// `ASWebAuthenticationSession` (authorization code + PKCE, no SDK), Apple via
/// `ASAuthorizationAppleIDProvider`, and platform passkeys. Each method returns what
/// the API answered — a `.mfaRequired` result is handed back for the caller's MFA step.
@MainActor
final class AuthSecurityCoordinator: NSObject {
    enum FlowError: Error {
        /// User dismissed the sheet / prompt — deliberately not an error message.
        case cancelled
        case missingCredential
    }

    let apiClient: APIClient

    init(apiClient: APIClient) {
        self.apiClient = apiClient
    }

    /// Google iOS client id from `LUKIFITTI_GOOGLE_IOS_CLIENT_ID` (xcconfig). Empty → feature off.
    var googleClientId: String? {
        let value = (Bundle.main.object(forInfoDictionaryKey: "LUKIFITTI_GOOGLE_IOS_CLIENT_ID") as? String)?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return value.isEmpty ? nil : value
    }

    // MARK: - Google (ASWebAuthenticationSession + PKCE)

    private func googleIDToken() async throws -> (idToken: String, nonce: String) {
        guard let clientId = googleClientId else { throw FlowError.missingCredential }
        let verifier = PKCE.makeVerifier()
        let state = OAuthNonce.makeRaw()
        let nonce = OAuthNonce.makeRaw()
        let authURL = GoogleOAuth.authorizationURL(
            clientId: clientId,
            state: state,
            nonce: nonce,
            codeChallenge: PKCE.s256Challenge(verifier: verifier)
        )
        let callbackURL = try await runWebAuthSession(
            url: authURL,
            callbackScheme: GoogleOAuth.callbackURLScheme(clientId: clientId)
        )
        let code = try GoogleOAuth.parseCallback(callbackURL, expectedState: state)
        let request = GoogleOAuth.tokenExchangeRequest(clientId: clientId, code: code, verifier: verifier)
        let (data, _) = try await URLSession.shared.data(for: request)
        return (try GoogleOAuth.parseTokenResponse(data), nonce)
    }

    func signInWithGoogle() async throws -> LoginResult {
        let (idToken, nonce) = try await googleIDToken()
        return try await apiClient.oauthSignIn(provider: "google", idToken: idToken, nonce: nonce)
    }

    func linkGoogle() async throws {
        let (idToken, nonce) = try await googleIDToken()
        try await apiClient.linkProvider(provider: "google", idToken: idToken, nonce: nonce)
    }

    // MARK: - Apple

    private func appleIDToken() async throws -> (idToken: String, nonce: String, name: String?) {
        let rawNonce = OAuthNonce.makeRaw()
        let provider = ASAuthorizationAppleIDProvider()
        let request = provider.createRequest()
        request.requestedScopes = [.fullName, .email]
        // Apple hashes the nonce into the token; the API accepts raw or its sha256 hex.
        request.nonce = OAuthNonce.sha256Hex(rawNonce)

        let authorization = try await performAuthorization(request)
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8) else {
            throw FlowError.missingCredential
        }
        let parts = [credential.fullName?.givenName, credential.fullName?.familyName]
            .compactMap { $0?.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        return (idToken, rawNonce, parts.isEmpty ? nil : parts.joined(separator: " "))
    }

    func signInWithApple() async throws -> LoginResult {
        let credential = try await appleIDToken()
        return try await apiClient.oauthSignIn(
            provider: "apple",
            idToken: credential.idToken,
            nonce: credential.nonce,
            name: credential.name
        )
    }

    func linkApple() async throws {
        let credential = try await appleIDToken()
        try await apiClient.linkProvider(
            provider: "apple",
            idToken: credential.idToken,
            nonce: credential.nonce,
            name: credential.name
        )
    }

    // MARK: - Passkeys

    /// Passwordless sign-in. User verification on the passkey itself replaces 2FA.
    func signInWithPasskey() async throws -> UserDto {
        let loginOptions = try await apiClient.passkeyLoginOptions()
        let options = try WebAuthnJSON.parseRequestOptions(
            WebAuthnJSON.objectDictionary(loginOptions.options)
        )
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(
            relyingPartyIdentifier: options.rpId
        )
        let request = provider.createCredentialAssertionRequest(challenge: options.challenge)
        request.allowedCredentials = options.allowCredentialIds.map {
            ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0)
        }

        let authorization = try await performAuthorization(request)
        guard let assertion = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialAssertion else {
            throw FlowError.missingCredential
        }
        let response = try WebAuthnJSON.jsonValue(
            WebAuthnJSON.assertionResponse(
                credentialId: assertion.credentialID,
                clientDataJSON: assertion.rawClientDataJSON,
                authenticatorData: assertion.rawAuthenticatorData,
                signature: assertion.signature ?? Data(),
                userHandle: assertion.userID
            )
        )
        return try await apiClient.passkeyLoginVerify(challengeId: loginOptions.challengeId, response: response)
    }

    /// Registers a new passkey on the signed-in account.
    func registerPasskey(name: String?) async throws -> PasskeyDto {
        let optionsJSON = try await apiClient.passkeyRegisterOptions()
        let options = try WebAuthnJSON.parseRegistrationOptions(
            WebAuthnJSON.objectDictionary(optionsJSON)
        )
        let provider = ASAuthorizationPlatformPublicKeyCredentialProvider(
            relyingPartyIdentifier: options.rpId
        )
        let request = provider.createCredentialRegistrationRequest(
            challenge: options.challenge,
            name: options.userName,
            userID: options.userId
        )
        request.excludedCredentials = options.excludedCredentialIds.map {
            ASAuthorizationPlatformPublicKeyCredentialDescriptor(credentialID: $0)
        }

        let authorization = try await performAuthorization(request)
        guard let registration = authorization.credential as? ASAuthorizationPlatformPublicKeyCredentialRegistration,
              let attestationObject = registration.rawAttestationObject else {
            throw FlowError.missingCredential
        }
        let response = try WebAuthnJSON.jsonValue(
            WebAuthnJSON.registrationResponse(
                credentialId: registration.credentialID,
                clientDataJSON: registration.rawClientDataJSON,
                attestationObject: attestationObject
            )
        )
        return try await apiClient.passkeyRegisterVerify(response: response, name: name)
    }

    // MARK: - AuthenticationServices plumbing

    private func runWebAuthSession(url: URL, callbackScheme: String) async throws -> URL {
        let provider = PresentationAnchorProvider.shared
        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackScheme
            ) { callbackURL, error in
                if let error = error as? ASWebAuthenticationSessionError,
                   error.code == .canceledLogin {
                    continuation.resume(throwing: FlowError.cancelled)
                } else if let error {
                    continuation.resume(throwing: error)
                } else if let callbackURL {
                    continuation.resume(returning: callbackURL)
                } else {
                    continuation.resume(throwing: FlowError.missingCredential)
                }
            }
            session.presentationContextProvider = provider
            session.prefersEphemeralWebBrowserSession = false
            if !session.start() {
                continuation.resume(throwing: FlowError.missingCredential)
            }
        }
    }

    private func performAuthorization(
        _ request: ASAuthorizationRequest
    ) async throws -> ASAuthorization {
        let provider = PresentationAnchorProvider.shared
        return try await withCheckedThrowingContinuation { continuation in
            let delegate = AuthorizationDelegate { result in
                continuation.resume(with: result)
            }
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = delegate
            controller.presentationContextProvider = provider
            delegate.retainUntilDone = controller
            controller.performRequests()
        }
    }
}

/// Continuation bridge for `ASAuthorizationControllerDelegate`; kept alive until done.
private final class AuthorizationDelegate: NSObject, ASAuthorizationControllerDelegate, @unchecked Sendable {
    var retainUntilDone: AnyObject?
    private let completion: (Result<ASAuthorization, Error>) -> Void
    private var didComplete = false

    init(completion: @escaping (Result<ASAuthorization, Error>) -> Void) {
        self.completion = completion
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        finish(.success(authorization))
    }

    func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        if let authError = error as? ASAuthorizationError, authError.code == .canceled {
            finish(.failure(AuthSecurityCoordinator.FlowError.cancelled))
        } else {
            finish(.failure(error))
        }
    }

    private func finish(_ result: Result<ASAuthorization, Error>) {
        guard !didComplete else { return }
        didComplete = true
        completion(result)
        retainUntilDone = nil
    }
}

/// Hands AuthenticationServices the key window. Shared and @MainActor-safe under Swift 6.
@MainActor
private final class PresentationAnchorProvider: NSObject,
    ASWebAuthenticationPresentationContextProviding,
    ASAuthorizationControllerPresentationContextProviding {
    static let shared = PresentationAnchorProvider()

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        Self.anchor()
    }

    func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        Self.anchor()
    }

    private static func anchor() -> ASPresentationAnchor {
        let scenes = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .filter { $0.activationState == .foregroundActive }
        for scene in scenes {
            if let key = scene.windows.first(where: { $0.isKeyWindow }) { return key }
            if let first = scene.windows.first { return first }
        }
        return UIWindow()
    }
}
