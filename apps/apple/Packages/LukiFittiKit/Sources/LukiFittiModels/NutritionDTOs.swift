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
    /// Parses API timestamps with or without fractional seconds.
    public static func parse(_ iso: String) -> Date? {
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return withFraction.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
    }

    public static func string(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }
}

extension MealEntryDto {
    public var eatenAtDate: Date? { LukiISODate.parse(eatenAt) }
}
