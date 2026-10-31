import Foundation
import LukiFittiModels

/// Weekly hard sets per muscle. A set counts fully for the exercise's primary muscle and half for
/// each secondary muscle (e.g. bench press → chest 1, triceps 0.5, shoulders 0.5), which reflects
/// the real stimulus better than primary-only counts.
///
/// Swift port of `packages/common/src/utils/muscle-volume.util.ts` — keep the numbers in sync.
public enum MuscleVolume {
    public static let weeklySetsTarget = 10.0...20.0
    public static let secondarySetShare = 0.5

    public enum Status: String, Sendable, Equatable {
        case below, within, above
    }

    public struct WeeklySets: Sendable, Equatable {
        public let muscle: MuscleGroup
        /// Average weighted sets per week (primary + ½ secondary), rounded to 0.5.
        public let setsPerWeek: Double
        /// Average sets per week where this muscle was the primary target.
        public let directSetsPerWeek: Double
        public let status: Status

        public init(muscle: MuscleGroup, setsPerWeek: Double, directSetsPerWeek: Double, status: Status) {
            self.muscle = muscle
            self.setsPerWeek = setsPerWeek
            self.directSetsPerWeek = directSetsPerWeek
            self.status = status
        }
    }

    private static func roundHalf(_ v: Double) -> Double { NutritionMath.jsRound(v * 2) / 2 }

    public static func status(setsPerWeek: Double) -> Status {
        if setsPerWeek < weeklySetsTarget.lowerBound { return .below }
        if setsPerWeek > weeklySetsTarget.upperBound { return .above }
        return .within
    }

    /// Average weekly sets per muscle over the `weeks` ending at `now`. Only completed working sets
    /// of strength exercises count (no warm-ups, stretching or cardio). `secondaryMuscles` resolves
    /// an exercise id to its secondary muscles (from the catalog); unknown ids count primary-only.
    /// Full-body entries have no single muscle and are left out.
    public static func weeklySetsByMuscle(
        _ sessions: [WorkoutSessionDto],
        secondaryMuscles: (String) -> [MuscleGroup]?,
        weeks: Int,
        now: Date = Date()
    ) -> [WeeklySets] {
        let weeks = max(1, weeks)
        let start = now.addingTimeInterval(-Double(weeks) * 7 * 86_400)
        var total: [MuscleGroup: Double] = [:]
        var direct: [MuscleGroup: Double] = [:]

        for session in sessions {
            guard let t = LukiISODate.parse(session.startedAt), t >= start, t <= now else { continue }
            for exercise in session.exercises where exercise.exerciseTypeSnapshot == .STRENGTH {
                let hardSets = Double(exercise.sets.filter {
                    $0.completed && $0.setType != .WARMUP && $0.setType != .STRETCH
                }.count)
                guard hardSets > 0 else { continue }
                let primary = exercise.primaryMuscleSnapshot
                if primary != .FULL_BODY {
                    total[primary, default: 0] += hardSets
                    direct[primary, default: 0] += hardSets
                }
                let secondary = Set(exercise.exerciseId.flatMap(secondaryMuscles) ?? [])
                for muscle in secondary where muscle != primary && muscle != .FULL_BODY {
                    total[muscle, default: 0] += hardSets * secondarySetShare
                }
            }
        }

        return total
            .map { muscle, sets in
                let perWeek = roundHalf(sets / Double(weeks))
                return WeeklySets(
                    muscle: muscle,
                    setsPerWeek: perWeek,
                    directSetsPerWeek: roundHalf((direct[muscle] ?? 0) / Double(weeks)),
                    status: status(setsPerWeek: perWeek)
                )
            }
            .filter { $0.setsPerWeek > 0 }
            .sorted { $0.setsPerWeek != $1.setsPerWeek ? $0.setsPerWeek > $1.setsPerWeek : $0.muscle.rawValue < $1.muscle.rawValue }
    }
}
