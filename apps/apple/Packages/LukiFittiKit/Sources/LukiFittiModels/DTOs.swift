import Foundation

// MARK: - Auth & User DTOs

public struct AuthTokensDto: Codable, Sendable, Equatable, Hashable {
    public var accessToken: String
    public var refreshToken: String
    public var expiresAt: String

    public init(accessToken: String, refreshToken: String, expiresAt: String) {
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.expiresAt = expiresAt
    }
}

public struct UserPreferencesDto: Codable, Sendable, Equatable, Hashable {
    public var id: String
    public var userId: String
    public var weightUnit: WeightUnit
    public var distanceUnit: DistanceUnit
    public var defaultRestSeconds: Int
    public var theme: String
    public var language: LanguagePreference?
    public var restTimerSound: Bool
    public var notificationsEnabled: Bool
    public var exerciseSuggestionsEnabled: Bool
    public var weeklyGoalSessions: Int

    public init(
        id: String = "pref-local",
        userId: String = "local-user",
        weightUnit: WeightUnit = .KG,
        distanceUnit: DistanceUnit = .KM,
        defaultRestSeconds: Int = 90,
        theme: String = "system",
        language: LanguagePreference? = .system,
        restTimerSound: Bool = true,
        notificationsEnabled: Bool = true,
        exerciseSuggestionsEnabled: Bool = true,
        weeklyGoalSessions: Int = 4
    ) {
        self.id = id
        self.userId = userId
        self.weightUnit = weightUnit
        self.distanceUnit = distanceUnit
        self.defaultRestSeconds = defaultRestSeconds
        self.theme = theme
        self.language = language
        self.restTimerSound = restTimerSound
        self.notificationsEnabled = notificationsEnabled
        self.exerciseSuggestionsEnabled = exerciseSuggestionsEnabled
        self.weeklyGoalSessions = weeklyGoalSessions
    }

    enum CodingKeys: String, CodingKey {
        case id, userId, weightUnit, distanceUnit, defaultRestSeconds, theme, language
        case restTimerSound, notificationsEnabled, exerciseSuggestionsEnabled, weeklyGoalSessions
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.id = try c.decodeIfPresent(String.self, forKey: .id) ?? "pref-local"
        self.userId = try c.decodeIfPresent(String.self, forKey: .userId) ?? "local-user"
        self.weightUnit = try c.decodeIfPresent(WeightUnit.self, forKey: .weightUnit) ?? .KG
        self.distanceUnit = try c.decodeIfPresent(DistanceUnit.self, forKey: .distanceUnit) ?? .KM
        self.defaultRestSeconds = try c.decodeIfPresent(Int.self, forKey: .defaultRestSeconds) ?? 90
        self.theme = try c.decodeIfPresent(String.self, forKey: .theme) ?? "system"
        self.language = try c.decodeIfPresent(LanguagePreference.self, forKey: .language)
        self.restTimerSound = try c.decodeIfPresent(Bool.self, forKey: .restTimerSound) ?? true
        self.notificationsEnabled = try c.decodeIfPresent(Bool.self, forKey: .notificationsEnabled) ?? true
        self.exerciseSuggestionsEnabled = try c.decodeIfPresent(Bool.self, forKey: .exerciseSuggestionsEnabled) ?? true
        self.weeklyGoalSessions = try c.decodeIfPresent(Int.self, forKey: .weeklyGoalSessions) ?? 4
    }
}

public struct UserDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var email: String
    public var name: String?
    public var emailVerified: Bool?
    public var lastLoginAt: String?
    public var createdAt: String?
    public var preferences: UserPreferencesDto?
    public var tokens: AuthTokensDto?
    public var requiresEmailConfirmation: Bool?
    public var message: String?

    public init(
        id: String,
        email: String,
        name: String? = nil,
        emailVerified: Bool? = true,
        lastLoginAt: String? = nil,
        createdAt: String? = nil,
        preferences: UserPreferencesDto? = nil,
        tokens: AuthTokensDto? = nil,
        requiresEmailConfirmation: Bool? = nil,
        message: String? = nil
    ) {
        self.id = id
        self.email = email
        self.name = name
        self.emailVerified = emailVerified
        self.lastLoginAt = lastLoginAt
        self.createdAt = createdAt
        self.preferences = preferences
        self.tokens = tokens
        self.requiresEmailConfirmation = requiresEmailConfirmation
        self.message = message
    }
}

