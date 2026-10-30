import Foundation

// MARK: - Nutrition (mirrors packages/common/src/schemas/nutrition.schemas.ts)

public struct NutritionTotalsDto: Codable, Sendable, Equatable, Hashable {
    public var kcal: Double
    public var proteinG: Double
    public var carbsG: Double
    public var fatG: Double

    public init(kcal: Double = 0, proteinG: Double = 0, carbsG: Double = 0, fatG: Double = 0) {
        self.kcal = kcal
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
    }
}

public struct MealItemDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var orderIndex: Int
    public var name: String
    public var grams: Double?
    public var kcal: Double
    public var proteinG: Double
    public var carbsG: Double
    public var fatG: Double
    public var fiberG: Double?
    public var sugarG: Double?
    public var source: FoodItemSource
    public var confidence: Double?

    public init(
        id: String = UUID().uuidString,
        orderIndex: Int = 0,
        name: String,
        grams: Double? = nil,
        kcal: Double = 0,
        proteinG: Double = 0,
        carbsG: Double = 0,
        fatG: Double = 0,
        fiberG: Double? = nil,
        sugarG: Double? = nil,
        source: FoodItemSource = .MANUAL,
        confidence: Double? = nil
    ) {
        self.id = id
        self.orderIndex = orderIndex
        self.name = name
        self.grams = grams
        self.kcal = kcal
        self.proteinG = proteinG
        self.carbsG = carbsG
        self.fatG = fatG
        self.fiberG = fiberG
        self.sugarG = sugarG
        self.source = source
        self.confidence = confidence
    }
}

public struct MealPhotoDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var mimeType: String
    public var width: Int?
    public var height: Int?
    public var createdAt: String
    /// Authenticated API path (`/api/nutrition/photos/:id`); load it with the bearer token.
    public var url: String?
}

public struct MealEntryDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var clientEntryId: String
    public var eatenAt: String
    public var mealType: MealType
    public var label: String?
    public var notes: String?
    public var createdAt: String
    public var updatedAt: String
    public var items: [MealItemDto]
    public var photos: [MealPhotoDto]
    public var totals: NutritionTotalsDto

    public init(
        id: String,
        clientEntryId: String,
        eatenAt: String,
        mealType: MealType,
        label: String? = nil,
        notes: String? = nil,
        createdAt: String = ISO8601DateFormatter().string(from: Date()),
        updatedAt: String = ISO8601DateFormatter().string(from: Date()),
        items: [MealItemDto] = [],
        photos: [MealPhotoDto] = [],
        totals: NutritionTotalsDto = NutritionTotalsDto()
    ) {
        self.id = id
        self.clientEntryId = clientEntryId
        self.eatenAt = eatenAt
        self.mealType = mealType
        self.label = label
        self.notes = notes
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.items = items
        self.photos = photos
        self.totals = totals
    }
}

public struct MealItemInputDto: Codable, Sendable, Equatable, Hashable {
    public var name: String
    public var grams: Double?
    public var kcal: Double
    public var proteinG: Double
    public var carbsG: Double
    public var fatG: Double
    public var fiberG: Double?
    public var sugarG: Double?
    public var source: FoodItemSource
    public var confidence: Double?

    public init(_ item: MealItemDto) {
        self.name = item.name
        self.grams = item.grams
        self.kcal = item.kcal
        self.proteinG = item.proteinG
        self.carbsG = item.carbsG
        self.fatG = item.fatG
        self.fiberG = item.fiberG
        self.sugarG = item.sugarG
        self.source = item.source
        self.confidence = item.confidence
    }
}

public struct UpsertMealEntryDto: Codable, Sendable, Equatable, Hashable {
    public var clientEntryId: String
    public var eatenAt: String
    public var mealType: MealType
    public var label: String?
    public var notes: String?
    public var items: [MealItemInputDto]

    public init(
        clientEntryId: String,
        eatenAt: String,
        mealType: MealType,
        label: String? = nil,
        notes: String? = nil,
        items: [MealItemInputDto]
    ) {
        self.clientEntryId = clientEntryId
        self.eatenAt = eatenAt
        self.mealType = mealType
        self.label = label
        self.notes = notes
        self.items = items
    }
}

// MARK: - AI (mirrors packages/common/src/schemas/ai.schemas.ts)

public struct WorkoutBuilderRequestDto: Codable, Sendable, Equatable {
    public var prompt: String
    public var durationMinutes: Int?

