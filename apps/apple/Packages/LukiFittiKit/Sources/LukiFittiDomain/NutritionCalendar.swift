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

    /// Ring fill for a day: share of the goal, or a full ring when something is logged without a goal.
    public static func ringProgress(eatenKcal: Double, goal: Int?) -> Double {
        NutritionMath.progress(eatenKcal, goal: goal) ?? (eatenKcal > 0 ? 1 : 0)
    }
}
