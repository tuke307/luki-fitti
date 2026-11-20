import Foundation
import LukiFittiModels

/// Account security endpoints: OAuth (Google/Apple) sign-in, passkeys and optional
/// TOTP 2FA. Mirrors `apps/api/src/modules/auth/security.controller.ts`.
extension APIClient {
    private struct EmptyResponse: Decodable {}

    /// Saves session tokens exactly like `login` — every path that returns a user with tokens.
    private func adoptSession(_ user: UserDto) {
        if let tokens = user.tokens {
            try? tokenStore.saveTokens(tokens, userId: user.id)
        }
    }

    private func adopt(_ response: LoginResponseDto) -> LoginResult {
        if case .signedIn(let user) = response.result {
            adoptSession(user)
        }
        return response.result
    }

    // MARK: - Second factor

    /// Finishes a login that returned `.mfaRequired`. Accepts a TOTP or recovery code.
    public func verifyTwoFactor(mfaToken: String, code: String) async throws -> UserDto {
        struct Body: Encodable { let mfaToken: String; let code: String }
        let user: UserDto = try await request(
            path: "/api/auth/2fa/verify",
            method: "POST",
            body: Body(mfaToken: mfaToken, code: code),
            requiresAuth: false
        )
        adoptSession(user)
        return user
    }

    // MARK: - Google / Apple

    /// Sign in or up with a provider `idToken` + the raw nonce used for the request.
    public func oauthSignIn(provider: String, idToken: String, nonce: String, name: String? = nil) async throws -> LoginResult {
        struct Body: Encodable { let idToken: String; let nonce: String; let name: String? }
        let response: LoginResponseDto = try await request(
            path: "/api/auth/oauth/\(provider)",
            method: "POST",
            body: Body(idToken: idToken, nonce: nonce, name: name),
            requiresAuth: false
        )
        return adopt(response)
    }

    /// Links a provider account to the signed-in user (same credential fields as sign-in).
    public func linkProvider(provider: String, idToken: String, nonce: String, name: String? = nil) async throws {
        struct Body: Encodable { let idToken: String; let nonce: String; let name: String? }
        struct Resp: Decodable { let success: Bool? }
        let _: Resp = try await request(
            path: "/api/auth/oauth/\(provider)/link",
            method: "POST",
            body: Body(idToken: idToken, nonce: nonce, name: name)
        )
    }

    public func unlinkProvider(_ provider: String) async throws {
        struct Resp: Decodable { let success: Bool? }
        let _: Resp = try await request(path: "/api/auth/oauth/\(provider)", method: "DELETE")
    }

    // MARK: - Security overview

    public func securityStatus() async throws -> SecurityStatusDto {
        try await request(path: "/api/auth/security", method: "GET")
    }

    // MARK: - Passkeys

    /// @simplewebauthn creation options for a new passkey on the signed-in account.
    public func passkeyRegisterOptions() async throws -> JSONValue {
        try await request(path: "/api/auth/passkeys/register/options", method: "POST")
    }

    public func passkeyRegisterVerify(response: JSONValue, name: String? = nil) async throws -> PasskeyDto {
        struct Body: Encodable { let response: JSONValue; let name: String? }
        return try await request(
            path: "/api/auth/passkeys/register/verify",
            method: "POST",
            body: Body(response: response, name: name)
        )
    }

    public func passkeyLoginOptions() async throws -> PasskeyLoginOptionsDto {
        struct EmptyBody: Encodable {}
        return try await request(
            path: "/api/auth/passkeys/login/options",
            method: "POST",
            body: EmptyBody(),
            requiresAuth: false
        )
    }

    /// Passwordless sign-in; user verification on the passkey replaces 2FA.
    public func passkeyLoginVerify(challengeId: String, response: JSONValue) async throws -> UserDto {
        struct Body: Encodable { let challengeId: String; let response: JSONValue }
        let user: UserDto = try await request(
            path: "/api/auth/passkeys/login/verify",
            method: "POST",
            body: Body(challengeId: challengeId, response: response),
            requiresAuth: false
        )
        adoptSession(user)
        return user
    }

    @discardableResult
    public func renamePasskey(id: String, name: String) async throws -> PasskeyDto {
        struct Body: Encodable { let name: String }
        return try await request(
            path: "/api/auth/passkeys/\(Self.pathComponent(id))",
            method: "PATCH",
            body: Body(name: name)
        )
    }

    public func deletePasskey(id: String) async throws {
        struct Resp: Decodable { let success: Bool? }
        let _: Resp = try await request(
            path: "/api/auth/passkeys/\(Self.pathComponent(id))",
            method: "DELETE"
        )
    }

    // MARK: - TOTP two-factor

    public func twoFactorSetup() async throws -> TwoFactorSetupDto {
        struct EmptyBody: Encodable {}
        return try await request(path: "/api/auth/2fa/setup", method: "POST", body: EmptyBody())
    }

    public func twoFactorEnable(code: String) async throws -> RecoveryCodesDto {
        struct Body: Encodable { let code: String }
        return try await request(path: "/api/auth/2fa/enable", method: "POST", body: Body(code: code))
    }

    public func twoFactorDisable(code: String) async throws {
        struct Body: Encodable { let code: String }
        struct Resp: Decodable { let success: Bool? }
        let _: Resp = try await request(path: "/api/auth/2fa/disable", method: "POST", body: Body(code: code))
    }

    public func regenerateRecoveryCodes(code: String) async throws -> RecoveryCodesDto {
        struct Body: Encodable { let code: String }
        return try await request(
            path: "/api/auth/2fa/recovery-codes",
            method: "POST",
            body: Body(code: code)
        )
    }
}
