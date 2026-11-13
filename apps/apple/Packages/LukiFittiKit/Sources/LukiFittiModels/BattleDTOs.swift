import Foundation

// DTOs mirroring `packages/common/src/schemas/battle.schemas.ts` (PR 3 part A).

public enum DuelStatus: String, Codable, Sendable, Equatable, Hashable {
    case PENDING
    case ACTIVE
    case COMPLETED
    case DECLINED
    case CANCELLED
    case EXPIRED
}

public enum DuelOutcome: String, Codable, Sendable, Equatable, Hashable {
    case WON
    case LOST
    case TIE
}

public enum FriendStreakStatus: String, Codable, Sendable, Equatable, Hashable {
    case PENDING
    case ACTIVE
}

public enum TrophyKind: String, Codable, Sendable, Equatable, Hashable {
    case DUEL_WIN
}

// MARK: - Duels

public struct DuelItemDto: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var status: DuelStatus
    /// Opponent card under the PR 1 relation rules (duels are friends-only).
    public var opponent: SocialCardDto
    /// Scores from the caller's perspective.
    public var you: Int
    public var them: Int
    /// Whole Berlin days left in the window (including today); nil while PENDING.
    public var daysLeft: Int?
    /// Only for finished (COMPLETED) duels.
    public var outcome: DuelOutcome?
    /// The caller's *SeenAt — nil while the result celebration is pending.
    public var seenAt: String?
    public var startDayKey: String?
    public var endDayKey: String?
    public var createdAt: String

    /// True while the duel is ACTIVE but its Berlin `startDayKey` is still in the future —
    /// the window counts from the next midnight, so "8 d left" should read "starts tomorrow".
    public var startsTomorrow: Bool {
        guard let startDayKey else { return false }
        return startDayKey > Self.berlinTodayKey()
    }

    private static func berlinTodayKey() -> String {
        DuelTime.berlinTodayKey()
    }

    public init(
        id: String,
        status: DuelStatus,
        opponent: SocialCardDto,
        you: Int,
        them: Int,
        daysLeft: Int? = nil,
        outcome: DuelOutcome? = nil,
        seenAt: String? = nil,
        startDayKey: String? = nil,
        endDayKey: String? = nil,
        createdAt: String
    ) {
        self.id = id
        self.status = status
        self.opponent = opponent
        self.you = you
        self.them = them
        self.daysLeft = daysLeft
        self.outcome = outcome
        self.seenAt = seenAt
        self.startDayKey = startDayKey
        self.endDayKey = endDayKey
        self.createdAt = createdAt
    }
}

public struct DuelListDto: Codable, Sendable, Equatable {
    public var active: [DuelItemDto]
    public var incoming: [DuelItemDto]
    public var outgoing: [DuelItemDto]
    /// Last 10 finished duels.
    public var recent: [DuelItemDto]
    /// Latest finished duel whose result the caller has not seen yet.
    public var pendingResult: DuelItemDto?

    public init(
        active: [DuelItemDto] = [],
        incoming: [DuelItemDto] = [],
        outgoing: [DuelItemDto] = [],
        recent: [DuelItemDto] = [],
        pendingResult: DuelItemDto? = nil
    ) {
        self.active = active
        self.incoming = incoming
        self.outgoing = outgoing
        self.recent = recent
        self.pendingResult = pendingResult
    }
}

/// Berlin-day helpers shared by the duel DTOs.
enum DuelTime {
    static func berlinTodayKey() -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.timeZone = TimeZone(identifier: "Europe/Berlin")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: Date())
    }
}

public struct DuelDayPointsDto: Codable, Sendable, Equatable, Identifiable {
    public var dayKey: String
    public var you: Int
    public var them: Int

    public var id: String { dayKey }
}

public struct DuelDetailDto: Codable, Sendable, Equatable {
    public var id: String
    public var status: DuelStatus
    public var opponent: SocialCardDto
    public var you: Int
    public var them: Int
    public var daysLeft: Int?
    public var outcome: DuelOutcome?
    public var seenAt: String?
    public var startDayKey: String?
    public var endDayKey: String?
    public var createdAt: String
    public var days: [DuelDayPointsDto]