public struct UpdatePreferencesDto: Codable, Sendable, Equatable, Hashable {
    public var name: String?
    public var weightUnit: WeightUnit?
    public var distanceUnit: DistanceUnit?
    public var defaultRestSeconds: Int?
    public var theme: String?
    public var language: LanguagePreference?
    public var restTimerSound: Bool?
    public var notificationsEnabled: Bool?
    public var exerciseSuggestionsEnabled: Bool?
    public var weeklyGoalSessions: Int?

    public init(
        name: String? = nil,
        weightUnit: WeightUnit? = nil,
        distanceUnit: DistanceUnit? = nil,
        defaultRestSeconds: Int? = nil,
        theme: String? = nil,
        language: LanguagePreference? = nil,
        restTimerSound: Bool? = nil,
        notificationsEnabled: Bool? = nil,
        exerciseSuggestionsEnabled: Bool? = nil,
        weeklyGoalSessions: Int? = nil
    ) {
        self.name = name
        self.weightUnit = weightUnit
        self.distanceUnit = distanceUnit
        self.defaultRestSeconds = defaultRestSeconds
        self.theme = theme
        self.language = language
        self.restTimerSound = restTimerSound
        self.notificationsEnabled = notificationsEnabled
        self.exerciseSuggestionsEnabled = exerciseSuggestionsEnabled
        self.weeklyGoalSessions = weeklyGoalSessions
    }
}

// MARK: - Exercise Catalog DTOs

public struct ExerciseAlternativeItemDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var name: String
    public var equipment: EquipmentType
    public var primaryMuscleGroup: MuscleGroup
    public var reason: String?

    public init(
        id: String,
        name: String,
        equipment: EquipmentType,
        primaryMuscleGroup: MuscleGroup,
        reason: String? = nil
    ) {
        self.id = id
        self.name = name
        self.equipment = equipment
        self.primaryMuscleGroup = primaryMuscleGroup
        self.reason = reason
    }
}

public struct ExerciseMediaDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var mediaType: String
    public var url: String
    public var caption: String?
    public var attribution: String?
    public var license: String?

    public init(
        id: String,
        mediaType: String = "SVG",
        url: String,
        caption: String? = nil,
        attribution: String? = nil,
        license: String? = nil
    ) {
        self.id = id
        self.mediaType = mediaType
        self.url = url
        self.caption = caption
        self.attribution = attribution
        self.license = license
    }
}

public struct ExerciseDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var slug: String
    public var userId: String?
    public var name: String
    public var description: String
    public var instructions: [String]
    public var category: ExerciseCategory
    public var exerciseType: ExerciseType
    public var primaryMuscleGroup: MuscleGroup
    public var secondaryMuscleGroups: [MuscleGroup]
    public var equipment: EquipmentType
    public var recommendedDurationSeconds: Int?
    public var tags: [String]
    public var isSystem: Bool
    public var alternativeExerciseIds: [String]
    /// How the exercise moves; `nil` when unknown (then it is only found by search).
    public var movementPattern: MovementPattern?
    public var laterality: Laterality?
    public var mechanic: ExerciseMechanic?
    public var targetRegions: [TargetRegion]?
    public var alternatives: [ExerciseAlternativeItemDto]?
    public var media: [ExerciseMediaDto]?

    public init(
        id: String,
        slug: String,
        userId: String? = nil,
        name: String,
        description: String,
        instructions: [String] = [],
        category: ExerciseCategory = .COMPOUND,
        exerciseType: ExerciseType = .STRENGTH,
        primaryMuscleGroup: MuscleGroup,
        secondaryMuscleGroups: [MuscleGroup] = [],
        equipment: EquipmentType = .BARBELL,
        recommendedDurationSeconds: Int? = nil,
        tags: [String] = [],
        isSystem: Bool = false,
        alternativeExerciseIds: [String] = [],
        movementPattern: MovementPattern? = nil,
        laterality: Laterality? = nil,
        mechanic: ExerciseMechanic? = nil,
        targetRegions: [TargetRegion]? = nil,
        alternatives: [ExerciseAlternativeItemDto]? = nil,
        media: [ExerciseMediaDto]? = nil
    ) {
        self.id = id
        self.slug = slug
        self.userId = userId
        self.name = name
        self.description = description
        self.instructions = instructions
        self.category = category
        self.exerciseType = exerciseType
        self.primaryMuscleGroup = primaryMuscleGroup
        self.secondaryMuscleGroups = secondaryMuscleGroups
        self.equipment = equipment
        self.recommendedDurationSeconds = recommendedDurationSeconds
        self.tags = tags
        self.isSystem = isSystem
        self.alternativeExerciseIds = alternativeExerciseIds
        self.movementPattern = movementPattern
        self.laterality = laterality
        self.mechanic = mechanic
        self.targetRegions = targetRegions
        self.alternatives = alternatives
        self.media = media
    }
}

