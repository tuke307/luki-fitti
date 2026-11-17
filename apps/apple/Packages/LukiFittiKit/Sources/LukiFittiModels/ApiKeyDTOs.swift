import Foundation

// MARK: - Personal API keys (`lf_pat_…`)
//
// The secret is only shown once on the web at creation; the API and the app only ever see the
// public id, prefix and metadata. Keys are managed on the web — the app lists and revokes them.

public enum ApiKeyStatus: String, Codable, Sendable, Equatable, Hashable {
    case active
    case expired
}

public struct ApiKeyDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    /// 8-char public id (part of the `lf_pat_<id>_<secret>` token).
    public var id: String
    /// Display prefix, e.g. `lf_pat_ab12cd34`.
    public var prefix: String
    public var name: String
    /// Scope strings like `read:sessions`; kept as String so new scopes don't break decoding.
    public var scopes: [String]
    public var createdAt: String
    public var expiresAt: String?
    public var lastUsedAt: String?
    public var status: ApiKeyStatus

    public init(
        id: String,
        prefix: String,
        name: String,
        scopes: [String],
        createdAt: String,
        expiresAt: String?,
        lastUsedAt: String?,
        status: ApiKeyStatus
    ) {
        self.id = id
        self.prefix = prefix
        self.name = name
        self.scopes = scopes
        self.createdAt = createdAt
        self.expiresAt = expiresAt
        self.lastUsedAt = lastUsedAt
        self.status = status
    }
}

public struct ApiKeyListDto: Codable, Sendable, Equatable, Hashable {
    /// Server-side kill switch. When false, new keys can't be created but existing ones can
    /// still be revoked.
    public var enabled: Bool
    public var keys: [ApiKeyDto]

    public init(enabled: Bool, keys: [ApiKeyDto]) {
        self.enabled = enabled
        self.keys = keys
    }
}
