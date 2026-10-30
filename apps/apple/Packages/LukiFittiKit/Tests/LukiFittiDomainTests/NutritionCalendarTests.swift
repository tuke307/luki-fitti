import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

final class NutritionCalendarTests: XCTestCase {
    private var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Berlin")!
        cal.firstWeekday = 2
        return cal
    }

    private func date(_ iso: String) -> Date { LukiISODate.parse(iso)! }

    private func entry(_ id: String, _ eatenAt: String, kcal: Double) -> MealEntryDto {
        MealEntryDto(id: id, clientEntryId: id, eatenAt: eatenAt, mealType: .SNACK, totals: NutritionTotalsDto(kcal: kcal))
    }

    func testEntriesByDayUsesLocalDaysAndSortsByTime() {
        let index = NutritionCalendar.entriesByDay([
            entry("b", "2026-10-27T18:00:00Z", kcal: 500),
            entry("a", "2026-10-27T06:30:00.250Z", kcal: 300),
            entry("late", "2026-10-27T23:30:00Z", kcal: 100), // 00:30 on the 28th in Berlin
        ], calendar: calendar)
        let day = calendar.startOfDay(for: date("2026-10-27T12:00:00Z"))
        XCTAssertEqual(index[day]?.map(\.id), ["a", "b"])
        XCTAssertEqual(index[calendar.date(byAdding: .day, value: 1, to: day)!]?.map(\.id), ["late"])
    }

    func testBurnByDayGroupsSessionsAndPassesTheirDate() {
        let sessions = [
            WorkoutSessionDto(workoutNameSnapshot: "Push", startedAt: "2026-10-27T08:00:00Z", activeCaloriesKcal: 300),
            WorkoutSessionDto(workoutNameSnapshot: "Pull", startedAt: "2026-10-27T17:00:00Z", activeCaloriesKcal: 200),
            WorkoutSessionDto(workoutNameSnapshot: "Broken", startedAt: "not a date", activeCaloriesKcal: 999),
        ]
        var asked: [Date] = []
        let index = NutritionCalendar.burnByDay(sessions, calendar: calendar) { asked.append($0); return 80 }
        let day = calendar.startOfDay(for: date("2026-10-27T12:00:00Z"))
        XCTAssertEqual(index.count, 1)
        XCTAssertEqual(index[day]?.map(\.kcal), [300, 200])
        XCTAssertEqual(asked.count, 2)
    }

    func testWeekHelpersFollowTheCalendarsFirstWeekday() {
        let wednesday = date("2026-10-28T10:00:00Z")
        let start = NutritionCalendar.weekStart(for: wednesday, calendar: calendar)
        XCTAssertEqual(calendar.component(.weekday, from: start), 2)
        XCTAssertEqual(start, calendar.startOfDay(for: date("2026-10-26T10:00:00Z")))
        let days = NutritionCalendar.days(ofWeekStarting: start, calendar: calendar)
        XCTAssertEqual(days.count, 7)
        XCTAssertEqual(days.last, calendar.startOfDay(for: date("2026-11-01T10:00:00Z")))

        let weeks = NutritionCalendar.weekStarts(from: date("2026-10-10T10:00:00Z"), through: wednesday, calendar: calendar)
        XCTAssertEqual(weeks.count, 4)
        XCTAssertEqual(weeks.last, start)
        XCTAssertEqual(NutritionCalendar.weekStarts(from: wednesday, through: wednesday, calendar: calendar), [start])
    }

    func testRingProgress() {
        XCTAssertEqual(NutritionCalendar.ringProgress(eatenKcal: 1100, goal: 2200), 0.5)
        XCTAssertEqual(NutritionCalendar.ringProgress(eatenKcal: 3000, goal: 2200), 1)
        XCTAssertEqual(NutritionCalendar.ringProgress(eatenKcal: 400, goal: nil), 1)
        XCTAssertEqual(NutritionCalendar.ringProgress(eatenKcal: 0, goal: nil), 0)
    }
}
