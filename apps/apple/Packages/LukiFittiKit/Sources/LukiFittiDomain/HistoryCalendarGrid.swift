import Foundation

/// Day grid for the History tab's week and month cards (mirrors `activityData` in the web
/// diary-analytics view). Columns are always ISO Monday…Sunday, whatever `firstWeekday` the
/// device calendar uses.
public struct HistoryCalendarGrid: Sendable, Equatable {
    public enum Span: Sendable, Equatable {
        /// The current ISO week, Monday through Sunday (days after today included).
        case week
        /// The 30 days ending today.
        case month
    }

    /// Empty cells before the first day so it lands in its weekday column.
    public let leadingBlanks: Int
    /// Start of each day, in order.
    public let days: [Date]

    public init(span: Span, today: Date = Date(), calendar: Calendar = .current) {
        let today = calendar.startOfDay(for: today)
        let first: Date
        let count: Int
        switch span {
        case .week:
            first = calendar.date(byAdding: .day, value: -Self.isoWeekdayIndex(of: today, calendar: calendar), to: today) ?? today
            count = 7
        case .month:
            first = calendar.date(byAdding: .day, value: -29, to: today) ?? today
            count = 30
        }
        leadingBlanks = span == .week ? 0 : Self.isoWeekdayIndex(of: first, calendar: calendar)
        days = (0..<count).compactMap { calendar.date(byAdding: .day, value: $0, to: first) }
    }

    /// 0 for Monday … 6 for Sunday.
    public static func isoWeekdayIndex(of date: Date, calendar: Calendar = .current) -> Int {
        (calendar.component(.weekday, from: date) + 5) % 7
    }

    /// Short weekday names, Monday first ("Mon"…"Sun" / "Mo."…"So.").
    public static func weekdaySymbols(locale: Locale) -> [String] {
        var cal = Calendar(identifier: .gregorian)
        cal.locale = locale
        let symbols = cal.shortStandaloneWeekdaySymbols
        return Array(symbols[1...] + symbols[..<1])
    }
}