// MARK: - Folders, Templates & Stretching Routines DTOs

/// One planned set of a template exercise (mirrors `TemplateSetSchema` in @luki-fitti/common).
public struct TemplateSetDto: Codable, Sendable, Equatable, Hashable {
    public var setType: SetType
    public var weight: Double?
    public var reps: Int?
    public var durationSeconds: Int?

    public init(setType: SetType = .WORKING, weight: Double? = nil, reps: Int? = nil, durationSeconds: Int? = nil) {
        self.setType = setType
        self.weight = weight
        self.reps = reps
        self.durationSeconds = durationSeconds
    }
}

public struct WorkoutTemplateExerciseDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var templateId: String
    public var exerciseId: String
    /// Explicit per-set plan; `nil` for templates that only carry summary values.
    public var sets: [TemplateSetDto]?
    public var orderIndex: Int
    public var plannedSets: Int
    public var warmupSets: Int
    public var targetRepsMin: Int?
    public var targetRepsMax: Int?
    public var targetWeight: Double?
    public var weightUnit: WeightUnit
    public var restSeconds: Int
    public var targetDurationSeconds: Int?
    public var targetDistanceMeters: Double?
    public var notes: String?
    public var alternativeExerciseIds: [String]
    public var exercise: ExerciseDto?

    public init(
        id: String = UUID().uuidString,
        templateId: String,
        exerciseId: String,
        orderIndex: Int,
        plannedSets: Int = 3,
        warmupSets: Int = 0,
        targetRepsMin: Int? = 8,
        targetRepsMax: Int? = 12,
        targetWeight: Double? = nil,
        weightUnit: WeightUnit = .KG,
        restSeconds: Int = 90,
        targetDurationSeconds: Int? = nil,
        targetDistanceMeters: Double? = nil,
        notes: String? = nil,
        alternativeExerciseIds: [String] = [],
        exercise: ExerciseDto? = nil,
        sets: [TemplateSetDto]? = nil
    ) {
        self.id = id
        self.templateId = templateId
        self.exerciseId = exerciseId
        self.sets = sets
        self.orderIndex = orderIndex
        self.plannedSets = plannedSets
        self.warmupSets = warmupSets
        self.targetRepsMin = targetRepsMin
        self.targetRepsMax = targetRepsMax
        self.targetWeight = targetWeight
        self.weightUnit = weightUnit
        self.restSeconds = restSeconds
        self.targetDurationSeconds = targetDurationSeconds
        self.targetDistanceMeters = targetDistanceMeters
        self.notes = notes
        self.alternativeExerciseIds = alternativeExerciseIds
        self.exercise = exercise
    }
}

public struct WorkoutTemplateDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var userId: String
    public var folderId: String?
    public var name: String
    public var description: String?
    public var estimatedDurationMinutes: Int?
    public var sortOrder: Int
    public var createdAt: String
    public var updatedAt: String
    public var exercises: [WorkoutTemplateExerciseDto]

    public init(
        id: String = UUID().uuidString,
        userId: String = "local-user",
        folderId: String? = nil,
        name: String,
        description: String? = nil,
        estimatedDurationMinutes: Int? = 60,
        sortOrder: Int = 0,
        createdAt: String = ISO8601DateFormatter().string(from: Date()),
        updatedAt: String = ISO8601DateFormatter().string(from: Date()),
        exercises: [WorkoutTemplateExerciseDto] = []
    ) {
        self.id = id
        self.userId = userId
        self.folderId = folderId
        self.name = name
        self.description = description
        self.estimatedDurationMinutes = estimatedDurationMinutes
        self.sortOrder = sortOrder
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.exercises = exercises
    }
}

