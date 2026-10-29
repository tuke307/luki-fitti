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

extension SupportedLocale {
    /// The app language: the explicit preference, otherwise the device language.
    public static func resolve(_ preference: LanguagePreference?) -> SupportedLocale {
        switch preference {
        case .en: return .en
        case .de: return .de
        case .system, nil:
            let code = Locale.current.language.languageCode?.identifier.lowercased() ?? "en"
            return code.hasPrefix("de") ? .de : .en
        }
    }
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

/// How an exercise moves the body (mirrors `MovementPattern` in @luki-fitti/common).
public enum MovementPattern: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case HORIZONTAL_PULL
    case VERTICAL_PULL
    case SHOULDER_EXTENSION
    case HORIZONTAL_PUSH
    case INCLINE_PUSH
    case VERTICAL_PUSH
    case DIP
    case FLY
    case LATERAL_RAISE
    case FRONT_RAISE
    case REAR_DELT
    case UPRIGHT_ROW
    case SHRUG
    case SHOULDER_ROTATION
    case ELBOW_FLEXION
    case ELBOW_EXTENSION
    case WRIST
    case SQUAT
    case HINGE
    case LUNGE
    case KNEE_EXTENSION
    case KNEE_FLEXION
    case HIP_THRUST
    case HIP_EXTENSION
    case HIP_ABDUCTION
    case HIP_ADDUCTION
    case HIP_FLEXION
    case CALF_RAISE
    case BACK_EXTENSION
    case CORE_FLEXION
    case ANTI_EXTENSION
    case LATERAL_FLEXION
    case ROTATION
    case CARRY
    case OLYMPIC_LIFT
}

public enum Laterality: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case BILATERAL
    case UNILATERAL
}

public enum ExerciseMechanic: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case COMPOUND
    case ISOLATION
}

/// Finer-grained than `MuscleGroup`: the regions an exercise mainly loads.
public enum TargetRegion: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case LATS
    case UPPER_BACK
    case TRAPS
    case LOWER_BACK
    case UPPER_CHEST
    case MID_CHEST
    case LOWER_CHEST
    case FRONT_DELT
    case SIDE_DELT
    case REAR_DELT
    case BICEPS
    case BRACHIALIS
    case TRICEPS
    case FOREARMS
    case QUADS
    case HAMSTRINGS
    case GLUTES
    case ADDUCTORS
    case ABDUCTORS
    case CALVES
    case ABS
    case OBLIQUES
    case HIP_FLEXORS
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
    case CARDIO

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        if raw == "MOBILITY" {
            self = .STRETCHING
        } else if let parsed = ExerciseType(rawValue: raw) {
            self = parsed
        } else {
            self = .STRENGTH
        }
    }
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
    case STRETCH

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        if raw == "FAILURE" {
            self = .WORKING
        } else if let parsed = SetType(rawValue: raw) {
            self = parsed
        } else {
            self = .WORKING
        }
    }
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

/// Opt-in features granted per user by an admin (mirrors `FeatureGrant` in @luki-fitti/common).
public enum FeatureGrant: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case AI_WORKOUT_BUILDER
    case AI_MEAL_PHOTO
}

public enum MealType: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case BREAKFAST
    case LUNCH
    case DINNER
    case SNACK
    case COFFEE
    case OTHER

    /// Default meal for a time of day, so a quick add lands in the obvious slot.
    public static func forTime(_ date: Date, calendar: Calendar = .current) -> MealType {
        let hour = calendar.component(.hour, from: date)
        switch hour {
        case ..<10: return .BREAKFAST
        case ..<14: return .LUNCH
        case ..<17: return .SNACK
        case ..<22: return .DINNER
        default: return .SNACK
        }
    }
}

public enum FoodItemSource: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case MANUAL
    case AI
}

public enum ExerciseFeedbackVerdict: String, Codable, Sendable, CaseIterable, Equatable, Hashable {
    case NOT_WORKING
    case PAIN
    case DISLIKE
}