    public init(prompt: String, durationMinutes: Int? = nil) {
        self.prompt = prompt
        self.durationMinutes = durationMinutes
    }
}

public struct WorkoutProposalRefDto: Codable, Sendable, Equatable, Hashable {
    public var exerciseId: String
    public var name: String
}

public struct WorkoutProposalExerciseDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String { exerciseId }
    public var exerciseId: String
    public var name: String
    public var primaryMuscleGroup: MuscleGroup
    public var equipment: EquipmentType
    public var warmupSets: Int
    public var workingSets: Int
    public var repsMin: Int
    public var repsMax: Int
    public var restSeconds: Int
    public var rationale: String
    public var replaces: WorkoutProposalRefDto?
    public var alternatives: [WorkoutProposalRefDto]
}

public struct WorkoutBuilderResponseDto: Codable, Sendable, Equatable, Hashable {
    public var runId: String
    public var name: String
    public var summary: String
    public var focusMuscleGroups: [MuscleGroup]
    public var estimatedDurationMinutes: Int
    public var exercises: [WorkoutProposalExerciseDto]
    public var notes: [String]
    public var droppedExerciseIds: [String]
    public var usage: AiRunUsageDto?
}

public struct MealAnalysisSummaryDto: Codable, Sendable, Equatable, Hashable {
    public var containsFood: Bool
    public var uncertaintyNote: String
}

public struct MealAnalysisResponseDto: Codable, Sendable, Equatable, Hashable {
    public var runId: String
    public var entry: MealEntryDto
    public var analysis: MealAnalysisSummaryDto
    public var photosStored: Bool
    public var usage: AiRunUsageDto?
}

/// Tokens and the OpenRouter cost in USD (as reported, no conversion; `nil` when unknown).
public struct AiRunUsageDto: Codable, Sendable, Equatable, Hashable {
    public var promptTokens: Int
    public var completionTokens: Int
    public var costUsd: Double?
    public var totalTokens: Int { promptTokens + completionTokens }

    public init(promptTokens: Int, completionTokens: Int, costUsd: Double?) {
        self.promptTokens = promptTokens
        self.completionTokens = completionTokens
        self.costUsd = costUsd
    }
}

public struct AiUsageSkillDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String { skill }
    public var skill: String
    public var runs: Int
    public var costUsd: Double
}

public struct AiUsageDayDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String { date }
    /// UTC calendar day, `yyyy-MM-dd`.
    public var date: String
    public var runs: Int
    public var costUsd: Double
}

public struct AiUsageRunDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var skill: String
    public var status: String
    public var createdAt: String
    public var promptTokens: Int
    public var completionTokens: Int
    public var costUsd: Double?
    public var durationMs: Int
    public var failed: Bool { status == "ERROR" }
    public var usage: AiRunUsageDto {
        AiRunUsageDto(promptTokens: promptTokens, completionTokens: completionTokens, costUsd: costUsd)
    }
}

public struct AiUsageQuotaDto: Codable, Sendable, Equatable, Hashable {
    public var used: Int
    public var limit: Int
}

/// `GET /api/ai/usage/me` (mirrors `MyAiUsageDto` in packages/common/src/schemas/ai.schemas.ts).
public struct MyAiUsageDto: Codable, Sendable, Equatable, Hashable {
    public var days: Int
    public var totalRuns: Int
    public var failedRuns: Int
    public var promptTokens: Int
    public var completionTokens: Int
    public var costUsd: Double
    public var unknownCostRuns: Int
    public var bySkill: [AiUsageSkillDto]
    public var byDay: [AiUsageDayDto]
    public var recent: [AiUsageRunDto]
    public var today: AiUsageQuotaDto
}

public struct ExerciseFeedbackDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String { exerciseId }
    public var exerciseId: String
    public var exerciseName: String
    public var verdict: ExerciseFeedbackVerdict
    public var note: String?
    public var updatedAt: String
}

// MARK: - Dates

public enum LukiISODate {
    // ISO8601DateFormatter is thread-safe; creating one per call dominated list rendering.
    nonisolated(unsafe) private static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
    nonisolated(unsafe) private static let plain = ISO8601DateFormatter()

    /// Parses API timestamps with or without fractional seconds.
    public static func parse(_ iso: String) -> Date? {
        withFraction.date(from: iso) ?? plain.date(from: iso)
    }

    public static func string(_ date: Date) -> String {
        plain.string(from: date)
    }
}

extension MealEntryDto {
    public var eatenAtDate: Date? { LukiISODate.parse(eatenAt) }
}
