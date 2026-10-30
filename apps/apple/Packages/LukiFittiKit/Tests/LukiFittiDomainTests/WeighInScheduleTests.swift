import XCTest
@testable import LukiFittiDomain

final class WeighInScheduleTests: XCTestCase {
    private var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Berlin")!
        cal.firstWeekday = 2 // Monday
        cal.minimumDaysInFirstWeek = 4
        return cal
    }

    private func date(_ y: Int, _ m: Int, _ d: Int, _ h: Int = 0, _ min: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: y, month: m, day: d, hour: h, minute: min))!
    }

    func testNextFourMondaysAtHalfPastSeven() {
        // Sunday 2026-11-01 12:00 → Mondays Nov 2, 9, 16, 23 at 07:30.
        let dates = WeighInSchedule.upcomingDates(
            weekday: 2, minutes: 450, after: date(2026, 11, 1, 12), hasWeighInThisWeek: false, calendar: calendar
        )
        XCTAssertEqual(dates, [date(2026, 11, 2, 7, 30), date(2026, 11, 9, 7, 30), date(2026, 11, 16, 7, 30), date(2026, 11, 23, 7, 30)])
    }

    func testSkipsCurrentWeekWhenAlreadyWeighedIn() {
        // Monday 2026-11-02 06:00 (before the reminder), already weighed in this week.
        let now = date(2026, 11, 2, 6)
        let dates = WeighInSchedule.upcomingDates(weekday: 2, minutes: 450, after: now, hasWeighInThisWeek: true, calendar: calendar)
        XCTAssertEqual(dates.first, date(2026, 11, 9, 7, 30))
        XCTAssertEqual(dates.count, 4)
        // Without a weigh-in the same morning's reminder stays.
        let unskipped = WeighInSchedule.upcomingDates(weekday: 2, minutes: 450, after: now, hasWeighInThisWeek: false, calendar: calendar)
        XCTAssertEqual(unskipped.first, date(2026, 11, 2, 7, 30))
    }

    func testIdentifierUsesWeekBasedYear() {
        XCTAssertEqual(WeighInSchedule.identifier(for: date(2026, 11, 2, 7, 30), calendar: calendar), "lukifitti.weighin.2026-45")
        // 2027-01-01 is a Friday in ISO week 53 of 2026.
        XCTAssertEqual(WeighInSchedule.identifier(for: date(2027, 1, 1, 7, 30), calendar: calendar), "lukifitti.weighin.2026-53")
    }

    func testWeekStartIsMonday() {
        XCTAssertEqual(WeighInSchedule.weekStart(of: date(2026, 11, 5, 15), calendar: calendar), date(2026, 11, 2))
    }
}
