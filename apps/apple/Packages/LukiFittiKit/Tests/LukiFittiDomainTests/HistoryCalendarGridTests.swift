import XCTest
@testable import LukiFittiDomain

final class HistoryCalendarGridTests: XCTestCase {
    private func calendar(firstWeekday: Int) -> Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Berlin")!
        cal.firstWeekday = firstWeekday
        return cal
    }

    private func day(_ y: Int, _ m: Int, _ d: Int, hour: Int = 15, in cal: Calendar) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: hour))!
    }

    private func dayNumbers(_ grid: HistoryCalendarGrid, _ cal: Calendar) -> [Int] {
        grid.days.map { cal.component(.day, from: $0) }
    }

    func testWeekWhenTodayIsMondayStartsTodayAndIncludesFutureDays() {
        let cal = calendar(firstWeekday: 2)
        let grid = HistoryCalendarGrid(span: .week, today: day(2026, 11, 2, in: cal), calendar: cal)
        XCTAssertEqual(grid.leadingBlanks, 0)
        XCTAssertEqual(dayNumbers(grid, cal), [2, 3, 4, 5, 6, 7, 8])
        XCTAssertEqual(grid.days.first, cal.startOfDay(for: day(2026, 11, 2, in: cal)))
    }

    func testWeekWhenTodayIsSundayEndsToday() {
        let cal = calendar(firstWeekday: 2)
        let grid = HistoryCalendarGrid(span: .week, today: day(2026, 11, 8, hour: 23, in: cal), calendar: cal)
        XCTAssertEqual(dayNumbers(grid, cal), [2, 3, 4, 5, 6, 7, 8])
        XCTAssertEqual(HistoryCalendarGrid.isoWeekdayIndex(of: grid.days[0], calendar: cal), 0)
    }

    func testMonthSpansMonthBoundaryWithLeadingBlanks() {
        let cal = calendar(firstWeekday: 2)
        // Thu 5 Nov 2026 → 30 days start on Wed 7 Oct 2026, two blanks (Mon, Tue) before it.
        let grid = HistoryCalendarGrid(span: .month, today: day(2026, 11, 5, in: cal), calendar: cal)
        XCTAssertEqual(grid.days.count, 30)
        XCTAssertEqual(grid.leadingBlanks, 2)
        XCTAssertEqual(cal.dateComponents([.month, .day], from: grid.days.first!), DateComponents(month: 10, day: 7))
        XCTAssertEqual(cal.dateComponents([.month, .day], from: grid.days.last!), DateComponents(month: 11, day: 5))
        XCTAssertEqual(dayNumbers(grid, cal)[24...26], [31, 1, 2])
    }

    func testUSFirstWeekdayStillLaysOutMondayFirst() {
        let us = calendar(firstWeekday: 1)
        // Sunday 8 Nov 2026: a Sunday-first calendar would start a new week here.
        let week = HistoryCalendarGrid(span: .week, today: day(2026, 11, 8, in: us), calendar: us)
        XCTAssertEqual(dayNumbers(week, us), [2, 3, 4, 5, 6, 7, 8])
        // 30 days ending Sun 8 Nov start on Sat 10 Oct → five blanks (Mon–Fri).
        let month = HistoryCalendarGrid(span: .month, today: day(2026, 11, 8, in: us), calendar: us)
        XCTAssertEqual(month.leadingBlanks, 5)
        XCTAssertEqual(cal(us, month.days.first!), DateComponents(month: 10, day: 10))
    }

    func testWeekdaySymbolsAreMondayFirst() {
        XCTAssertEqual(HistoryCalendarGrid.weekdaySymbols(locale: Locale(identifier: "en")), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"])
        XCTAssertEqual(HistoryCalendarGrid.weekdaySymbols(locale: Locale(identifier: "de")).first, "Mo")
    }

    private func cal(_ cal: Calendar, _ date: Date) -> DateComponents {
        cal.dateComponents([.month, .day], from: date)
    }
}
