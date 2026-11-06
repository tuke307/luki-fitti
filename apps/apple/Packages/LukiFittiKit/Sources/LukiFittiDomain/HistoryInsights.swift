import Foundation
import LukiFittiModels

/// Muscles trained and personal bests for History. Port of
/// `packages/common/src/utils/history-insights.util.ts` (shared fixture
/// `history-insights-cases.json`): sessions are walked oldest first, so the first time a
/// weight × reps was reached wins a tie.
public struct HistoryInsights: Sendable, Equatable {
    public struct MuscleShare: Sendable, Equatable, Identifiable {
        public let muscle: MuscleGroup
        /// Completed sets, warm-ups included.
        public let sets: Int
        /// Working volume in kg (no warm-ups), rounded.
        public let volumeKg: Int
        /// Share of all counted sets, 0–100.
        public let pct: Int
        public var id: MuscleGroup { muscle }
    }

    public struct PersonalBest: Sendable, Equatable, Identifiable {
        /// Exercise id, or the name snapshot for exercises without one.
        public let key: String
        public let exerciseName: String
        public let muscle: MuscleGroup
        /// Heaviest working set in kg, rounded to 0.1.
        public let maxWeightKg: Double
        public let reps: Int
        /// Epley estimate of that set in kg, rounded to 0.1.
        public let est1RM: Double
        public let startedAt: String
        public var id: String { key }
    }

    public let muscles: [MuscleShare]
    /// Highest estimated max first.
    public let personalBests: [PersonalBest]

    public static let empty = HistoryInsights(sessions: [])

    public init(sessions: [WorkoutSessionDto], muscle: MuscleGroup? = nil, exerciseId: String? = nil) {
        var muscleSets: [MuscleGroup: (sets: Int, volumeKg: Double)] = [:]
        var bests: [String: PersonalBest] = [:]
        let ordered = sessions
            .map { (session: $0, date: LukiISODate.parse($0.startedAt) ?? .distantPast) }
            .enumerated()
            .sorted { $0.element.date != $1.element.date ? $0.element.date < $1.element.date : $0.offset < $1.offset }
            .map(\.element.session)

        for session in ordered {
            for ex in session.exercises {
                if let muscle, ex.primaryMuscleSnapshot != muscle { continue }
                if let exerciseId, ex.exerciseId != exerciseId { continue }
                let isStretch = ex.exerciseTypeSnapshot == .STRETCHING
                for set in ex.sets where set.completed {
                    var current = muscleSets[ex.primaryMuscleSnapshot] ?? (0, 0)
                    current.sets += 1
                    let reps = set.reps ?? 0
                    if !isStretch, set.setType != .STRETCH, set.setType != .WARMUP,
                       let weight = set.weight, weight > 0, reps > 0 {
                        let wKg = set.weightUnit == .LBS ? weight * ProgressionEngine.lbsToKg : weight
                        current.volumeKg += wKg * Double(reps)
                        let key = ex.exerciseId ?? ex.exerciseNameSnapshot
                        let maxWeightKg = Self.round1(wKg)
                        if let prev = bests[key], !(maxWeightKg > prev.maxWeightKg || (maxWeightKg == prev.maxWeightKg && reps > prev.reps)) {
                            // keep the earlier best
                        } else {
                            bests[key] = PersonalBest(
                                key: key,
                                exerciseName: ex.exerciseNameSnapshot,
                                muscle: ex.primaryMuscleSnapshot,
                                maxWeightKg: maxWeightKg,
                                reps: reps,
                                est1RM: Self.round1(wKg * (1 + Double(reps) / 30)),
                                startedAt: session.startedAt
                            )
                        }
                    }
                    muscleSets[ex.primaryMuscleSnapshot] = current
                }
            }
        }

        let total = muscleSets.values.reduce(0) { $0 + $1.sets }
        muscles = muscleSets
            .filter { $0.value.sets > 0 }
            .map { muscle, data in
                MuscleShare(
                    muscle: muscle,
                    sets: data.sets,
                    volumeKg: Int(data.volumeKg.rounded()),
                    pct: total > 0 ? Int((Double(data.sets) / Double(total) * 100).rounded()) : 0
                )
            }
            .sorted { $0.sets != $1.sets ? $0.sets > $1.sets : $0.muscle.rawValue < $1.muscle.rawValue }
        personalBests = bests.values
            .sorted { $0.est1RM != $1.est1RM ? $0.est1RM > $1.est1RM : $0.exerciseName < $1.exerciseName }
    }

    /// JS `Math.round(v * 10) / 10` (rounds .5 up, also for negatives).
    private static func round1(_ value: Double) -> Double {
        (value * 10 + 0.5).rounded(.down) / 10
    }
}
