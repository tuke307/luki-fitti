import Foundation

// DTOs mirroring `packages/common/src/schemas/social.schemas.ts` (PR 1 part A).

/// Viewer → target relation, resolved server-side. BLOCKED never reaches the client.
public enum SocialRelation: String, Codable, Sendable, Equatable, Hashable {
    case SELF
    case FRIEND
    case INCOMING
    case OUTGOING
    case NONE
    case BLOCKED
}

public enum PushPlatform: String, Codable, Sendable, Equatable, Hashable {
    case APNS
    case WEBPUSH
}

public enum ReportReason: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case SPAM
    case HARASSMENT
    case INAPPROPRIATE_NAME
    case INAPPROPRIATE_AVATAR
    case OTHER
}

public enum SocialNotificationKind: String, Codable, Sendable, Equatable, Hashable {
    case FRIEND_REQUEST
    case FRIEND_ACCEPTED
}

/// The `social` block of `GET /auth/me` — gates the Social tab and push features.
public struct UserSocialDto: Codable, Sendable, Equatable, Hashable {
    public var enabled: Bool
    public var handle: String?
    /// League arena (PR 2); nil for servers predating the field or league-less users.
    public var arena: Arena?

    public init(enabled: Bool, handle: String? = nil, arena: Arena? = nil) {
        self.enabled = enabled
        self.handle = handle
        self.arena = arena
    }
}

public struct SocialProfileDto: Codable, Sendable, Equatable, Hashable {
    public var handle: String?
    public var name: String?
    public var avatarUrl: String?
    public var discoverableByEmail: Bool
    public var socialPaused: Bool
    /// ISO date until which the handle is locked (nil = changeable now).
    public var handleChangeAvailableAt: String?

    public init(
        handle: String? = nil,
        name: String? = nil,
        avatarUrl: String? = nil,
        discoverableByEmail: Bool = true,
        socialPaused: Bool = false,
        handleChangeAvailableAt: String? = nil
    ) {
        self.handle = handle
        self.name = name
        self.avatarUrl = avatarUrl
        self.discoverableByEmail = discoverableByEmail
        self.socialPaused = socialPaused
        self.handleChangeAvailableAt = handleChangeAvailableAt
    }
}

public struct UpdateSocialProfileDto: Encodable, Sendable {
    public var handle: String?
    public var name: String?
    public var discoverableByEmail: Bool?
    public var socialPaused: Bool?

    public init(handle: String? = nil, name: String? = nil, discoverableByEmail: Bool? = nil, socialPaused: Bool? = nil) {
        self.handle = handle
        self.name = name
        self.discoverableByEmail = discoverableByEmail
        self.socialPaused = socialPaused
    }
}

public enum HandleUnavailableReason: String, Codable, Sendable, Equatable, Hashable {
    case invalid
    case reserved
    case blocked
    case taken
}

public struct HandleAvailabilityDto: Codable, Sendable, Equatable, Hashable {
    public var available: Bool
    public var reason: HandleUnavailableReason?
}

/// Public card — the only shape strangers ever see. `name` is friends/self-only.
public struct SocialCardDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var userId: String
    public var handle: String
    public var avatarUrl: String?
    public var name: String?

    public var id: String { userId }

    public init(userId: String, handle: String, avatarUrl: String? = nil, name: String? = nil) {
        self.userId = userId
        self.handle = handle
        self.avatarUrl = avatarUrl
        self.name = name
    }
}

public struct SocialUserDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var userId: String
    public var handle: String
    public var avatarUrl: String?
    public var name: String?
    public var relation: SocialRelation

    public var id: String { userId }

    public init(userId: String, handle: String, avatarUrl: String? = nil, name: String? = nil, relation: SocialRelation) {
        self.userId = userId
        self.handle = handle
        self.avatarUrl = avatarUrl
        self.name = name
        self.relation = relation
    }
}

public struct FriendListsDto: Codable, Sendable, Equatable {
    public var friends: [SocialCardDto]
    public var incoming: [SocialCardDto]
    public var outgoing: [SocialCardDto]

    public init(friends: [SocialCardDto] = [], incoming: [SocialCardDto] = [], outgoing: [SocialCardDto] = []) {
        self.friends = friends
        self.incoming = incoming
        self.outgoing = outgoing
    }
}

public struct FriendInviteDto: Codable, Sendable, Equatable {
    public var url: String
    public var expiresAt: String
}

public struct PushConfigDto: Codable, Sendable, Equatable {
    public var webPushPublicKey: String?
    public var apnsConfigured: Bool
}

public struct PushPreferencesDto: Codable, Sendable, Equatable {
    public var friends: Bool
    /// League outcomes + reminders (PR 2); defaults true when the server omits it.
    public var leagues: Bool

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        friends = try c.decode(Bool.self, forKey: .friends)
        leagues = try c.decodeIfPresent(Bool.self, forKey: .leagues) ?? true
    }

    public init(friends: Bool, leagues: Bool = true) {
        self.friends = friends
        self.leagues = leagues
    }
}

public struct UpdatePushPreferencesDto: Encodable, Sendable {
    public var friends: Bool?
    public var leagues: Bool?
    public init(friends: Bool? = nil, leagues: Bool? = nil) {
        self.friends = friends
        self.leagues = leagues
    }
}

public struct RegisterPushDeviceDto: Encodable, Sendable {
    public var platform: PushPlatform
    /// APNs hex token or Web Push endpoint URL.
    public var token: String
    public var apnsSandbox: Bool
    public var locale: String
    public var timeZone: String

    public init(platform: PushPlatform, token: String, apnsSandbox: Bool, locale: String, timeZone: String) {
        self.platform = platform
        self.token = token
        self.apnsSandbox = apnsSandbox
        self.locale = locale
        self.timeZone = timeZone
    }
}

public struct SocialNotificationDto: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    /// Kept as String so kinds added by newer server versions don't break decoding.
    public var kind: String
    /// Resolved actor card; nil for system notifications or blocked/deleted actors.
    public var actor: SocialCardDto?
    /// String-valued payload entries only (`url` today); non-string values are dropped.
    public var payload: [String: String]
    public var readAt: String?
    public var createdAt: String

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try c.decode(String.self, forKey: .kind)
        actor = try c.decodeIfPresent(SocialCardDto.self, forKey: .actor)
        readAt = try c.decodeIfPresent(String.self, forKey: .readAt)
        createdAt = try c.decode(String.self, forKey: .createdAt)
        let raw = try c.decodeIfPresent([String: JSONValue].self, forKey: .payload) ?? [:]
        payload = raw.compactMapValues { value in
            if case .string(let s) = value { return s }
            return nil
        }
    }

    /// Minimal lossy JSON value for forward-compatible payload decoding.
    private enum JSONValue: Codable {
        case string(String)
        case other

        init(from decoder: Decoder) throws {
            let c = try decoder.singleValueContainer()
            if let s = try? c.decode(String.self) { self = .string(s) } else { self = .other }
        }

        func encode(to encoder: Encoder) throws {
            var c = encoder.singleValueContainer()
            if case .string(let s) = self { try c.encode(s) } else { try c.encodeNil() }
        }
    }
}

public struct NotificationListDto: Codable, Sendable, Equatable {
    public var items: [SocialNotificationDto]
    public var unreadCount: Int
    public var nextCursor: String?
}
