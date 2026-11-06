import Foundation
import LukiFittiModels

/// Every completed session of one exercise for the exercise sheet: sets (warm-ups flagged), best
/// estimated 1RM, heaviest set, PR session and a trend line.
///
/// Swift port of `buildExerciseHistoryLog` in `packages/common/src/utils/exercise-history.util.ts`
/// — keep both in sync; they are checked against the same cases
/// (`packages/common/src/utils/__fixtures__/exercise-history-cases.json`).
public struct ExerciseHistoryLog: Sendable, Equatable {
    /// What an exercise's history is measured in: weight lifted, reps (bodyweight) or time.
    public enum Metric: String, Sendable, Equatable {
        case WEIGHT, REPS, DURATION
    }

    public struct LoggedSet: Sendable, Equatable, Hashable {
        public var warmup: Bool
        /// In the requested unit; `nil` when no weight was logged.
        public var weight: Double?
        public var reps: Int?
        public var durationSeconds: Int?
    }

    public struct Entry: Sendable, Equatable, Identifiable {
        public var clientSessionId: String
        public var workoutName: String
        public var startedAt: String
        /// Completed sets in logged order, warm-ups included.
        public var sets: [LoggedSet]
        /// Best estimated 1RM of the working sets; `nil` without weighted sets.
        public var bestEstimated1RM: Double?
        /// Headline value in the log's metric: estimated 1RM, most reps or longest set (s).
        public var best: Double
        public var isPersonalRecord: Bool
        public var id: String { clientSessionId }
    }

    public struct TrendPoint: Sendable, Equatable {
        public var startedAt: String
        public var value: Double
    }

    public var metric: Metric
    /// Newest first.
    public var sessions: [Entry]
    public var bestEstimated1RM: Double?
    public var heaviestSet: HeaviestSet?
    public var mostReps: Int?
    public var longestDurationSeconds: Int?
    /// Oldest first: estimated 1RM (weight) or most reps per session; empty for timed exercises.
    public var trend: [TrendPoint]

    public struct HeaviestSet: Sendable, Equatable {
        public var weight: Double
        public var reps: Int
    }

    public static func build(
        exerciseId: String?,
        exerciseName: String? = nil,
        exerciseType: ExerciseType? = nil,
        historySessions: [WorkoutSessionDto],
        weightUnit: WeightUnit = .KG
    ) -> ExerciseHistoryLog {
        let id = exerciseId.flatMap { $0.isEmpty ? nil : $0 }
        let name = exerciseName?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        var stretching = exerciseType == .STRETCHING

        var raw: [(session: WorkoutSessionDto, sets: [(set: LoggedSet, rpe: Double?)])] = []
        if id != nil || !name.isEmpty {
            let completed = historySessions
                .filter { $0.status == .COMPLETED || $0.completedAt != nil }
                .sorted { $0.startedAt < $1.startedAt }
            for session in completed {
                var sets: [(set: LoggedSet, rpe: Double?)] = []
                for ex in session.exercises {
                    let matches = (id != nil && ex.exerciseId == id)
                        || (ex.exerciseId == nil && !name.isEmpty
                            && ex.exerciseNameSnapshot.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == name)
                    guard matches else { continue }
                    if ex.exerciseTypeSnapshot == .STRETCHING { stretching = true }
                    for s in ex.sets where s.completed {
                        let weight = (s.weight ?? 0) > 0
                            ? ProgressionEngine.convertWeight(s.weight!, from: s.weightUnit, to: weightUnit)
                            : nil
                        let reps = (s.reps ?? 0) > 0 ? s.reps : nil
                        let duration = (s.durationSeconds ?? 0) > 0 ? s.durationSeconds : nil
                        if weight == nil && reps == nil && duration == nil { continue }
                        sets.append((LoggedSet(warmup: s.setType == .WARMUP, weight: weight, reps: reps, durationSeconds: duration), s.rpe))
                    }
                }
                if sets.contains(where: { !$0.set.warmup }) { raw.append((session, sets)) }
            }
        }

        let working = raw.flatMap { $0.sets.filter { !$0.set.warmup } }
        let metric: Metric = stretching
            ? .DURATION
            : working.contains { $0.set.weight != nil }
                ? .WEIGHT
                : working.contains { $0.set.reps != nil }
                    ? .REPS
                    : working.contains { $0.set.durationSeconds != nil } ? .DURATION : .WEIGHT

        var entries: [Entry] = raw.map { session, sets in
            let work = sets.filter { !$0.set.warmup }
            let bestEstimated1RM: Double? = stretching
                ? nil
                : work.compactMap { s -> Double? in
                    guard let weight = s.set.weight, let reps = s.set.reps else { return nil }
                    return ProgressionEngine.estimateOneRepMax(weight: weight, reps: reps, rpe: s.rpe)
                }.max()
            let best: Double = switch metric {
            case .WEIGHT: bestEstimated1RM ?? 0
            case .REPS: Double(work.compactMap(\.set.reps).max() ?? 0)
            case .DURATION: Double(work.compactMap(\.set.durationSeconds).max() ?? 0)
            }
            return Entry(
                clientSessionId: session.clientSessionId,
                workoutName: session.workoutNameSnapshot,
                startedAt: session.startedAt,
                sets: sets.map(\.set),
                bestEstimated1RM: bestEstimated1RM,
                best: best,
                isPersonalRecord: false
            )
        }

        // The PR is the first session that reached the best value; a single session is no record.
        if entries.count >= 2, let top = entries.map(\.best).max(), top > 0,
           let pr = entries.firstIndex(where: { $0.best == top }) {
            entries[pr].isPersonalRecord = true
        }

        var heaviest: HeaviestSet?
        if !stretching {
            for s in working.map(\.set) {
                guard let weight = s.weight else { continue }
                let reps = s.reps ?? 0
                if heaviest == nil || weight > heaviest!.weight || (weight == heaviest!.weight && reps > heaviest!.reps) {
                    heaviest = HeaviestSet(weight: weight, reps: reps)
                }
            }
        }

        return ExerciseHistoryLog(
            metric: metric,
            sessions: entries.reversed(),
            bestEstimated1RM: entries.compactMap(\.bestEstimated1RM).max(),
            heaviestSet: heaviest,
            mostReps: working.compactMap(\.set.reps).max(),
            longestDurationSeconds: working.compactMap(\.set.durationSeconds).max(),
            trend: metric == .DURATION
                ? []
                : entries.filter { $0.best > 0 }.map { TrendPoint(startedAt: $0.startedAt, value: $0.best) }
        )
    }

    private init(
        metric: Metric,
        sessions: [Entry],
        bestEstimated1RM: Double?,
        heaviestSet: HeaviestSet?,
        mostReps: Int?,
        longestDurationSeconds: Int?,
        trend: [TrendPoint]
    ) {
        self.metric = metric
        self.sessions = sessions
        self.bestEstimated1RM = bestEstimated1RM
        self.heaviestSet = heaviestSet
        self.mostReps = mostReps
        self.longestDurationSeconds = longestDurationSeconds
        self.trend = trend
    }
}
