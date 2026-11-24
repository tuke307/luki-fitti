import Foundation

public enum GoogleOAuthError: Error, Equatable, Sendable {
    case missingCode
    case stateMismatch
    /// Google returned `?error=` on the redirect (e.g. access_denied when the user cancels).
    case providerError(String)
}

/// OAuth 2.0 authorization-code + PKCE flow for iOS clients, driven through
/// `ASWebAuthenticationSession` — no Google SDK required. The iOS-type client id
/// needs no secret; the redirect URI is the reversed-client-id custom scheme.
public enum GoogleOAuth {
    public static let authorizationEndpoint = URL(string: "https://accounts.google.com/o/oauth2/v2/auth")!
    public static let tokenEndpoint = URL(string: "https://oauth2.googleapis.com/token")!
    public static let scope = "openid email profile"

    /// `123-abc.apps.googleusercontent.com` → `com.googleusercontent.apps.123-abc`
    public static func redirectScheme(clientId: String) -> String {
        clientId.split(separator: ".").reversed().joined(separator: ".")
    }

    /// The redirect registered for iOS-type clients: `<reversed scheme>:/oauthredirect`.
    public static func redirectURI(clientId: String) -> String {
        "\(redirectScheme(clientId: clientId)):/oauthredirect"
    }

    /// `callbackURLScheme` for `ASWebAuthenticationSession` — the scheme without `:/…`.
    public static func callbackURLScheme(clientId: String) -> String {
        redirectScheme(clientId: clientId)
    }

    /// Authorization URL with PKCE S256 and the OIDC nonce.
    public static func authorizationURL(
        clientId: String,
        state: String,
        nonce: String,
        codeChallenge: String
    ) -> URL {
        var components = URLComponents(url: authorizationEndpoint, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectURI(clientId: clientId)),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: scope),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "nonce", value: nonce),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
        ]
        return components.url!
    }

    /// Extracts and validates the authorization code from the session callback URL.
    public static func parseCallback(_ url: URL, expectedState: String) throws -> String {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        if let error = items.first(where: { $0.name == "error" })?.value {
            throw GoogleOAuthError.providerError(error)
        }
        guard items.first(where: { $0.name == "state" })?.value == expectedState else {
            throw GoogleOAuthError.stateMismatch
        }
        guard let code = items.first(where: { $0.name == "code" })?.value, !code.isEmpty else {
            throw GoogleOAuthError.missingCode
        }
        return code
    }

    /// form-urlencoded token-exchange request; returns `id_token` on success.
    public static func tokenExchangeRequest(clientId: String, code: String, verifier: String) -> URLRequest {
        var request = URLRequest(url: tokenEndpoint)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "code_verifier", value: verifier),
            URLQueryItem(name: "redirect_uri", value: redirectURI(clientId: clientId)),
            URLQueryItem(name: "grant_type", value: "authorization_code"),
        ]
        request.httpBody = components.percentEncodedQuery?.data(using: .utf8)
        return request
    }

    /// Pulls `id_token` (or `error`) out of the token endpoint's JSON body.
    public static func parseTokenResponse(_ data: Data) throws -> String {
        struct TokenResponse: Decodable {
            let id_token: String?
            let error: String?
            let error_description: String?
        }
        let response = try JSONDecoder().decode(TokenResponse.self, from: data)
        if let error = response.error {
            throw GoogleOAuthError.providerError(response.error_description ?? error)
        }
        guard let idToken = response.id_token else { throw GoogleOAuthError.missingCode }
        return idToken
    }
}
