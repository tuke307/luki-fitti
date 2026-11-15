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

/// Every `NotificationKind` the API can emit, in the server's enum order
/// (mirrors `NOTIFICATION_CATEGORIES` in `@luki-fitti/common`).
public enum SocialNotificationKind: String, Codable, Sendable, Equatable, Hashable, CaseIterable {
    case FRIEND_REQUEST
    case FRIEND_ACCEPTED
    case LEAGUE_PROMOTED
    case LEAGUE_DEMOTED
    case LEAGUE_ENDING
    case DUEL_INVITE
    case DUEL_ACCEPTED
    case DUEL_STANDINGS
    case DUEL_RESULT
    case STREAK_INVITE
    case STREAK_STARTED
    case STREAK_REMINDER
    case STREAK_FROZEN
    case STREAK_BROKEN
    case RAID_SPAWNED
    case RAID_PHASE
    case RAID_DEFEATED
    case RAID_ESCAPED
    case SQUAD_INVITE
    case SQUAD_RAID_STARTED
    case FRIEND_PULLED_AHEAD
}

/// The `social` block of `GET /auth/me` — gates the Social tab and push features.
public struct UserSocialDto: Codable, Sendable, Equatable, Hashable {
    public var enabled: Bool
    public var username: String?
    /// League arena (PR 2); nil for servers predating the field or league-less users.
    public var arena: Arena?

    public init(enabled: Bool, username: String? = nil, arena: Arena? = nil) {
        self.enabled = enabled
        self.username = username
        self.arena = arena
    }
}

public struct SocialProfileDto: Codable, Sendable, Equatable, Hashable {
    public var username: String?
    public var name: String?
    public var avatarUrl: String?
    public var discoverableByEmail: Bool
    public var socialPaused: Bool
    /// ISO date until which the username is locked (nil = changeable now).
    public var usernameChangeAvailableAt: String?

    public init(
        username: String? = nil,
        name: String? = nil,
        avatarUrl: String? = nil,
        discoverableByEmail: Bool = true,
        socialPaused: Bool = false,
        usernameChangeAvailableAt: String? = nil
    ) {
        self.username = username
        self.name = name
        self.avatarUrl = avatarUrl
        self.discoverableByEmail = discoverableByEmail
        self.socialPaused = socialPaused
        self.usernameChangeAvailableAt = usernameChangeAvailableAt
    }
}

public struct UpdateSocialProfileDto: Encodable, Sendable {
    public var username: String?
    public var name: String?
    public var discoverableByEmail: Bool?
    public var socialPaused: Bool?

    public init(username: String? = nil, name: String? = nil, discoverableByEmail: Bool? = nil, socialPaused: Bool? = nil) {
        self.username = username
        self.name = name
        self.discoverableByEmail = discoverableByEmail
        self.socialPaused = socialPaused
    }
}

public enum UsernameUnavailableReason: String, Codable, Sendable, Equatable, Hashable {
    case invalid
    case reserved
    case blocked
    case taken
}

public struct UsernameAvailabilityDto: Codable, Sendable, Equatable, Hashable {
    public var available: Bool
    public var reason: UsernameUnavailableReason?
}

/// Public card — the only shape strangers ever see. `name` is friends/self-only.
public struct SocialCardDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var userId: String
    public var username: String
    public var avatarUrl: String?
    public var name: String?

    public var id: String { userId }

    public init(userId: String, username: String, avatarUrl: String? = nil, name: String? = nil) {
        self.userId = userId
        self.username = username
        self.avatarUrl = avatarUrl
        self.name = name
    }
}

