import Foundation
import LukiFittiModels

public enum HistoryPeriod: String, CaseIterable, Sendable {
    case week, month, year, all

    public func cutoff(now: Date) -> Date? {
        switch self {
        case .week: now.addingTimeInterval(-7 * 86_400)
        case .month: now.addingTimeInterval(-30 * 86_400)
        case .year: now.addingTimeInterval(-365 * 86_400)
        case .all: nil
        }
    }
}

/// History analytics derived once per filter change: sessions with parsed dates, a by-day index and
/// the period aggregates, so views never re-filter or re-parse while rendering.
public struct WorkoutHistorySnapshot: Sendable {
    public struct Item: Identifiable, Sendable {
        public let session: WorkoutSessionDto
        public let date: Date
        public var id: String { session.id }
    }

    public struct Bucket: Sendable, Equatable {
        public var count: Int
        public var sets: Int
        public var volumeKg: Double

        public init(count: Int = 0, sets: Int = 0, volumeKg: Double = 0) {
            self.count = count
            self.sets = sets
            self.volumeKg = volumeKg
        }
    }

    public struct ProgressPoint: Identifiable, Sendable {
        public let id: String
        public let date: Date
        public let volumeKg: Double
        public let sets: Int
    }

    /// One session's best set of the filtered exercise (kg), for the exercise progress chart.
    public struct ExercisePoint: Identifiable, Sendable {
        public let id: String
        public let date: Date
        public let maxWeightKg: Double
        public let est1RM: Double
    }

    public let items: [Item]
    public let byDay: [Date: [WorkoutSessionDto]]
    public let byMonth: [DateComponents: Bucket]
    public let byYear: [Int: Bucket]
    public let setsByMuscle: [MuscleGroup: Int]
    public let progression: [ProgressPoint]
    /// Filled only with an exercise filter; the last 20 sessions with a working set of it.
    public let exerciseProgression: [ExercisePoint]
    public let insights: HistoryInsights
    public let strengthCount: Int
    public let stretchCount: Int
    public let totalVolumeKg: Double
    public let totalSets: Int
    public let totalReps: Int
    public let totalStretchSeconds: Int

    public static let empty = WorkoutHistorySnapshot(sessions: [], period: .all, muscle: nil)

    /// Distinct exercises (id + latest name) logged in `sessions`, sorted by name.
    public static func loggedExercises(in sessions: [WorkoutSessionDto]) -> [(id: String, name: String)] {
        var names: [String: String] = [:]
        for session in sessions {
            for ex in session.exercises where ex.hasLoggedSet {
                if let id = ex.exerciseId, names[id] == nil { names[id] = ex.exerciseNameSnapshot }
            }
        }
        return names.map { (id: $0.key, name: $0.value) }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }

    public init(
        sessions: [WorkoutSessionDto],
        period: HistoryPeriod,
        muscle: MuscleGroup?,
        exerciseId: String? = nil,
        now: Date = Date(),
        calendar: Calendar = .current
    ) {
        let cutoff = period.cutoff(now: now)
        var items: [Item] = []
        var byDay: [Date: [WorkoutSessionDto]] = [:]
        var byMonth: [DateComponents: Bucket] = [:]
        var byYear: [Int: Bucket] = [:]
        var setsByMuscle: [MuscleGroup: Int] = [:]
        var strength = 0, stretch = 0, sets = 0, reps = 0, stretchSeconds = 0
        var volume = 0.0
        for session in sessions {
            let date = LukiISODate.parse(session.startedAt) ?? now
            if let cutoff, date < cutoff { continue }
            if let muscle, !session.exercises.contains(where: { $0.primaryMuscleSnapshot == muscle }) { continue }
            if let exerciseId, !session.exercises.contains(where: { $0.exerciseId == exerciseId }) { continue }
            items.append(Item(session: session, date: date))
            byDay[calendar.startOfDay(for: date), default: []].append(session)
            let comps = calendar.dateComponents([.year, .month], from: date)
            byMonth[comps, default: Bucket()].add(session)
            byYear[comps.year ?? 0, default: Bucket()].add(session)
            if session.sessionType == .STRETCHING { stretch += 1 } else { strength += 1 }
            volume += session.totalVolumeKg
            sets += session.totalSetsCompleted
            reps += session.totalRepsCompleted
            stretchSeconds += session.totalStretchSeconds
            for exercise in session.exercises {
                setsByMuscle[exercise.primaryMuscleSnapshot, default: 0] += exercise.sets.filter(\.completed).count
            }
        }
        self.items = items
        self.byDay = byDay
        self.byMonth = byMonth
        self.byYear = byYear
        self.setsByMuscle = setsByMuscle
        self.progression = items
            .filter { $0.session.sessionType != .STRETCHING && $0.session.totalVolumeKg > 0 }
            .sorted { $0.date < $1.date }
            .suffix(20)
            .map { ProgressPoint(id: $0.id, date: $0.date, volumeKg: $0.session.totalVolumeKg, sets: $0.session.totalSetsCompleted) }
        self.exerciseProgression = exerciseId.map { id in
            Array(items.sorted { $0.date < $1.date }.compactMap { item -> ExercisePoint? in
                var maxKg = 0.0, best = 0.0
                for ex in item.session.exercises where ex.exerciseId == id && ex.exerciseTypeSnapshot != .STRETCHING {
                    for set in ex.sets where set.completed && set.setType != .WARMUP && set.setType != .STRETCH {
                        guard let weight = set.weight, weight > 0, let reps = set.reps, reps > 0 else { continue }
                        let wKg = set.weightUnit == .LBS ? weight * ProgressionEngine.lbsToKg : weight
                        maxKg = max(maxKg, wKg)
                        best = max(best, wKg * (1 + Double(reps) / 30))
                    }
                }
                return maxKg > 0 ? ExercisePoint(id: item.id, date: item.date, maxWeightKg: maxKg, est1RM: best) : nil
            }
            .suffix(20))
        } ?? []
        self.insights = HistoryInsights(sessions: items.map(\.session), muscle: muscle, exerciseId: exerciseId)
        strengthCount = strength
        stretchCount = stretch
        totalVolumeKg = volume
        totalSets = sets
        totalReps = reps
        totalStretchSeconds = stretchSeconds
    }

    public var count: Int { items.count }

    public func sessions(on day: Date, calendar: Calendar = .current) -> [WorkoutSessionDto] {
        byDay[calendar.startOfDay(for: day)] ?? []
    }

    public func bucket(month date: Date, calendar: Calendar = .current) -> Bucket {
        byMonth[calendar.dateComponents([.year, .month], from: date)] ?? Bucket()
    }
}

extension WorkoutHistorySnapshot.Bucket {
    mutating func add(_ session: WorkoutSessionDto) {
        count += 1
        sets += session.totalSetsCompleted
        volumeKg += session.totalVolumeKg
    }
}