public struct WorkoutFolderDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var userId: String
    public var name: String
    public var color: String
    public var sortOrder: Int
    public var templates: [WorkoutTemplateDto]

    public init(
        id: String = UUID().uuidString,
        userId: String = "local-user",
        name: String,
        color: String = "#E8743B",
        sortOrder: Int = 0,
        templates: [WorkoutTemplateDto] = []
    ) {
        self.id = id
        self.userId = userId
        self.name = name
        self.color = color
        self.sortOrder = sortOrder
        self.templates = templates
    }
}

public struct WorkoutsOverviewDto: Codable, Sendable, Equatable, Hashable {
    public var folders: [WorkoutFolderDto]
    public var unfiledTemplates: [WorkoutTemplateDto]

    public init(folders: [WorkoutFolderDto] = [], unfiledTemplates: [WorkoutTemplateDto] = []) {
        self.folders = folders
        self.unfiledTemplates = unfiledTemplates
    }
}

public struct StretchingRoutineExerciseDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var routineId: String
    public var exerciseId: String
    public var orderIndex: Int
    public var sets: Int
    public var durationSeconds: Int?
    public var reps: Int?
    public var transitionSeconds: Int
    public var notes: String?
    public var exercise: ExerciseDto?

    public init(
        id: String = UUID().uuidString,
        routineId: String,
        exerciseId: String,
        orderIndex: Int,
        sets: Int = 1,
        durationSeconds: Int? = 45,
        reps: Int? = nil,
        transitionSeconds: Int = 15,
        notes: String? = nil,
        exercise: ExerciseDto? = nil
    ) {
        self.id = id
        self.routineId = routineId
        self.exerciseId = exerciseId
        self.orderIndex = orderIndex
        self.sets = sets
        self.durationSeconds = durationSeconds
        self.reps = reps
        self.transitionSeconds = transitionSeconds
        self.notes = notes
        self.exercise = exercise
    }
}

public struct StretchingRoutineDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var userId: String
    public var name: String
    public var description: String?
    public var targetArea: String
    public var estimatedDurationSeconds: Int
    public var createdAt: String
    public var updatedAt: String
    public var exercises: [StretchingRoutineExerciseDto]

    public init(
        id: String = UUID().uuidString,
        userId: String = "local-user",
        name: String,
        description: String? = nil,
        targetArea: String = "Full Body",
        estimatedDurationSeconds: Int = 600,
        createdAt: String = ISO8601DateFormatter().string(from: Date()),
        updatedAt: String = ISO8601DateFormatter().string(from: Date()),
        exercises: [StretchingRoutineExerciseDto] = []
    ) {
        self.id = id
        self.userId = userId
        self.name = name
        self.description = description
        self.targetArea = targetArea
        self.estimatedDurationSeconds = estimatedDurationSeconds
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.exercises = exercises
    }
}

// MARK: - Workout Session & HealthKit Telemetry DTOs

public struct HeartRateSampleDto: Codable, Sendable, Equatable, Hashable {
    public var offsetSec: Int
    public var bpm: Int

    public init(offsetSec: Int, bpm: Int) {
        self.offsetSec = offsetSec
        self.bpm = bpm
    }
}

public struct SessionSetDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var clientSetId: String
    public var sessionExerciseId: String
    public var setNumber: Int
    public var setType: SetType
    public var weight: Double?
    public var weightUnit: WeightUnit
    public var reps: Int?
    public var durationSeconds: Int?
    public var distanceMeters: Double?
    public var rpe: Double?
    public var completed: Bool
    public var completedAt: String?
    public var isPersonalRecord: Bool
    public var notes: String?
    public var avgHeartRateBpm: Int?
    public var peakHeartRateBpm: Int?
    public var restEndHeartRateBpm: Int?

    public init(
        id: String = UUID().uuidString,
        clientSetId: String = "cset-\(UUID().uuidString.lowercased())",
        sessionExerciseId: String,
        setNumber: Int,
        setType: SetType = .WORKING,
        weight: Double? = nil,
        weightUnit: WeightUnit = .KG,
        reps: Int? = nil,
        durationSeconds: Int? = nil,
        distanceMeters: Double? = nil,
        rpe: Double? = nil,
        completed: Bool = false,
        completedAt: String? = nil,
        isPersonalRecord: Bool = false,
        notes: String? = nil,
        avgHeartRateBpm: Int? = nil,
        peakHeartRateBpm: Int? = nil,
        restEndHeartRateBpm: Int? = nil
    ) {
        self.id = id
        self.clientSetId = clientSetId
        self.sessionExerciseId = sessionExerciseId
        self.setNumber = setNumber
        self.setType = setType
        self.weight = weight
        self.weightUnit = weightUnit
        self.reps = reps
        self.durationSeconds = durationSeconds
        self.distanceMeters = distanceMeters
        self.rpe = rpe
        self.completed = completed
        self.completedAt = completedAt
        self.isPersonalRecord = isPersonalRecord
        self.notes = notes
        self.avgHeartRateBpm = avgHeartRateBpm
        self.peakHeartRateBpm = peakHeartRateBpm
        self.restEndHeartRateBpm = restEndHeartRateBpm
    }
}

