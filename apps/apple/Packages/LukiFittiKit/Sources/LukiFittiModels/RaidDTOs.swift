import Foundation

// DTOs mirroring `packages/common/src/schemas/raid.schemas.ts` (PR 4 part A).

public enum RaidKind: String, Codable, Sendable, Equatable, Hashable {
    case COMMUNITY
    case SQUAD
}

public enum RaidStatus: String, Codable, Sendable, Equatable, Hashable {
    case ACTIVE
    case DEFEATED
    case ESCAPED
}

public enum RaidDifficulty: String, Codable, Sendable, Equatable, Hashable, CaseIterable {
    case NORMAL
    case HARD
    case HEROIC
}

public enum SquadRole: String, Codable, Sendable, Equatable, Hashable {
    case OWNER
    case MEMBER
}

// MARK: - Raids

public struct RaidDto: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var kind: RaidKind
    /// Only for SQUAD raids.
    public var squad: SquadRef?
    public var bossSlug: String
    /// Only for SQUAD raids.
    public var difficulty: RaidDifficulty?
    public var weekKey: String
    public var endsAt: String
    public var maxHp: Int
    public var damage: Int
    /// 0–3 enrage thresholds crossed (75/50/25 % HP).
    public var phase: Int
    public var status: RaidStatus
    public var defeatedAt: String?
    /// The caller's total damage in this raid.
    public var yourDamage: Int
    /// Hitter who landed the final blow, once DEFEATED.
    public var finalBlow: SocialCardDto?

    public struct SquadRef: Codable, Sendable, Equatable, Hashable {
        public var id: String
        public var name: String
    }

    /// HP left as 0–1 for the bar/ring.
    public var hpFraction: Double {
        maxHp > 0 ? max(0, 1 - Double(damage) / Double(maxHp)) : 0
    }

    /// The effective enrage phase: the stored phase or the derived one from raw
    /// damage, whichever is further along (mirrors the web `effectivePhase`).
    public var effectivePhase: Int {
        max(phase, RaidBossMath.raidPhaseFor(damage: damage, maxHp: maxHp))
    }

    public init(
        id: String,
        kind: RaidKind,
        squad: SquadRef? = nil,
        bossSlug: String,
        difficulty: RaidDifficulty? = nil,
        weekKey: String,
        endsAt: String,
        maxHp: Int,
        damage: Int,
        phase: Int,
        status: RaidStatus,
        defeatedAt: String? = nil,
        yourDamage: Int,
        finalBlow: SocialCardDto? = nil
    ) {
        self.id = id
        self.kind = kind
        self.squad = squad
        self.bossSlug = bossSlug
        self.difficulty = difficulty
        self.weekKey = weekKey
        self.endsAt = endsAt
        self.maxHp = maxHp
        self.damage = damage
        self.phase = phase
        self.status = status
        self.defeatedAt = defeatedAt
        self.yourDamage = yourDamage
        self.finalBlow = finalBlow
    }
}

public enum RaidOutcome: String, Codable, Sendable, Equatable, Hashable {
    case DEFEATED
    case ESCAPED
}

public struct RaidResultDto: Codable, Sendable, Equatable, Identifiable {
    public var raidId: String
    public var outcome: RaidOutcome
    public var bossSlug: String
    public var bossName: String
    /// 1–3 for crowned participants, nil otherwise.
    public var crownRank: Int?
    public var finalBlow: Bool
    /// The caller's total damage in that raid.
    public var you: Int

    public var id: String { raidId }

    public init(
        raidId: String,
        outcome: RaidOutcome,
        bossSlug: String,
        bossName: String,
        crownRank: Int? = nil,
        finalBlow: Bool,
        you: Int
    ) {
        self.raidId = raidId
        self.outcome = outcome
        self.bossSlug = bossSlug
        self.bossName = bossName
        self.crownRank = crownRank
        self.finalBlow = finalBlow
        self.you = you
    }
}

public struct RaidListDto: Codable, Sendable, Equatable {
    public var community: RaidDto?
    public var squads: [RaidDto]
    /// Finished raids the caller participated in and has not seen yet.
    public var pendingResults: [RaidResultDto]

    public init(community: RaidDto? = nil, squads: [RaidDto] = [], pendingResults: [RaidResultDto] = []) {
        self.community = community
        self.squads = squads
        self.pendingResults = pendingResults
    }
}

