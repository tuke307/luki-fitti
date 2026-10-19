import Foundation

public enum WeightUnit: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case KG
    case LBS
}

public enum DistanceUnit: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case KM
    case MI
}

public enum SupportedLocale: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case en
    case de
}

public enum LanguagePreference: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case system
    case en
    case de
}

public enum MuscleGroup: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case CHEST
    case BACK
    case SHOULDERS
    case BICEPS
    case TRICEPS
    case FOREARMS
    case QUADRICEPS
    case HAMSTRINGS
    case GLUTES
    case CALVES
    case ABS_CORE
    case HIP_FLEXORS
    case FULL_BODY
}

public enum ExerciseCategory: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case COMPOUND
    case ISOLATION
    case BODYWEIGHT
    case MACHINE
    case CABLE
    case MOBILITY
    case STRETCH
    case CARDIO
}

public enum ExerciseType: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case STRENGTH
    case STRETCHING
    case MOBILITY
    case CARDIO
}

public enum EquipmentType: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case BARBELL
    case DUMBBELL
    case MACHINE
    case CABLE
    case BODYWEIGHT
    case KETTLEBELL
    case BAND
    case EZ_BAR
    case SMITH_MACHINE
    case CARDIO_MACHINE
    case FOAM_ROLLER
    case NONE
    case OTHER
}

public enum SessionStatus: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case PLANNED
    case IN_PROGRESS
    case PAUSED
    case COMPLETED
    case ABANDONED
}

public enum SessionType: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case STRENGTH
    case STRETCHING
    case MIXED
}

public enum SessionExerciseOrigin: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case PLANNED
    case SUBSTITUTED
    case ADDED
}

public enum SessionExerciseStatus: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case PENDING
    case IN_PROGRESS
    case COMPLETED
    case SKIPPED
}

public enum SetType: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case WARMUP
    case WORKING
    case DROPSET
    case FAILURE
    case STRETCH
}

public enum SessionSourceDevice: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case WEB
    case IPHONE
    case APPLE_WATCH
}

public enum ProgressionPhase: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case INCREASE_WEIGHT
    case INCREASE_REPS
    case DELOAD
    case MAINTAIN
    case BASELINE
}

public enum SyncState: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case SYNCED
    case SAVED_LOCALLY
    case SYNCING
    case CONFLICT
    case AUTH_EXPIRED
    case OFFLINE
}
