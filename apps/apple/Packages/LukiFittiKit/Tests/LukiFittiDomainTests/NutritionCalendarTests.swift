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

    // MARK: Burned calories with Apple Health

    private var day27: Date { calendar.startOfDay(for: date("2026-10-27T12:00:00Z")) }

    private func session(_ name: String, _ start: String, _ end: String, kcal: Double) -> WorkoutSessionDto {
        WorkoutSessionDto(
            clientSessionId: "sess-\(name)",
            workoutNameSnapshot: name,
            status: .COMPLETED,
            startedAt: start,
            completedAt: end,
            activeCaloriesKcal: kcal
        )
    }

    private func workout(
        _ uuid: String, _ start: String, _ end: String, kcal: Double?, own: Bool = false, type: String = "running"
    ) -> HealthWorkoutDto {
        HealthWorkoutDto(
            id: uuid, healthKitUuid: uuid, activityType: type, sourceName: own ? "LukiFitti" : "Strava",
            isOwn: own, startedAt: start, endedAt: end, activeKcal: kcal
        )
    }

    private func burns(
        _ sessions: [WorkoutSessionDto], days: [HealthDailyEnergyDto] = [], workouts: [HealthWorkoutDto] = []
    ) -> [Date: NutritionCalendar.DayBurn] {
        NutritionCalendar.dayBurns(
            sessions: sessions, healthDays: days, healthWorkouts: workouts, calendar: calendar
        ) { _ in 80 }
    }

    func testDayBurnsWithoutHealthDataMatchesSessionEstimates() {
        let result = burns([
            session("Push", "2026-10-27T08:00:00Z", "2026-10-27T09:00:00Z", kcal: 300),
            session("Pull", "2026-10-27T17:00:00Z", "2026-10-27T18:00:00Z", kcal: 200),
        ])
        let legacy = NutritionCalendar.burnByDay(
            [session("Push", "2026-10-27T08:00:00Z", "2026-10-27T09:00:00Z", kcal: 300),
             session("Pull", "2026-10-27T17:00:00Z", "2026-10-27T18:00:00Z", kcal: 200)],
            calendar: calendar
        ) { _ in 80 }
        XCTAssertEqual(result[day27]?.total, 500)
        XCTAssertEqual(result[day27]?.total, legacy[day27]?.reduce(0) { $0 + $1.kcal })
        XCTAssertEqual(result[day27]?.items.map(\.kcal), [300, 200])
        XCTAssertEqual(result[day27]?.hasHealthDay, false)
    }

    func testHealthDayPlusUncoveredSession() {
        let result = burns(
            [session("Push", "2026-10-27T08:00:00Z", "2026-10-27T09:00:00Z", kcal: 300)],
            days: [HealthDailyEnergyDto(day: "2026-10-27", activeKcal: 450.4)]
        )
        let burn = result[day27]
        XCTAssertEqual(burn?.total, 750, "Health day total + session Health doesn't know about")
        XCTAssertEqual(burn?.items.last, .dailyActivity(kcal: 450))
        XCTAssertEqual(burn?.hasHealthDay, true)
    }

    func testCoveredSessionUsesExternalWorkoutKcal() {
        let strava = workout("w1", "2026-10-27T08:05:00Z", "2026-10-27T09:05:00Z", kcal: 420, type: "traditionalStrengthTraining")
        let result = burns(
            [session("Push", "2026-10-27T08:00:00Z", "2026-10-27T09:00:00Z", kcal: 300)],
            days: [HealthDailyEnergyDto(day: "2026-10-27", activeKcal: 900)],
            workouts: [strava]
        )
        let burn = result[day27]
        XCTAssertEqual(burn?.total, 900, "covered session is already part of Health's total")
        guard case .session(_, let kcal, let merged)? = burn?.items.first else { return XCTFail("expected session row") }
        XCTAssertEqual(kcal, 420, "Health wins")
        XCTAssertEqual(merged?.healthKitUuid, "w1")
        XCTAssertEqual(burn?.items.count, 2, "external workout merged into the session row")
        XCTAssertEqual(burn?.items.last, .dailyActivity(kcal: 480))
    }

    func testOwnHealthWorkoutCoversSessionButIsNeverListed() {
        let own = workout("own", "2026-10-27T08:00:00Z", "2026-10-27T09:00:00Z", kcal: 300, own: true)
        let result = burns(
            [session("Push", "2026-10-27T08:00:00Z", "2026-10-27T09:00:00Z", kcal: 300)],
            days: [HealthDailyEnergyDto(day: "2026-10-27", activeKcal: 700)],
            workouts: [own]
        )
        let burn = result[day27]
        XCTAssertEqual(burn?.total, 700)
        XCTAssertEqual(burn?.items.map(\.kcal), [300, 400])
        XCTAssertFalse(burn?.items.contains { if case .healthWorkout = $0 { true } else { false } } ?? true)

        let ownOnly = burns([], workouts: [own])
        XCTAssertNil(ownOnly[day27])
    }

    func testExternalWorkoutsAreListedOnTheirStartDay() {
        let run = workout("run", "2026-10-27T05:00:00Z", "2026-10-27T05:45:00Z", kcal: 380)
        let walk = workout("walk", "2026-10-27T15:00:00Z", "2026-10-27T15:30:00Z", kcal: nil, type: "walking")
        let result = burns(
            [session("Push", "2026-10-27T08:00:00Z", "2026-10-27T09:00:00Z", kcal: 300)],
            workouts: [run, walk]
        )
        let burn = result[day27]
        XCTAssertEqual(burn?.items.map(\.id), ["health-run", "session-sess-Push", "health-walk"])
        XCTAssertEqual(burn?.total, 680, "without a Health day: sessions + listed workouts")
        XCTAssertEqual(burns([], workouts: [run])[day27]?.items, [.healthWorkout(run, kcal: 380)])
    }

    func testDailyActivityRemainderIsClampedAtZero() {
        let run = workout("run", "2026-10-27T05:00:00Z", "2026-10-27T06:00:00Z", kcal: 600)
        let result = burns([], days: [HealthDailyEnergyDto(day: "2026-10-27", activeKcal: 500)], workouts: [run])
        XCTAssertEqual(result[day27]?.total, 500)
        XCTAssertEqual(result[day27]?.items.last, .dailyActivity(kcal: 0))
    }

    func testSmallOverlapDoesNotCover() {
        XCTAssertFalse(NutritionCalendar.overlapsMostly(
            DateInterval(start: date("2026-10-27T08:00:00Z"), end: date("2026-10-27T09:00:00Z")),
            DateInterval(start: date("2026-10-27T08:50:00Z"), end: date("2026-10-27T10:00:00Z"))
        ))
        XCTAssertTrue(NutritionCalendar.overlapsMostly(
            DateInterval(start: date("2026-10-27T08:00:00Z"), end: date("2026-10-27T09:00:00Z")),
            DateInterval(start: date("2026-10-27T08:40:00Z"), end: date("2026-10-27T08:55:00Z"))
        ))
    }

    func testDayKeyRoundTrip() {
        XCTAssertEqual(LukiDayKey.string(date("2026-10-27T23:30:00Z"), timeZone: calendar.timeZone), "2026-10-28")
        XCTAssertEqual(LukiDayKey.date("2026-10-27", calendar: calendar), day27)
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
