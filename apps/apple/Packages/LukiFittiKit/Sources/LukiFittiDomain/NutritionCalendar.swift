import Foundation
import LukiFittiModels

/// Day and week helpers for the Food tab: by-day indexes and the week strip layout.
public enum NutritionCalendar {
    public struct BurnedWorkout: Sendable, Equatable {
        public let session: WorkoutSessionDto
        public let kcal: Int
    }

    /// Entries grouped by local day, each day sorted by time eaten.
    public static func entriesByDay(_ entries: [MealEntryDto], calendar: Calendar = .current) -> [Date: [MealEntryDto]] {
        var grouped: [Date: [(date: Date, entry: MealEntryDto)]] = [:]
        for entry in entries {
            guard let date = entry.eatenAtDate else { continue }
            grouped[calendar.startOfDay(for: date), default: []].append((date, entry))
        }
        return grouped.mapValues { $0.sorted { $0.date < $1.date }.map(\.entry) }
    }

    /// Burned kcal per local day, estimated once per history change.
    public static func burnByDay(
        _ sessions: [WorkoutSessionDto],
        calendar: Calendar = .current,
        bodyWeightKg: (Date) -> Double?
    ) -> [Date: [BurnedWorkout]] {
        var result: [Date: [BurnedWorkout]] = [:]
        for session in sessions {
            guard let date = LukiISODate.parse(session.startedAt) else { continue }
            let kcal = NutritionMath.burnedKcal(for: session, bodyWeightKg: bodyWeightKg(date))
            result[calendar.startOfDay(for: date), default: []].append(BurnedWorkout(session: session, kcal: kcal))
        }
        return result
    }

    // MARK: Burned calories with Apple Health

    /// One row of a day's burned calories.
    public enum BurnedItem: Sendable, Equatable, Identifiable {
        /// A LukiFitti session; `kcal` is Apple Health's value when another app recorded it too.
        case session(WorkoutSessionDto, kcal: Int, mergedWorkout: HealthWorkoutDto?)
        /// A workout from another app (Strava, Garmin, …) that LukiFitti didn't track.
        case healthWorkout(HealthWorkoutDto, kcal: Int)
        /// Apple Health active energy not explained by the listed workouts.
        case dailyActivity(kcal: Int)

        public var kcal: Int {
            switch self {
            case .session(_, let kcal, _), .healthWorkout(_, let kcal), .dailyActivity(let kcal): kcal
            }
        }

        public var id: String {
            switch self {
            case .session(let s, _, _): "session-\(s.clientSessionId)"
            case .healthWorkout(let w, _): "health-\(w.healthKitUuid)"
            case .dailyActivity: "daily-activity"
            }
        }
    }

    /// Burned calories of one local day.
    public struct DayBurn: Sendable, Equatable {
        /// Sessions and external workouts by start time, then the daily activity remainder.
        public let items: [BurnedItem]
        /// Total active kcal for the day (Apple Health's daily total wins when present).
        public let total: Int
        /// Whether Apple Health reported active energy for the day.
        public let hasHealthDay: Bool

        public init(items: [BurnedItem], total: Int, hasHealthDay: Bool) {
            self.items = items
            self.total = total
            self.hasHealthDay = hasHealthDay
        }

        public static let empty = DayBurn(items: [], total: 0, hasHealthDay: false)
    }

    /// Two intervals "match" when they overlap by at least half of the shorter one.
    static func overlapsMostly(_ a: DateInterval, _ b: DateInterval) -> Bool {
        let overlap = min(a.end, b.end).timeIntervalSince(max(a.start, b.start))
        guard overlap > 0 else { return false }
        return overlap >= 0.5 * min(a.duration, b.duration)
    }

    static func interval(_ session: WorkoutSessionDto) -> DateInterval? {
        guard session.status == .COMPLETED,
              let start = LukiISODate.parse(session.startedAt),
              let end = session.completedAt.flatMap(LukiISODate.parse),
              end > start else { return nil }
        return DateInterval(start: start, end: end)
    }

    static func interval(_ workout: HealthWorkoutDto) -> DateInterval? {
        guard let start = workout.startedAtDate, let end = workout.endedAtDate, end > start else { return nil }
        return DateInterval(start: start, end: end)
    }

