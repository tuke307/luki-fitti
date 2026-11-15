import Foundation
import LukiFittiModels

/// Rep bands, rest times and progression tweaks per `TrainingGoal`.
/// Mirrors `packages/common/src/utils/training-goal.util.ts` 1:1 — keep both in sync.
public enum TrainingGoalProfiles {
    public struct Profile: Sendable, Equatable {
        public var compoundMin: Int
        public var compoundMax: Int
        public var isolationMin: Int
        public var isolationMax: Int
        public var restSeconds: Int
        /// Multiplier on the standard step for BARBELL compound exercises.
        public var barbellCompoundStepMultiplier: Double
        /// Max effort (avg RPE >= maxEffortRpe) at the top of the band still earns more weight.
        public var maxEffortEarnsWeight: Bool
        /// Weight only goes up when the last session's avg RPE is below this (nil = no cap).
        public var increaseWeightMaxRpe: Double?

        public init(
            compoundMin: Int,
            compoundMax: Int,
            isolationMin: Int,
            isolationMax: Int,
            restSeconds: Int,
            barbellCompoundStepMultiplier: Double,
            maxEffortEarnsWeight: Bool,
            increaseWeightMaxRpe: Double?
        ) {
            self.compoundMin = compoundMin
            self.compoundMax = compoundMax
            self.isolationMin = isolationMin
            self.isolationMax = isolationMax
            self.restSeconds = restSeconds
            self.barbellCompoundStepMultiplier = barbellCompoundStepMultiplier
            self.maxEffortEarnsWeight = maxEffortEarnsWeight
            self.increaseWeightMaxRpe = increaseWeightMaxRpe
        }
    }

    public static let profiles: [TrainingGoal: Profile] = [
        .STRENGTH: Profile(
            compoundMin: 3, compoundMax: 6,
            isolationMin: 6, isolationMax: 10,
            restSeconds: 180,
            barbellCompoundStepMultiplier: 2,
            maxEffortEarnsWeight: false,
            increaseWeightMaxRpe: nil
        ),
        .HYPERTROPHY: Profile(
            compoundMin: 6, compoundMax: 10,
            isolationMin: 10, isolationMax: 15,
            restSeconds: 90,
            barbellCompoundStepMultiplier: 1,
            maxEffortEarnsWeight: true,
            increaseWeightMaxRpe: nil
        ),
        .ENDURANCE: Profile(
            compoundMin: 12, compoundMax: 20,
            isolationMin: 15, isolationMax: 25,
            restSeconds: 60,
            barbellCompoundStepMultiplier: 1,
            maxEffortEarnsWeight: false,
            increaseWeightMaxRpe: 9
        ),
    ]

    /// Default rest when no goal is set; a goal only rewrites this legacy value.
    public static let legacyDefaultRestSeconds = 90

    /// Template goal wins over the profile goal; `nil` means legacy behaviour.
    public static func resolve(templateGoal: TrainingGoal?, profileGoal: TrainingGoal?) -> TrainingGoal? {
        templateGoal ?? profileGoal
    }

    /// Rep band for a goal: isolation band only for `ExerciseCategory.ISOLATION`, else compound.
    public static func repRange(for goal: TrainingGoal, exercise: ExerciseDto? = nil) -> (min: Int, max: Int) {
        let p = profiles[goal]!
        if exercise?.category == .ISOLATION {
            return (p.isolationMin, p.isolationMax)
        }
        return (p.compoundMin, p.compoundMax)
    }

    /// A goal rewrites the untouched legacy default rest to its own; anything else is kept
    /// (0 = superset link, custom values are user intent).
    public static func resolveRestSeconds(_ restSeconds: Int, goal: TrainingGoal?) -> Int {
        guard let goal, restSeconds == legacyDefaultRestSeconds else { return restSeconds }
        return profiles[goal]!.restSeconds
    }
}