public struct RaidTopEntryDto: Codable, Sendable, Equatable {
    public var card: SocialCardDto
    public var damage: Int
    public var rank: Int

    public init(card: SocialCardDto, damage: Int, rank: Int) {
        self.card = card
        self.damage = damage
        self.rank = rank
    }
}

public struct RaidDetailDto: Codable, Sendable, Equatable {
    public var id: String
    public var kind: RaidKind
    public var squad: RaidDto.SquadRef?
    public var bossSlug: String
    public var difficulty: RaidDifficulty?
    public var weekKey: String
    public var endsAt: String
    public var maxHp: Int
    public var damage: Int
    public var phase: Int
    public var status: RaidStatus
    public var defeatedAt: String?
    public var yourDamage: Int
    public var finalBlow: SocialCardDto?
    public var top: [RaidTopEntryDto]
    public var you: You

    public struct You: Codable, Sendable, Equatable {
        public var damage: Int
        public var rank: Int?
        public var trophies: Int

        public init(damage: Int, rank: Int? = nil, trophies: Int) {
            self.damage = damage
            self.rank = rank
            self.trophies = trophies
        }
    }

    public init(
        id: String,
        kind: RaidKind,
        squad: RaidDto.SquadRef? = nil,
        bossSlug: String,
        difficulty: RaidDifficulty? = nil,
        weekKey: String,
        endsAt: String,
        maxHp: Int,
        damage: Int,
        phase: Int,
        status: RaidStatus,
        defeatedAt: String? = nil,
        yourDamage: Int,
        finalBlow: SocialCardDto? = nil,
        top: [RaidTopEntryDto],
        you: You
    ) {
        self.id = id
        self.kind = kind
        self.squad = squad
        self.bossSlug = bossSlug
        self.difficulty = difficulty
        self.weekKey = weekKey
        self.endsAt = endsAt
        self.maxHp = maxHp
        self.damage = damage
        self.phase = phase
        self.status = status
        self.defeatedAt = defeatedAt
        self.yourDamage = yourDamage
        self.finalBlow = finalBlow
        self.top = top
        self.you = you
    }
}

public struct RaidFeedHitDto: Codable, Sendable, Equatable {
    public var card: SocialCardDto
    public var damage: Int
    public var weakSpotDamage: Int
    /// Only for SELF/FRIEND hits — strangers never see workout content.
    public var topExercise: String?
    public var at: String

    public init(card: SocialCardDto, damage: Int, weakSpotDamage: Int, topExercise: String? = nil, at: String) {
        self.card = card
        self.damage = damage
        self.weakSpotDamage = weakSpotDamage
        self.topExercise = topExercise
        self.at = at
    }
}

public struct RaidFeedDto: Codable, Sendable, Equatable {
    public var items: [RaidFeedHitDto]
    public var nextCursor: String?
}

public struct RaidBossDto: Codable, Sendable, Equatable {
    public var slug: String
    public var name: RaidBossRecipe.Localized
    public var lore: RaidBossRecipe.Localized
    public var weakTo: [String]
}

// MARK: - Squads

public struct SquadMemberDto: Codable, Sendable, Equatable {
    public var card: SocialCardDto
    public var role: SquadRole
    public var joinedAt: String
}

public struct SquadInviteDto: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var squadId: String
    public var squadName: String
    public var invitedBy: SocialCardDto
    public var createdAt: String
}

public struct SquadDto: Codable, Sendable, Equatable, Identifiable {
    public var id: String
    public var name: String
    public var role: SquadRole
    public var members: [SquadMemberDto]
}

public struct SquadListDto: Codable, Sendable, Equatable {
    public var squads: [SquadDto]
    /// Invites addressed to the caller.
    public var invites: [SquadInviteDto]
}

// MARK: - Watch

/// The community raid worth glancing at, pushed inside `SocialWatchSnapshot`.
public struct RaidWatchSnapshot: Codable, Sendable, Equatable {
    public var bossSlug: String
    public var hpFraction: Double
    public var phase: Int
    public var endsAt: String

    public init(bossSlug: String, hpFraction: Double, phase: Int, endsAt: String) {
        self.bossSlug = bossSlug
        self.hpFraction = hpFraction
        self.phase = phase
        self.endsAt = endsAt
    }
}