    /// Same rule as `DuelItemDto.startsTomorrow` — the window starts at the next Berlin midnight.
    public var startsTomorrow: Bool {
        guard let startDayKey else { return false }
        return startDayKey > DuelTime.berlinTodayKey()
    }
}

// MARK: - Friend streaks

public struct StreakWeekProgressDto: Codable, Sendable, Equatable, Hashable {
    public var done: Int
    public var target: Int

    public init(done: Int, target: Int) {
        self.done = done
        self.target = target
    }
}

public struct FriendStreakDto: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var status: FriendStreakStatus
    public var friend: SocialCardDto
    public var count: Int
    public var longest: Int
    public var freezes: Int
    /// Current-week goal progress for both sides (friends-only visibility).
    public var thisWeek: ThisWeek

    public struct ThisWeek: Codable, Sendable, Equatable, Hashable {
        public var you: StreakWeekProgressDto
        public var them: StreakWeekProgressDto

        public init(you: StreakWeekProgressDto, them: StreakWeekProgressDto) {
            self.you = you
            self.them = them
        }
    }

    public init(
        id: String,
        status: FriendStreakStatus,
        friend: SocialCardDto,
        count: Int,
        longest: Int = 0,
        freezes: Int = 0,
        thisWeek: ThisWeek
    ) {
        self.id = id
        self.status = status
        self.friend = friend
        self.count = count
        self.longest = longest
        self.freezes = freezes
        self.thisWeek = thisWeek
    }
}

public struct StreakListDto: Codable, Sendable, Equatable {
    public var active: [FriendStreakDto]
    public var incoming: [FriendStreakDto]
    public var outgoing: [FriendStreakDto]

    public init(
        active: [FriendStreakDto] = [],
        incoming: [FriendStreakDto] = [],
        outgoing: [FriendStreakDto] = []
    ) {
        self.active = active
        self.incoming = incoming
        self.outgoing = outgoing
    }

    /// The streak touching `friendId`, whichever list it sits in.
    public func streak(with friendId: String) -> FriendStreakDto? {
        (active + incoming + outgoing).first { $0.friend.userId == friendId }
    }
}

// MARK: - Trophies

public struct TrophyDto: Codable, Sendable, Equatable, Identifiable {
    public var kind: TrophyKind
    public var refId: String
    public var tier: String?
    public var createdAt: String

    public var id: String { "\(kind.rawValue)-\(refId)" }

    public init(kind: TrophyKind, refId: String, tier: String? = nil, createdAt: String) {
        self.kind = kind
        self.refId = refId
        self.tier = tier
        self.createdAt = createdAt
    }
}

public struct TrophyListDto: Codable, Sendable, Equatable {
    public var items: [TrophyDto]
    /// kind → count, for the shelf header.
    public var counts: [String: Int]

    public init(items: [TrophyDto] = [], counts: [String: Int] = [:]) {
        self.items = items
        self.counts = counts
    }
}

// MARK: - Watch

/// The one active duel worth glancing at, pushed inside `SocialWatchSnapshot`.
public struct DuelWatchSnapshot: Codable, Sendable, Equatable {
    public var opponentHandle: String
    public var you: Int
    public var them: Int
    public var daysLeft: Int
    /// Window counts from the next Berlin midnight; the row shows "starts tmrw" meanwhile.
    public var startsTomorrow: Bool

    public init(opponentHandle: String, you: Int, them: Int, daysLeft: Int, startsTomorrow: Bool = false) {
        self.opponentHandle = opponentHandle
        self.you = you
        self.them = them
        self.daysLeft = daysLeft
        self.startsTomorrow = startsTomorrow
    }

    /// Tolerates contexts from older iPhones that predate `startsTomorrow`.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        opponentHandle = try c.decode(String.self, forKey: .opponentHandle)
        you = try c.decode(Int.self, forKey: .you)
        them = try c.decode(Int.self, forKey: .them)
        daysLeft = try c.decode(Int.self, forKey: .daysLeft)
        startsTomorrow = try c.decodeIfPresent(Bool.self, forKey: .startsTomorrow) ?? false
    }
}
