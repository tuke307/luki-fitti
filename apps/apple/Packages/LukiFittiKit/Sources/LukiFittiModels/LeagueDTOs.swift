import Foundation

// DTOs mirroring `packages/common/src/schemas/league.schemas.ts` (PR 2 part A).

public enum Arena: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case BRONZE
    case SILVER
    case GOLD
    case PLATINUM
    case DIAMOND
    case OBSIDIAN
    case TITAN

    /// 1-based tier index, used for the badge pips.
    public var tierIndex: Int {
        (Self.allCases.firstIndex(of: self) ?? 0) + 1
    }
}

public enum LeagueStage: String, Codable, Sendable, Equatable, Hashable {
    case FRIENDS
    case GLOBAL
    case ARENAS
}

public enum LeagueOutcome: String, Codable, Sendable, Equatable, Hashable {
    case PROMOTED
    case DEMOTED
    case STAYED
}

public enum LeagueZone: String, Codable, Sendable, Equatable, Hashable {
    case PROMOTE
    case SAFE
    case DEMOTE
}

// MARK: - Points

public struct PointsDayDto: Codable, Sendable, Equatable, Hashable {
    public var dayKey: String
    /// Points earned that day (uncapped).
    public var points: Int
    /// Points counted toward the weekly score after the daily cap.
    public var capped: Int
}

public struct EffortPointsBreakdownDto: Codable, Sendable, Equatable, Hashable {
    public var sets: Int
    public var warmups: Int
    public var prs: Int
    public var cardioMinutes: Int
    public var stretchMinutes: Int
    public var finishBonus: Int
    public var droppedSets: Int
}

public struct PointsSessionDto: Codable, Sendable, Equatable, Hashable {
    public var sessionId: String
    public var workoutName: String
    public var points: Int
    public var breakdown: EffortPointsBreakdownDto
}

public struct PointsWeekDto: Codable, Sendable, Equatable {
    public var weekKey: String
    /// Weekly score: daily-capped points + goal bonus.
    public var points: Int
    public var rawPoints: Int
    public var dailyCap: Int
    public var days: [PointsDayDto]
    public var sessions: [PointsSessionDto]
    public var goal: Goal

    public struct Goal: Codable, Sendable, Equatable {
        public var target: Int
        public var done: Int
        /// Bonus actually earned this week (0 until the goal is reached).
        public var bonus: Int
        /// Bonus that would be earned on reaching the target.
        public var available: Int
    }
}

// MARK: - League

public struct LeagueMemberDto: Codable, Sendable, Equatable, Identifiable {
    public var rank: Int
    public var card: SocialCardDto
    public var points: Int
    public var isSelf: Bool
    public var zone: LeagueZone

    public var id: String { card.userId }
}

public struct LeagueCohortDto: Codable, Sendable, Equatable {
    public var members: [LeagueMemberDto]
    public var promoteCount: Int
    public var demoteCount: Int
}

public struct LeaguePendingResultDto: Codable, Sendable, Equatable, Identifiable {
    public var weekKey: String
    public var outcome: LeagueOutcome
    public var fromArena: Arena
    public var toArena: Arena
    public var rank: Int
    public var points: Int

    public var id: String { weekKey }

    public init(weekKey: String, outcome: LeagueOutcome, fromArena: Arena, toArena: Arena, rank: Int, points: Int) {
        self.weekKey = weekKey
        self.outcome = outcome
        self.fromArena = fromArena
        self.toArena = toArena
        self.rank = rank
        self.points = points
    }
}

public struct LeagueCurrentDto: Codable, Sendable, Equatable {
    public var weekKey: String
    public var stage: LeagueStage
    /// ISO instant the week ends (next Berlin Monday 00:00).
    public var endsAt: String
    public var arena: Arena
    public var cohort: LeagueCohortDto?
    public var pendingResult: LeaguePendingResultDto?

    public init(
        weekKey: String,
        stage: LeagueStage,
        endsAt: String,
        arena: Arena,
        cohort: LeagueCohortDto? = nil,
        pendingResult: LeaguePendingResultDto? = nil
    ) {
        self.weekKey = weekKey
        self.stage = stage
        self.endsAt = endsAt
        self.arena = arena
        self.cohort = cohort
        self.pendingResult = pendingResult
    }
}

public struct LeagueFriendRowDto: Codable, Sendable, Equatable, Identifiable {
    public var rank: Int
    public var card: SocialCardDto
    public var points: Int
    public var isSelf: Bool

    public var id: String { card.userId }
}

/// Compact league state pushed to the watch over WatchConnectivity (≤ ~200 B).
public struct SocialWatchSnapshot: Codable, Sendable, Equatable {
    public var weekPoints: Int
    public var arena: Arena
    public var rank: Int?
    public var cohortSize: Int?
    public var stage: LeagueStage
    /// Active duel, if any (PR 3); nil for older iPhones and quiet weeks.
    public var duel: DuelWatchSnapshot?
    /// Community raid, if any (PR 4); nil for older iPhones.
    public var raid: RaidWatchSnapshot?

    public init(
        weekPoints: Int,
        arena: Arena,
        rank: Int? = nil,
        cohortSize: Int? = nil,
        stage: LeagueStage,
        duel: DuelWatchSnapshot? = nil,
        raid: RaidWatchSnapshot? = nil
    ) {
        self.weekPoints = weekPoints
        self.arena = arena
        self.rank = rank
        self.cohortSize = cohortSize
        self.stage = stage
        self.duel = duel
        self.raid = raid
    }
}

public struct LeagueHistoryEntryDto: Codable, Sendable, Equatable, Identifiable {
    public var weekKey: String
    public var arena: Arena
    public var rank: Int
    public var outcome: LeagueOutcome?
    public var points: Int

    public var id: String { weekKey }
}
