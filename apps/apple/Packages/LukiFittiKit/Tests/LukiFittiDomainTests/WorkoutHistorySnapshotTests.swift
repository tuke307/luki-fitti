import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

final class WorkoutHistorySnapshotTests: XCTestCase {
    private var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Berlin")!
        return cal
    }

    private let now = LukiISODate.parse("2026-10-28T12:00:00Z")!

    private func session(
        _ name: String,
        _ startedAt: String,
        type: SessionType = .STRENGTH,
        muscle: MuscleGroup = .CHEST,
        volume: Double = 1000,
        sets: Int = 2
    ) -> WorkoutSessionDto {
        let exercise = SessionExerciseDto(
            sessionId: name,
            exerciseNameSnapshot: name,
            primaryMuscleSnapshot: muscle,
            orderIndex: 0,
            sets: (0..<sets).map { SessionSetDto(sessionExerciseId: name, setNumber: $0 + 1, completed: true) }
        )
        return WorkoutSessionDto(
            id: name,
            sessionType: type,
            workoutNameSnapshot: name,
            startedAt: startedAt,
            totalVolumeKg: volume,
            totalSetsCompleted: sets,
            totalRepsCompleted: sets * 10,
            totalStretchSeconds: type == .STRETCHING ? 600 : 0,
            exercises: [exercise]
        )
    }

    private var history: [WorkoutSessionDto] {
        [
            session("today", "2026-10-28T07:00:00.123Z"),
            session("today-stretch", "2026-10-28T09:00:00Z", type: .STRETCHING, muscle: .HAMSTRINGS, volume: 0),
            session("week", "2026-10-25T07:00:00Z", muscle: .BACK, volume: 2000),
            session("month", "2026-10-10T07:00:00Z"),
            session("year", "2026-03-10T07:00:00Z", volume: 500),
            session("old", "2024-03-10T07:00:00Z"),
        ]
    }

    func testPeriodFilterAndAggregates() {
        let week = WorkoutHistorySnapshot(sessions: history, period: .week, muscle: nil, now: now, calendar: calendar)
        XCTAssertEqual(week.items.map(\.id), ["today", "today-stretch", "week"])
        XCTAssertEqual(week.strengthCount, 2)
        XCTAssertEqual(week.stretchCount, 1)
        XCTAssertEqual(week.totalVolumeKg, 3000)
        XCTAssertEqual(week.totalSets, 6)
        XCTAssertEqual(week.totalStretchSeconds, 600)
        XCTAssertEqual(week.setsByMuscle[.BACK], 2)
        XCTAssertEqual(week.sessions(on: now, calendar: calendar).map(\.id), ["today", "today-stretch"])

        XCTAssertEqual(WorkoutHistorySnapshot(sessions: history, period: .month, muscle: nil, now: now, calendar: calendar).count, 4)
        XCTAssertEqual(WorkoutHistorySnapshot(sessions: history, period: .year, muscle: nil, now: now, calendar: calendar).count, 5)
        XCTAssertEqual(WorkoutHistorySnapshot(sessions: history, period: .all, muscle: nil, now: now, calendar: calendar).count, 6)
    }

    func testMuscleFilterAndBuckets() {
        let chest = WorkoutHistorySnapshot(sessions: history, period: .all, muscle: .CHEST, now: now, calendar: calendar)
        XCTAssertEqual(chest.items.map(\.id), ["today", "month", "year", "old"])
        XCTAssertEqual(chest.bucket(month: now, calendar: calendar), .init(count: 2, sets: 4, volumeKg: 2000))
        XCTAssertEqual(chest.byYear[2024]?.count, 1)
        XCTAssertEqual(chest.byYear[2026]?.volumeKg, 2500)
    }

    func testProgressionIsChronologicalAndSkipsStretching() {
        let all = WorkoutHistorySnapshot(sessions: history, period: .all, muscle: nil, now: now, calendar: calendar)
        XCTAssertEqual(all.progression.map(\.id), ["old", "year", "month", "week", "today"])
        XCTAssertTrue(zip(all.progression, all.progression.dropFirst()).allSatisfy { $0.date <= $1.date })
    }
}