public struct SessionExerciseDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var clientExerciseId: String
    public var sessionId: String
    public var exerciseId: String?
    public var replacedExerciseId: String?
    public var replacedExerciseName: String?
    public var exerciseNameSnapshot: String
    public var primaryMuscleSnapshot: MuscleGroup
    public var exerciseTypeSnapshot: ExerciseType
    public var origin: SessionExerciseOrigin
    public var status: SessionExerciseStatus
    public var orderIndex: Int
    public var plannedSets: Int
    public var plannedWarmupSets: Int
    public var targetRepsMin: Int?
    public var targetRepsMax: Int?
    public var targetWeight: Double?
    public var targetDurationSeconds: Int?
    public var restSeconds: Int
    public var alternativeExerciseIds: [String]
    public var notes: String?
    public var sets: [SessionSetDto]

    public init(
        id: String = UUID().uuidString,
        clientExerciseId: String = "sex-\(UUID().uuidString.lowercased())",
        sessionId: String,
        exerciseId: String? = nil,
        replacedExerciseId: String? = nil,
        replacedExerciseName: String? = nil,
        exerciseNameSnapshot: String,
        primaryMuscleSnapshot: MuscleGroup,
        exerciseTypeSnapshot: ExerciseType = .STRENGTH,
        origin: SessionExerciseOrigin = .PLANNED,
        status: SessionExerciseStatus = .PENDING,
        orderIndex: Int,
        plannedSets: Int = 3,
        plannedWarmupSets: Int = 0,
        targetRepsMin: Int? = 8,
        targetRepsMax: Int? = 12,
        targetWeight: Double? = nil,
        targetDurationSeconds: Int? = nil,
        restSeconds: Int = 90,
        alternativeExerciseIds: [String] = [],
        notes: String? = nil,
        sets: [SessionSetDto] = []
    ) {
        self.id = id
        self.clientExerciseId = clientExerciseId
        self.sessionId = sessionId
        self.exerciseId = exerciseId
        self.replacedExerciseId = replacedExerciseId
        self.replacedExerciseName = replacedExerciseName
        self.exerciseNameSnapshot = exerciseNameSnapshot
        self.primaryMuscleSnapshot = primaryMuscleSnapshot
        self.exerciseTypeSnapshot = exerciseTypeSnapshot
        self.origin = origin
        self.status = status
        self.orderIndex = orderIndex
        self.plannedSets = plannedSets
        self.plannedWarmupSets = plannedWarmupSets
        self.targetRepsMin = targetRepsMin
        self.targetRepsMax = targetRepsMax
        self.targetWeight = targetWeight
        self.targetDurationSeconds = targetDurationSeconds
        self.restSeconds = restSeconds
        self.alternativeExerciseIds = alternativeExerciseIds
        self.notes = notes
        self.sets = sets
    }
}

