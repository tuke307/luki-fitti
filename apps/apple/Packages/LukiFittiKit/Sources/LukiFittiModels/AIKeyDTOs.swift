import Foundation

// MARK: - Per-user OpenRouter key (bring-your-own-key)
//
// The key is write-only: it is sent once to `PUT /api/ai/key`, stored encrypted by the API and
// never returned. Responses only carry this status. Never persist the key on device.

/// Who provided the OpenRouter key used for AI runs.
public enum AiKeySlot: String, Codable, Sendable, Equatable, Hashable {
    /// The user's own key (no grant or daily limit needed).
    case USER
    /// Assigned by an admin (grants and daily limit apply).
    case ADMIN
}

public struct AiKeySlotStatusDto: Codable, Sendable, Equatable, Hashable {
    /// Last 4 characters of the key, shown as "…abcd".
    public var last4: String
    public var updatedAt: String

    public init(last4: String, updatedAt: String) {
        self.last4 = last4
        self.updatedAt = updatedAt
    }
}

public struct AiKeyStatusDto: Codable, Sendable, Equatable, Hashable {
    /// Whether the server can store keys at all.
    public var available: Bool
    public var hasKey: Bool
    /// Key used for runs (own key wins); nil without a key.
    public var source: AiKeySlot?
    /// The user's own key, if set.
    public var own: AiKeySlotStatusDto?
    /// Whether an admin assigned a key (its value/hint is never shown to the user).
    public var adminAssigned: Bool

    public init(
        available: Bool,
        hasKey: Bool,
        source: AiKeySlot?,
        own: AiKeySlotStatusDto?,
        adminAssigned: Bool
    ) {
        self.available = available
        self.hasKey = hasKey
        self.source = source
        self.own = own
        self.adminAssigned = adminAssigned
    }
}

public struct SetAiKeyDto: Encodable, Sendable {
    public var apiKey: String

    public init(apiKey: String) {
        self.apiKey = apiKey
    }

    /// Same rule as the API (`sk-or-` + 20–200 URL-safe characters); checked before sending.
    public static func isValidFormat(_ raw: String) -> Bool {
        let key = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard key.hasPrefix("sk-or-") else { return false }
        let rest = key.dropFirst("sk-or-".count)
        guard (20...200).contains(rest.count) else { return false }
        return rest.allSatisfy { ch in
            ch.isASCII && (ch.isLetter || ch.isNumber || ch == "_" || ch == "-")
        }
    }
}
