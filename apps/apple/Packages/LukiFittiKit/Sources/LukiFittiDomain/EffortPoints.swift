import Foundation
import LukiFittiModels

/// Swift mirror of `packages/common/src/utils/effort-points.util.ts`. The shared fixture
/// `effort-points-cases.json` keeps the two implementations in sync — changes to the
/// formula must land on both sides with the same expectations.
public enum EffortPoints {
    public struct SetInput: Sendable, Equatable {
        public var setType: String
        public var completed: Bool
        /// ISO-8601 timestamp; nil = untimed (plausibility rules skip the gap check).
        public var completedAt: String?
        public var isPersonalRecord: Bool
        public var durationSeconds: Int?

        public init(
            setType: String,
            completed: Bool,
            completedAt: String? = nil,
            isPersonalRecord: Bool,
            durationSeconds: Int? = nil
        ) {
            self.setType = setType
            self.completed = completed
            self.completedAt = completedAt
            self.isPersonalRecord = isPersonalRecord
            self.durationSeconds = durationSeconds
        }
    }

    public struct ExerciseInput: Sendable, Equatable {
        public var exerciseTypeSnapshot: String
        /// Exercise's primary muscle; attributes set/PR points to raid weak spots.
        public var primaryMuscleSnapshot: String?
        /// Display name, used only to report `topExercise`.
        public var exerciseNameSnapshot: String?
        public var sets: [SetInput]

        public init(
            exerciseTypeSnapshot: String,
            primaryMuscleSnapshot: String? = nil,
            exerciseNameSnapshot: String? = nil,
            sets: [SetInput]
        ) {
            self.exerciseTypeSnapshot = exerciseTypeSnapshot
            self.primaryMuscleSnapshot = primaryMuscleSnapshot
            self.exerciseNameSnapshot = exerciseNameSnapshot
            self.sets = sets
        }
    }

    public struct SessionInput: Sendable, Equatable {
        public var status: String
        public var sessionType: String
        public var sourceDevice: String?
        public var activeDurationSeconds: Int
        public var totalStretchSeconds: Int
        public var exercises: [ExerciseInput]

        public init(
            status: String,
            sessionType: String,
            sourceDevice: String? = nil,
            activeDurationSeconds: Int,
            totalStretchSeconds: Int,
            exercises: [ExerciseInput]
        ) {
            self.status = status
            self.sessionType = sessionType
            self.sourceDevice = sourceDevice
            self.activeDurationSeconds = activeDurationSeconds
            self.totalStretchSeconds = totalStretchSeconds
            self.exercises = exercises
        }
    }

    /// Counts/minutes behind `total` (not point values), same shape as the TS breakdown.
    public struct Breakdown: Sendable, Equatable {
        public var sets = 0
        public var warmups = 0
        public var prs = 0
        public var cardioMinutes = 0
        public var stretchMinutes = 0
        public var finishBonus = 0
        public var droppedSets = 0

        public init() {}
    }

    public struct Result: Sendable, Equatable {
        public var total: Int
        public var breakdown: Breakdown
        /// Points attributed per weak spot: set + PR points under the exercise's
        /// `primaryMuscleSnapshot`, cardio points under "CARDIO", stretch points under
        /// "STRETCHING". The finish bonus is unattributed. Keys match `WeakSpot`.
        public var pointsByWeakSpot: [String: Int]
        /// Name of the exercise that earned the most points, when one did.
        public var topExercise: String?
    }

    public static let workingSet = 10
    public static let warmupSet = 2
    public static let personalRecord = 25
    public static let maxPrsPerSession = 3
    public static let perCardioMinute = 2
    public static let perStretchMinute = 2
    public static let maxStretchPoints = 60
    public static let finishBonus = 20
    public static let minActiveSeconds = 300
    public static let finishBonusMinSeconds = 600
    /// One set every 15 s is the physical floor; faster or more is implausible.
    public static let setPlausibilitySeconds = 15

    /// `completedAt` parsing must match JS `Date.parse` on the ISO strings the API emits
    /// (always millisecond precision with a `Z`). Returns epoch milliseconds, nil = NaN.
    /// The formatter is created per call: `ISO8601DateFormatter` is not `Sendable`, and
    /// the call sites (sync + summary card) are not hot enough to cache unsafely.
    public static func epochMillis(_ iso: String?) -> Double? {
        guard let iso else { return nil }
        let withFraction = ISO8601DateFormatter()
        withFraction.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = withFraction.date(from: iso) {
            return date.timeIntervalSince1970 * 1000
        }
        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return plain.date(from: iso).map { $0.timeIntervalSince1970 * 1000 }
    }