public struct WorkoutSessionDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String
    public var clientSessionId: String
    public var userId: String
    public var templateId: String?
    public var stretchingRoutineId: String?
    public var sessionType: SessionType
    public var workoutNameSnapshot: String
    public var status: SessionStatus
    public var startedAt: String
    public var pausedAt: String?
    public var completedAt: String?
    public var activeDurationSeconds: Int
    public var weightUnit: WeightUnit
    public var totalVolumeKg: Double
    public var totalSetsCompleted: Int
    public var totalRepsCompleted: Int
    public var totalStretchSeconds: Int
    public var notes: String?
    public var restTimerEndsAt: String?
    public var restTimerDurationSec: Int?
    public var restTimerPausedRemSec: Int?
    public var sourceDevice: SessionSourceDevice?
    public var healthKitWorkoutUuid: String?
    public var activeCaloriesKcal: Double?
    public var totalCaloriesKcal: Double?
    public var avgHeartRateBpm: Int?
    public var maxHeartRateBpm: Int?
    public var minHeartRateBpm: Int?
    public var heartRateSamples: [HeartRateSampleDto]?
    public var version: Int
    public var lastSyncedAt: String
    public var exercises: [SessionExerciseDto]

    public init(
        id: String = UUID().uuidString,
        clientSessionId: String = "sess-\(UUID().uuidString.lowercased())",
        userId: String = "local-user",
        templateId: String? = nil,
        stretchingRoutineId: String? = nil,
        sessionType: SessionType = .STRENGTH,
        workoutNameSnapshot: String,
        status: SessionStatus = .IN_PROGRESS,
        startedAt: String = ISO8601DateFormatter().string(from: Date()),
        pausedAt: String? = nil,
        completedAt: String? = nil,
        activeDurationSeconds: Int = 0,
        weightUnit: WeightUnit = .KG,
        totalVolumeKg: Double = 0,
        totalSetsCompleted: Int = 0,
        totalRepsCompleted: Int = 0,
        totalStretchSeconds: Int = 0,
        notes: String? = nil,
        restTimerEndsAt: String? = nil,
        restTimerDurationSec: Int? = nil,
        restTimerPausedRemSec: Int? = nil,
        sourceDevice: SessionSourceDevice? = .IPHONE,
        healthKitWorkoutUuid: String? = nil,
        activeCaloriesKcal: Double? = nil,
        totalCaloriesKcal: Double? = nil,
        avgHeartRateBpm: Int? = nil,
        maxHeartRateBpm: Int? = nil,
        minHeartRateBpm: Int? = nil,
        heartRateSamples: [HeartRateSampleDto]? = nil,
        version: Int = 1,
        lastSyncedAt: String = ISO8601DateFormatter().string(from: Date()),
        exercises: [SessionExerciseDto] = []
    ) {
        self.id = id
        self.clientSessionId = clientSessionId
        self.userId = userId
        self.templateId = templateId
        self.stretchingRoutineId = stretchingRoutineId
        self.sessionType = sessionType
        self.workoutNameSnapshot = workoutNameSnapshot
        self.status = status
        self.startedAt = startedAt
        self.pausedAt = pausedAt
        self.completedAt = completedAt
        self.activeDurationSeconds = activeDurationSeconds
        self.weightUnit = weightUnit
        self.totalVolumeKg = totalVolumeKg
        self.totalSetsCompleted = totalSetsCompleted
        self.totalRepsCompleted = totalRepsCompleted
        self.totalStretchSeconds = totalStretchSeconds
        self.notes = notes
        self.restTimerEndsAt = restTimerEndsAt
        self.restTimerDurationSec = restTimerDurationSec
        self.restTimerPausedRemSec = restTimerPausedRemSec
        self.sourceDevice = sourceDevice
        self.healthKitWorkoutUuid = healthKitWorkoutUuid
        self.activeCaloriesKcal = activeCaloriesKcal
        self.totalCaloriesKcal = totalCaloriesKcal
        self.avgHeartRateBpm = avgHeartRateBpm
        self.maxHeartRateBpm = maxHeartRateBpm
        self.minHeartRateBpm = minHeartRateBpm
        self.heartRateSamples = heartRateSamples
        self.version = version
        self.lastSyncedAt = lastSyncedAt
        self.exercises = exercises
    }
}

