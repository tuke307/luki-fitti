import Foundation

// MARK: - Account security: Google/Apple sign-in, passkeys and optional TOTP 2FA
// Mirrors packages/common/src/schemas/security.schemas.ts.

/// Minimal JSON tree so opaque WebAuthn option/response payloads can cross the
/// Codable boundary without `Any` in public signatures.
public enum JSONValue: Codable, Sendable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    public init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let v = try? c.decode(Bool.self) { self = .bool(v); return }
        if let v = try? c.decode(Double.self) { self = .number(v); return }
        if let v = try? c.decode(String.self) { self = .string(v); return }
        if let v = try? c.decode([JSONValue].self) { self = .array(v); return }
        self = .object(try c.decode([String: JSONValue].self))
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let v): try c.encode(v)
        case .number(let v): try c.encode(v)
        case .bool(let v): try c.encode(v)
        case .object(let v): try c.encode(v)
        case .array(let v): try c.encode(v)
        case .null: try c.encodeNil()
        }
    }

    /// Bridges to `JSONSerialization` objects ([String: Any], [Any], NSNumber, NSString, NSNull).
    public var foundationObject: Any {
        switch self {
        case .string(let v): return v
        case .number(let v): return v
        case .bool(let v): return v
        case .object(let v): return v.mapValues { $0.foundationObject }
        case .array(let v): return v.map { $0.foundationObject }
        case .null: return NSNull()
        }
    }
}

/// Result of a sign-in call: either a session, or an MFA challenge to finish first.
public enum LoginResult: Sendable, Equatable {
    case signedIn(UserDto)
    /// Short-lived token to submit with the second factor to `/api/auth/2fa/verify`.
    case mfaRequired(token: String)

    public var user: UserDto? {
        if case .signedIn(let user) = self { return user }
        return nil
    }
}

/// Decodes `UserDto` or `{mfaRequired:true, mfaToken}` — used internally by APIClient.
public struct LoginResponseDto: Decodable, Sendable {
    public let result: LoginResult

    private enum CodingKeys: String, CodingKey {
        case mfaRequired, mfaToken
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        if (try c.decodeIfPresent(Bool.self, forKey: .mfaRequired)) == true {
            guard let token = try c.decodeIfPresent(String.self, forKey: .mfaToken) else {
                throw DecodingError.keyNotFound(
                    CodingKeys.mfaToken,
                    .init(codingPath: decoder.codingPath, debugDescription: "mfaRequired without mfaToken")
                )
            }
            result = .mfaRequired(token: token)
            return
        }
        result = .signedIn(try UserDto(from: decoder))
    }
}

public struct PasskeyDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var name: String
    public var deviceType: String
    public var backedUp: Bool
    public var createdAt: String
    public var lastUsedAt: String?

    public init(
        id: String,
        name: String,
        deviceType: String,
        backedUp: Bool,
        createdAt: String,
        lastUsedAt: String? = nil
    ) {
        self.id = id
        self.name = name
        self.deviceType = deviceType
        self.backedUp = backedUp
        self.createdAt = createdAt
        self.lastUsedAt = lastUsedAt
    }
}

public struct SecurityStatusDto: Codable, Sendable, Equatable {
    public var hasPassword: Bool
    /// Linked OAuth providers ("google" / "apple").
    public var providers: [String]
    public var passkeys: [PasskeyDto]
    public var twoFactorEnabled: Bool
    public var recoveryCodesRemaining: Int

    public init(
        hasPassword: Bool,
        providers: [String],
        passkeys: [PasskeyDto],
        twoFactorEnabled: Bool,
        recoveryCodesRemaining: Int
    ) {
        self.hasPassword = hasPassword
        self.providers = providers
        self.passkeys = passkeys
        self.twoFactorEnabled = twoFactorEnabled
        self.recoveryCodesRemaining = recoveryCodesRemaining
    }
}

public struct TwoFactorSetupDto: Codable, Sendable, Equatable {
    /// `otpauth://` URI to render as a QR code.
    public var otpauthUrl: String
    /// Base32 secret for manual entry.
    public var secret: String

    public init(otpauthUrl: String, secret: String) {
        self.otpauthUrl = otpauthUrl
        self.secret = secret
    }
}

public struct RecoveryCodesDto: Codable, Sendable, Equatable {
    /// Shown exactly once.
    public var recoveryCodes: [String]

    public init(recoveryCodes: [String]) {
        self.recoveryCodes = recoveryCodes
    }
}

public struct PasskeyLoginOptionsDto: Codable, Sendable, Equatable {
    public var challengeId: String
    /// @simplewebauthn request options, passed through opaque.
    public var options: JSONValue

    public init(challengeId: String, options: JSONValue) {
        self.challengeId = challengeId
        self.options = options
    }
}