    public static func compute(session: SessionInput) -> Result {
        if session.status != "COMPLETED" || session.sourceDevice == "IMPORT"
            || session.activeDurationSeconds < minActiveSeconds
        {
            return Result(total: 0, breakdown: Breakdown(), pointsByWeakSpot: [:], topExercise: nil)
        }

        var breakdown = Breakdown()
        let maxSets = session.activeDurationSeconds / setPlausibilitySeconds
        let isStretchSession = session.sessionType == "STRETCHING"
        var countedSets = 0
        var lastCountedAt: Double?
        // Stretch sessions take the already-aggregated totalStretchSeconds; per-set
        // durations would double-count them.
        var stretchSeconds = isStretchSession ? session.totalStretchSeconds : 0

        // Plausibility rules run on the chronological order the sets were actually
        // performed in, not on exercise-array order. Untimed sets keep their relative
        // order after all timed ones (stable sort, infinity key).
        var pointsByWeakSpot: [String: Int] = [:]
        func credit(_ spot: String?, _ points: Int) {
            guard let spot, points > 0 else { return }
            pointsByWeakSpot[spot, default: 0] += points
        }
        var orderedSets: [(set: SetInput, exerciseType: String, primaryMuscle: String?, order: Int)] = []
        var pointsByExercise: [Int: Int] = [:]
        func creditExercise(_ index: Int, _ points: Int) {
            guard points > 0 else { return }
            pointsByExercise[index, default: 0] += points
        }
        var exerciseIndexByOrder: [Int] = []
        for (exerciseIndex, exercise) in session.exercises.enumerated() {
            for set in exercise.sets where set.completed {
                exerciseIndexByOrder.append(exerciseIndex)
                orderedSets.append((
                    set, exercise.exerciseTypeSnapshot, exercise.primaryMuscleSnapshot,
                    orderedSets.count
                ))
            }
        }
        orderedSets.sort { lhs, rhs in
            let l = epochMillis(lhs.set.completedAt) ?? .infinity
            let r = epochMillis(rhs.set.completedAt) ?? .infinity
            return l == r ? lhs.order < rhs.order : l < r
        }

        for entry in orderedSets {
            let set = entry.set
            if countedSets >= maxSets {
                breakdown.droppedSets += 1
                continue
            }
            let completedAtMs = epochMillis(set.completedAt)
            if let last = lastCountedAt, let ms = completedAtMs,
                ms - last < Double(setPlausibilitySeconds * 1000)
            {
                breakdown.droppedSets += 1
                continue
            }
            countedSets += 1
            if let ms = completedAtMs { lastCountedAt = ms }

            let isWarmup = set.setType == "WARMUP"
            let isStrength = entry.exerciseType == "STRENGTH"
            let isStretchingExercise = entry.exerciseType == "STRETCHING"

            let exerciseIndex = exerciseIndexByOrder[entry.order]
            if isWarmup {
                breakdown.warmups += 1
                credit(entry.primaryMuscle, warmupSet)
                creditExercise(exerciseIndex, warmupSet)
            } else if isStrength && (set.setType == "WORKING" || set.setType == "DROPSET") {
                breakdown.sets += 1
                credit(entry.primaryMuscle, workingSet)
                creditExercise(exerciseIndex, workingSet)
            } else if entry.exerciseType == "CARDIO" {
                let minutes = (set.durationSeconds ?? 0) / 60
                breakdown.cardioMinutes += minutes
                creditExercise(exerciseIndex, minutes * perCardioMinute)
            } else if !isStretchSession && (isStretchingExercise || set.setType == "STRETCH") {
                let seconds = set.durationSeconds ?? 0
                stretchSeconds += seconds
                creditExercise(exerciseIndex, seconds / 60 * perStretchMinute)
            }

            if set.isPersonalRecord && breakdown.prs < maxPrsPerSession {
                breakdown.prs += 1
                credit(entry.primaryMuscle, personalRecord)
                creditExercise(exerciseIndex, personalRecord)
            }
        }

        breakdown.stretchMinutes = min(
            stretchSeconds / 60,
            maxStretchPoints / perStretchMinute
        )
        if session.activeDurationSeconds >= finishBonusMinSeconds {
            breakdown.finishBonus = finishBonus
        }

        credit("CARDIO", breakdown.cardioMinutes * perCardioMinute)
        credit("STRETCHING", breakdown.stretchMinutes * perStretchMinute)

        let total =
            breakdown.sets * workingSet +
            breakdown.warmups * warmupSet +
            breakdown.prs * personalRecord +
            breakdown.cardioMinutes * perCardioMinute +
            breakdown.stretchMinutes * perStretchMinute +
            breakdown.finishBonus
        var topExercise: String?
        var topPoints = 0
        for (index, points) in pointsByExercise where points > topPoints {
            topPoints = points
            topExercise = session.exercises[index].exerciseNameSnapshot
        }
        return Result(
            total: total,
            breakdown: breakdown,
            pointsByWeakSpot: pointsByWeakSpot,
            topExercise: topExercise
        )
    }
}

public extension WorkoutSessionDto {
    /// The `EffortPoints.SessionInput` view of a synced session for the local "+N EP" display.
    var effortPointsInput: EffortPoints.SessionInput {
        EffortPoints.SessionInput(
            status: status.rawValue,
            sessionType: sessionType.rawValue,
            sourceDevice: sourceDevice?.rawValue,
            activeDurationSeconds: activeDurationSeconds,
            totalStretchSeconds: totalStretchSeconds,
            exercises: exercises.map {
                EffortPoints.ExerciseInput(
                    exerciseTypeSnapshot: $0.exerciseTypeSnapshot.rawValue,
                    primaryMuscleSnapshot: $0.primaryMuscleSnapshot.rawValue,
                    exerciseNameSnapshot: $0.exerciseNameSnapshot,
                    sets: $0.sets.map {
                        EffortPoints.SetInput(
                            setType: $0.setType.rawValue,
                            completed: $0.completed,
                            completedAt: $0.completedAt,
                            isPersonalRecord: $0.isPersonalRecord,
                            durationSeconds: $0.durationSeconds
                        )
                    }
                )
            }
        )
    }
}