public struct SyncSessionPayloadDto: Codable, Sendable, Equatable, Hashable {
    public var id: String?
    public var clientSessionId: String
    public var templateId: String?
    public var stretchingRoutineId: String?
    public var sessionType: SessionType
    public var workoutNameSnapshot: String
    public var status: SessionStatus
    public var startedAt: String
    public var pausedAt: String?
    public var completedAt: String?
    public var activeDurationSeconds: Int
    public var weightUnit: WeightUnit
    public var notes: String?
    public var restTimerEndsAt: String?
    public var restTimerDurationSec: Int?
    public var restTimerPausedRemSec: Int?
    public var sourceDevice: SessionSourceDevice?
    public var healthKitWorkoutUuid: String?
    public var activeCaloriesKcal: Double?
    public var totalCaloriesKcal: Double?
    public var avgHeartRateBpm: Int?
    public var maxHeartRateBpm: Int?
    public var minHeartRateBpm: Int?
    public var heartRateSamples: [HeartRateSampleDto]?
    public var version: Int
    /// Stable random id of this app install; lets the server recognise its own retried syncs.
    public var deviceId: String?
    /// Last server version this device acknowledged; used for optimistic concurrency.
    public var baseVersion: Int?
    public var forceOverwrite: Bool?
    public var exercises: [SessionExerciseDto]

    public init(from session: WorkoutSessionDto, forceOverwrite: Bool = false) {
        self.id = session.id
        self.clientSessionId = session.clientSessionId
        self.templateId = session.templateId
        self.stretchingRoutineId = session.stretchingRoutineId
        self.sessionType = session.sessionType
        self.workoutNameSnapshot = session.workoutNameSnapshot
        self.status = session.status
        self.startedAt = session.startedAt
        self.pausedAt = session.pausedAt
        self.completedAt = session.completedAt
        self.activeDurationSeconds = session.activeDurationSeconds
        self.weightUnit = session.weightUnit
        self.notes = session.notes
        self.restTimerEndsAt = session.restTimerEndsAt
        self.restTimerDurationSec = session.restTimerDurationSec
        self.restTimerPausedRemSec = session.restTimerPausedRemSec
        self.sourceDevice = session.sourceDevice
        self.healthKitWorkoutUuid = session.healthKitWorkoutUuid
        self.activeCaloriesKcal = session.activeCaloriesKcal
        self.totalCaloriesKcal = session.totalCaloriesKcal
        self.avgHeartRateBpm = session.avgHeartRateBpm
        self.maxHeartRateBpm = session.maxHeartRateBpm
        self.minHeartRateBpm = session.minHeartRateBpm
        self.heartRateSamples = session.heartRateSamples
        self.version = session.version
        self.forceOverwrite = forceOverwrite
        self.exercises = session.exercises
    }
}

public struct SyncSessionResponseDto: Codable, Sendable, Equatable, Hashable {
    public var session: WorkoutSessionDto
    public var conflictDetected: Bool
    public var serverVersion: Int

    public init(session: WorkoutSessionDto, conflictDetected: Bool, serverVersion: Int) {
        self.session = session
        self.conflictDetected = conflictDetected
        self.serverVersion = serverVersion
    }
}

// MARK: - Analytics DTOs

public struct PersonalRecordDto: Codable, Sendable, Equatable, Hashable, Identifiable {
    public var id: String { exerciseId }
    public var exerciseId: String
    public var exerciseName: String
    public var primaryMuscle: MuscleGroup
    public var maxWeightKg: Double
    public var repsAtMaxWeight: Int
    public var estimatedOneRepMaxKg: Double
    public var bestVolumeSetKg: Double
    public var achievedAt: String

    public init(
        exerciseId: String,
        exerciseName: String,
        primaryMuscle: MuscleGroup,
        maxWeightKg: Double,
        repsAtMaxWeight: Int,
        estimatedOneRepMaxKg: Double,
        bestVolumeSetKg: Double,
        achievedAt: String
    ) {
        self.exerciseId = exerciseId
        self.exerciseName = exerciseName
        self.primaryMuscle = primaryMuscle
        self.maxWeightKg = maxWeightKg
        self.repsAtMaxWeight = repsAtMaxWeight
        self.estimatedOneRepMaxKg = estimatedOneRepMaxKg
        self.bestVolumeSetKg = bestVolumeSetKg
        self.achievedAt = achievedAt
    }
}

public struct WeeklyFrequencyPointDto: Codable, Sendable, Equatable, Hashable {
    public var weekStart: String
    public var label: String
    public var strengthSessions: Int
    public var stretchingSessions: Int
    public var totalVolumeKg: Double
    public var totalSets: Int

    public init(
        weekStart: String,
        label: String,
        strengthSessions: Int,
        stretchingSessions: Int,
        totalVolumeKg: Double,
        totalSets: Int
    ) {
        self.weekStart = weekStart
        self.label = label
        self.strengthSessions = strengthSessions
        self.stretchingSessions = stretchingSessions
        self.totalVolumeKg = totalVolumeKg
        self.totalSets = totalSets
    }
}