public struct SocialUserDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var userId: String
    public var username: String
    public var avatarUrl: String?
    public var name: String?
    public var relation: SocialRelation

    public var id: String { userId }

    public init(userId: String, username: String, avatarUrl: String? = nil, name: String? = nil, relation: SocialRelation) {
        self.userId = userId
        self.username = username
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
    /// Duel invites/results (PR 3) and raid phase/defeat pushes (PR 4); all
    /// default true when the server omits them.
    public var duels: Bool
    public var streaks: Bool
    public var raids: Bool
    /// Friend-pulls-ahead nudges; defaults true when the server omits it.
    public var nudges: Bool
    /// Kinds muted individually inside an enabled category.
    public var disabledKinds: [String]

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        friends = try c.decode(Bool.self, forKey: .friends)
        leagues = try c.decodeIfPresent(Bool.self, forKey: .leagues) ?? true
        duels = try c.decodeIfPresent(Bool.self, forKey: .duels) ?? true
        streaks = try c.decodeIfPresent(Bool.self, forKey: .streaks) ?? true
        raids = try c.decodeIfPresent(Bool.self, forKey: .raids) ?? true
        nudges = try c.decodeIfPresent(Bool.self, forKey: .nudges) ?? true
        disabledKinds = try c.decodeIfPresent([String].self, forKey: .disabledKinds) ?? []
    }

    public init(
        friends: Bool,
        leagues: Bool = true,
        duels: Bool = true,
        streaks: Bool = true,
        raids: Bool = true,
        nudges: Bool = true,
        disabledKinds: [String] = []
    ) {
        self.friends = friends
        self.leagues = leagues
        self.duels = duels
        self.streaks = streaks
        self.raids = raids
        self.nudges = nudges
        self.disabledKinds = disabledKinds
    }
}