    /// Burned kcal per local day, combining LukiFitti sessions with Apple Health.
    ///
    /// - A completed session is *covered* when any Health workout (own or from another app)
    ///   overlaps it by ≥ 50 % of the shorter duration; it then shows the other app's active
    ///   energy when there is one (Health wins), else LukiFitti's estimate.
    /// - Workouts from other apps are listed on their start day unless merged into a session;
    ///   LukiFitti's own Health workouts are never listed.
    /// - With a Health day total: `total = health + uncovered sessions` and the remainder after
    ///   listed workouts shows as "daily activity" (≥ 0). Without one: sessions + listed workouts.
    public static func dayBurns(
        sessions: [WorkoutSessionDto],
        healthDays: [HealthDailyEnergyDto] = [],
        healthWorkouts: [HealthWorkoutDto] = [],
        calendar: Calendar = .current,
        bodyWeightKg: (Date) -> Double?
    ) -> [Date: DayBurn] {
        let workouts = healthWorkouts.compactMap { w in interval(w).map { (workout: w, interval: $0) } }
        var mergedExternal = Set<String>()

        struct SessionRow { let start: Date; let item: BurnedItem; let covered: Bool }
        var sessionRows: [Date: [SessionRow]] = [:]
        for session in sessions {
            guard let start = LukiISODate.parse(session.startedAt) else { continue }
            let estimate = NutritionMath.burnedKcal(for: session, bodyWeightKg: bodyWeightKg(start))
            var covered = false
            var external: HealthWorkoutDto?
            if let span = interval(session) {
                let matches = workouts.filter { overlapsMostly(span, $0.interval) }
                covered = !matches.isEmpty
                let externals = matches.filter { !$0.workout.isOwn }
                externals.forEach { mergedExternal.insert($0.workout.healthKitUuid) }
                external = externals.first { $0.workout.activeKcal != nil }?.workout ?? externals.first?.workout
            }
            let kcal = external?.activeKcal.map { Int(max(0, $0).rounded()) } ?? estimate
            sessionRows[calendar.startOfDay(for: start), default: []].append(
                SessionRow(start: start, item: .session(session, kcal: kcal, mergedWorkout: external), covered: covered)
            )
        }

        var externalRows: [Date: [(start: Date, item: BurnedItem)]] = [:]
        for (workout, span) in workouts where !workout.isOwn && !mergedExternal.contains(workout.healthKitUuid) {
            let kcal = Int(max(0, workout.activeKcal ?? 0).rounded())
            externalRows[calendar.startOfDay(for: span.start), default: []].append(
                (span.start, .healthWorkout(workout, kcal: kcal))
            )
        }

        var healthByDay: [Date: Double] = [:]
        for day in healthDays {
            guard let date = LukiDayKey.date(day.day, calendar: calendar), day.activeKcal.isFinite else { continue }
            healthByDay[date] = max(0, day.activeKcal)
        }

        var result: [Date: DayBurn] = [:]
        let allDays = Set(sessionRows.keys).union(externalRows.keys).union(healthByDay.keys)
        for day in allDays {
            let sessions = sessionRows[day] ?? []
            let externals = externalRows[day] ?? []
            var items = (sessions.map { ($0.start, $0.item) } + externals)
                .sorted { $0.0 < $1.0 }
                .map(\.1)
            let externalKcal = externals.reduce(0) { $0 + $1.item.kcal }
            if let health = healthByDay[day] {
                let covered = sessions.filter(\.covered).reduce(0) { $0 + $1.item.kcal }
                let uncovered = sessions.filter { !$0.covered }.reduce(0) { $0 + $1.item.kcal }
                let remainder = max(0, Int(health.rounded()) - externalKcal - covered)
                items.append(.dailyActivity(kcal: remainder))
                result[day] = DayBurn(items: items, total: Int(health.rounded()) + uncovered, hasHealthDay: true)
            } else {
                let total = sessions.reduce(0) { $0 + $1.item.kcal } + externalKcal
                result[day] = DayBurn(items: items, total: total, hasHealthDay: false)
            }
        }
        return result
    }

    public static func weekStart(for date: Date, calendar: Calendar = .current) -> Date {
        calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? calendar.startOfDay(for: date)
    }

    public static func days(ofWeekStarting start: Date, calendar: Calendar = .current) -> [Date] {
        (0..<7).compactMap { calendar.date(byAdding: .day, value: $0, to: start) }
    }

    /// Week starts from the week containing `oldest` through the week containing `newest`, oldest first.
    public static func weekStarts(from oldest: Date, through newest: Date, calendar: Calendar = .current) -> [Date] {
        let last = weekStart(for: newest, calendar: calendar)
        var current = weekStart(for: min(oldest, newest), calendar: calendar)
        var result: [Date] = []
        while current <= last {
            result.append(current)
            guard let next = calendar.date(byAdding: .weekOfYear, value: 1, to: current) else { break }
            current = next
        }
        return result
    }

    /// Ring fill for a day: eaten share of the budget (goal + burned), or a full ring when
    /// something is logged without a goal.
    public static func ringProgress(eatenKcal: Double, goal: Int?, burnedKcal: Int = 0) -> Double {
        guard let goal, goal > 0 else { return eatenKcal > 0 ? 1 : 0 }
        let budget = Double(goal + max(0, burnedKcal))
        return min(1, max(0, eatenKcal / budget))
    }
}