public struct MuscleDistributionItemDto: Codable, Sendable, Equatable, Hashable {
    public var muscleGroup: MuscleGroup
    public var label: String
    public var completedSets: Int
    public var totalVolumeKg: Double
    public var percentage: Int

    public init(
        muscleGroup: MuscleGroup,
        label: String,
        completedSets: Int,
        totalVolumeKg: Double,
        percentage: Int
    ) {
        self.muscleGroup = muscleGroup
        self.label = label
        self.completedSets = completedSets
        self.totalVolumeKg = totalVolumeKg
        self.percentage = percentage
    }
}

public struct ExerciseProgressionPointDto: Codable, Sendable, Equatable, Hashable {
    public var date: String
    public var workoutName: String
    public var maxWeightKg: Double
    public var totalVolumeKg: Double
    public var bestSetReps: Int
    public var estimated1RM: Double

    public init(
        date: String,
        workoutName: String,
        maxWeightKg: Double,
        totalVolumeKg: Double,
        bestSetReps: Int,
        estimated1RM: Double
    ) {
        self.date = date
        self.workoutName = workoutName
        self.maxWeightKg = maxWeightKg
        self.totalVolumeKg = totalVolumeKg
        self.bestSetReps = bestSetReps
        self.estimated1RM = estimated1RM
    }
}

public struct AnalyticsSummaryDto: Codable, Sendable, Equatable, Hashable {
    public var totalSessionsCompleted: Int
    public var totalStrengthSessions: Int
    public var totalStretchingSessions: Int
    public var totalSetsCompleted: Int
    public var totalRepsCompleted: Int
    public var totalVolumeKg: Double
    public var totalDurationSeconds: Int
    public var totalStretchSeconds: Int
    public var totalActiveCaloriesKcal: Double
    public var avgWorkoutHeartRateBpm: Int?
    public var currentStreakWeeks: Int
    public var sessionsThisWeek: Int
    public var weeklyGoalSessions: Int
    public var frequencyByWeek: [WeeklyFrequencyPointDto]
    public var muscleDistribution: [MuscleDistributionItemDto]
    public var personalRecords: [PersonalRecordDto]
    public var exerciseProgression: [ExerciseProgressionPointDto]

    public init(
        totalSessionsCompleted: Int = 0,
        totalStrengthSessions: Int = 0,
        totalStretchingSessions: Int = 0,
        totalSetsCompleted: Int = 0,
        totalRepsCompleted: Int = 0,
        totalVolumeKg: Double = 0,
        totalDurationSeconds: Int = 0,
        totalStretchSeconds: Int = 0,
        totalActiveCaloriesKcal: Double = 0,
        avgWorkoutHeartRateBpm: Int? = nil,
        currentStreakWeeks: Int = 0,
        sessionsThisWeek: Int = 0,
        weeklyGoalSessions: Int = 4,
        frequencyByWeek: [WeeklyFrequencyPointDto] = [],
        muscleDistribution: [MuscleDistributionItemDto] = [],
        personalRecords: [PersonalRecordDto] = [],
        exerciseProgression: [ExerciseProgressionPointDto] = []
    ) {
        self.totalSessionsCompleted = totalSessionsCompleted
        self.totalStrengthSessions = totalStrengthSessions
        self.totalStretchingSessions = totalStretchingSessions
        self.totalSetsCompleted = totalSetsCompleted
        self.totalRepsCompleted = totalRepsCompleted
        self.totalVolumeKg = totalVolumeKg
        self.totalDurationSeconds = totalDurationSeconds
        self.totalStretchSeconds = totalStretchSeconds
        self.totalActiveCaloriesKcal = totalActiveCaloriesKcal
        self.avgWorkoutHeartRateBpm = avgWorkoutHeartRateBpm
        self.currentStreakWeeks = currentStreakWeeks
        self.sessionsThisWeek = sessionsThisWeek
        self.weeklyGoalSessions = weeklyGoalSessions
        self.frequencyByWeek = frequencyByWeek
        self.muscleDistribution = muscleDistribution
        self.personalRecords = personalRecords
        self.exerciseProgression = exerciseProgression
    }
}