public struct UpdatePushPreferencesDto: Encodable, Sendable {
    public var friends: Bool?
    public var leagues: Bool?
    public var duels: Bool?
    public var streaks: Bool?
    public var raids: Bool?
    public var nudges: Bool?
    public var disabledKinds: [String]?
    public init(
        friends: Bool? = nil,
        leagues: Bool? = nil,
        duels: Bool? = nil,
        streaks: Bool? = nil,
        raids: Bool? = nil,
        nudges: Bool? = nil,
        disabledKinds: [String]? = nil
    ) {
        self.friends = friends
        self.leagues = leagues
        self.duels = duels
        self.streaks = streaks
        self.raids = raids
        self.nudges = nudges
        self.disabledKinds = disabledKinds
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
    /// Server-rendered copy in the requested UI locale (falls back to the kind
    /// when servers predate the fields).
    public var title: String
    public var body: String
    public var readAt: String?
    public var createdAt: String

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        kind = try c.decode(String.self, forKey: .kind)
        actor = try c.decodeIfPresent(SocialCardDto.self, forKey: .actor)
        title = try c.decodeIfPresent(String.self, forKey: .title) ?? kind
        body = try c.decodeIfPresent(String.self, forKey: .body) ?? ""
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

/// One actionable line on the social hub — the server picks, clients render.
public enum NextMoveDto: Codable, Sendable, Equatable {
    case friendRequests(count: Int)
    case duelInvite(duelId: String, actor: SocialCardDto)
    case streakInvite(streakId: String, actor: SocialCardDto)
    case squadInvite(squadName: String, actor: SocialCardDto)
    case friendAhead(actor: SocialCardDto, them: Int, you: Int)
    case duelBehind(duelId: String, actor: SocialCardDto, you: Int, them: Int, daysLeft: Int)
    case leagueDemotion(arena: Arena)
    case raidNoDamage(bossSlug: String)

    private enum Kind: String, Codable {
        case FRIEND_REQUESTS, DUEL_INVITE, STREAK_INVITE, SQUAD_INVITE
        case FRIEND_AHEAD, DUEL_BEHIND, LEAGUE_DEMOTION, RAID_NO_DAMAGE
    }

    private enum CodingKeys: String, CodingKey {
        case kind, count, duelId, streakId, squadName, actor, them, you, daysLeft, arena, bossSlug
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(Kind.self, forKey: .kind) {
        case .FRIEND_REQUESTS:
            self = .friendRequests(count: try c.decode(Int.self, forKey: .count))
        case .DUEL_INVITE:
            self = .duelInvite(
                duelId: try c.decode(String.self, forKey: .duelId),
                actor: try c.decode(SocialCardDto.self, forKey: .actor)
            )
        case .STREAK_INVITE:
            self = .streakInvite(
                streakId: try c.decode(String.self, forKey: .streakId),
                actor: try c.decode(SocialCardDto.self, forKey: .actor)
            )
        case .SQUAD_INVITE:
            self = .squadInvite(
                squadName: try c.decode(String.self, forKey: .squadName),
                actor: try c.decode(SocialCardDto.self, forKey: .actor)
            )
        case .FRIEND_AHEAD:
            self = .friendAhead(
                actor: try c.decode(SocialCardDto.self, forKey: .actor),
                them: try c.decode(Int.self, forKey: .them),
                you: try c.decode(Int.self, forKey: .you)
            )
        case .DUEL_BEHIND:
            self = .duelBehind(
                duelId: try c.decode(String.self, forKey: .duelId),
                actor: try c.decode(SocialCardDto.self, forKey: .actor),
                you: try c.decode(Int.self, forKey: .you),
                them: try c.decode(Int.self, forKey: .them),
                daysLeft: try c.decode(Int.self, forKey: .daysLeft)
            )
        case .LEAGUE_DEMOTION:
            self = .leagueDemotion(arena: try c.decode(Arena.self, forKey: .arena))
        case .RAID_NO_DAMAGE:
            self = .raidNoDamage(bossSlug: try c.decode(String.self, forKey: .bossSlug))
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .friendRequests(let count):
            try c.encode(Kind.FRIEND_REQUESTS, forKey: .kind)
            try c.encode(count, forKey: .count)
        case .duelInvite(let duelId, let actor):
            try c.encode(Kind.DUEL_INVITE, forKey: .kind)
            try c.encode(duelId, forKey: .duelId)
            try c.encode(actor, forKey: .actor)
        case .streakInvite(let streakId, let actor):
            try c.encode(Kind.STREAK_INVITE, forKey: .kind)
            try c.encode(streakId, forKey: .streakId)
            try c.encode(actor, forKey: .actor)
        case .squadInvite(let squadName, let actor):
            try c.encode(Kind.SQUAD_INVITE, forKey: .kind)
            try c.encode(squadName, forKey: .squadName)
            try c.encode(actor, forKey: .actor)
        case .friendAhead(let actor, let them, let you):
            try c.encode(Kind.FRIEND_AHEAD, forKey: .kind)
            try c.encode(actor, forKey: .actor)
            try c.encode(them, forKey: .them)
            try c.encode(you, forKey: .you)
        case .duelBehind(let duelId, let actor, let you, let them, let daysLeft):
            try c.encode(Kind.DUEL_BEHIND, forKey: .kind)
            try c.encode(duelId, forKey: .duelId)
            try c.encode(actor, forKey: .actor)
            try c.encode(you, forKey: .you)
            try c.encode(them, forKey: .them)
            try c.encode(daysLeft, forKey: .daysLeft)
        case .leagueDemotion(let arena):
            try c.encode(Kind.LEAGUE_DEMOTION, forKey: .kind)
            try c.encode(arena, forKey: .arena)
        case .raidNoDamage(let bossSlug):
            try c.encode(Kind.RAID_NO_DAMAGE, forKey: .kind)
            try c.encode(bossSlug, forKey: .bossSlug)
        }
    }
}

public struct FriendWeekDto: Codable, Sendable, Equatable {
    public var card: SocialCardDto
    public var workouts: Int

    public init(card: SocialCardDto, workouts: Int) {
        self.card = card
        self.workouts = workouts
    }
}

public struct SocialSummaryWeekDto: Codable, Sendable, Equatable {
    public var workouts: Int
    public var goal: Int
    public var points: Int

    public init(workouts: Int, goal: Int, points: Int) {
        self.workouts = workouts
        self.goal = goal
        self.points = points
    }
}

public struct SocialSummaryDto: Codable, Sendable, Equatable {
    public var week: SocialSummaryWeekDto?
    public var badge: Int
    public var nextMove: NextMoveDto?
    public var friendsWeek: [FriendWeekDto]

    public init(
        week: SocialSummaryWeekDto? = nil,
        badge: Int = 0,
        nextMove: NextMoveDto? = nil,
        friendsWeek: [FriendWeekDto] = []
    ) {
        self.week = week
        self.badge = badge
        self.nextMove = nextMove
        self.friendsWeek = friendsWeek
    }
}
