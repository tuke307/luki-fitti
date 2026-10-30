import Foundation

/// Date math for the weekly weigh-in reminder (the iOS app schedules the notifications).
public enum WeighInSchedule {
    public static let identifierPrefix = "lukifitti.weighin."

    /// Next `count` reminder dates for (weekday, minutes after midnight). The occurrence in the
    /// current week is dropped when `hasWeighInThisWeek` (iOS can't skip one repeat of a trigger).
    public static func upcomingDates(
        weekday: Int,
        minutes: Int,
        after now: Date,
        hasWeighInThisWeek: Bool,
        calendar: Calendar = .current,
        count: Int = 4
    ) -> [Date] {
        let clampedMinutes = min(1439, max(0, minutes))
        let components = DateComponents(hour: clampedMinutes / 60, minute: clampedMinutes % 60, weekday: min(7, max(1, weekday)))
        let currentWeek = calendar.dateInterval(of: .weekOfYear, for: now)
        var dates: [Date] = []
        var cursor = now
        while dates.count < count {
            guard let next = calendar.nextDate(after: cursor, matching: components, matchingPolicy: .nextTime) else { break }
            cursor = next
            if hasWeighInThisWeek, let currentWeek, currentWeek.contains(next) { continue }
            dates.append(next)
        }
        return dates
    }

    /// `lukifitti.weighin.<yyyy>-<ww>` (week-based year and week of year).
    public static func identifier(for date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        return identifierPrefix + String(format: "%04d-%02d", c.yearForWeekOfYear ?? 0, c.weekOfYear ?? 0)
    }

    /// Start of the week containing `date`.
    public static func weekStart(of date: Date = Date(), calendar: Calendar = .current) -> Date {
        calendar.dateInterval(of: .weekOfYear, for: date)?.start ?? calendar.startOfDay(for: date)
    }
}
