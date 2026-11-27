import XCTest
@testable import LukiFittiDomain
@testable import LukiFittiModels

final class HistoryPeriodTests: XCTestCase {
    private func calendar(firstWeekday: Int) -> Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Berlin")!
        cal.firstWeekday = firstWeekday
        return cal
    }

    private func day(_ y: Int, _ m: Int, _ d: Int, hour: Int = 15, in cal: Calendar) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d, hour: hour))!
    }

    private func midnight(_ y: Int, _ m: Int, _ d: Int, in cal: Calendar) -> Date {
        cal.date(from: DateComponents(year: y, month: m, day: d))!
    }

    func testWeekCutoffIsIsoMonday() {
        let cal = calendar(firstWeekday: 2)
        // Fri 27 Nov 2026 15:00 → Mon 23 Nov 00:00.
        XCTAssertEqual(
            HistoryPeriod.week.cutoff(now: day(2026, 11, 27, in: cal), calendar: cal),
            midnight(2026, 11, 23, in: cal)
        )
        // Monday itself → same day 00:00.
        XCTAssertEqual(
            HistoryPeriod.week.cutoff(now: day(2026, 11, 23, in: cal), calendar: cal),
            midnight(2026, 11, 23, in: cal)
        )
    }

    func testWeekCutoffIgnoresFirstWeekday() {
        var us = calendar(firstWeekday: 1)
        // Sun 29 Nov 2026: Sunday-first calendars treat this as a new week, ISO week still ends today.
        XCTAssertEqual(
            HistoryPeriod.week.cutoff(now: day(2026, 11, 29, in: us), calendar: us),
            midnight(2026, 11, 23, in: us)
        )
        us.firstWeekday = 1
    }

    func testMonthCutoffIsFirstOfMonth() {
        let cal = calendar(firstWeekday: 2)
        XCTAssertEqual(
            HistoryPeriod.month.cutoff(now: day(2026, 12, 5, in: cal), calendar: cal),
            midnight(2026, 12, 1, in: cal)
        )
    }

    func testWeekSnapshotExcludesSessionFromPreviousWeek() {
        let cal = calendar(firstWeekday: 2)
        // Sat 21 Nov 2026 is in the previous ISO week when now = Fri 27 Nov.
        let old = WorkoutSessionDto(workoutNameSnapshot: "Old", startedAt: "2026-11-21T10:00:00Z")
        let recent = WorkoutSessionDto(workoutNameSnapshot: "Recent", startedAt: "2026-11-25T10:00:00Z")
        let snapshot = WorkoutHistorySnapshot(
            sessions: [old, recent],
            period: .week,
            muscle: nil,
            now: day(2026, 11, 27, in: cal),
            calendar: cal
        )
        XCTAssertEqual(snapshot.items.map(\.session.workoutNameSnapshot), ["Recent"])
    }
}
