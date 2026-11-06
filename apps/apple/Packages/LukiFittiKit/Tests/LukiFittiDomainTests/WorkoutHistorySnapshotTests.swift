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
        XCTAssertEqual(all.progression.last?.sets, 2)
        XCTAssertTrue(all.exerciseProgression.isEmpty)
    }

    func testExerciseFilterKeepsSessionsWithItAndChartsItsBestSet() {
        func lift(_ id: String, _ startedAt: String, exerciseId: String, sets: [(Double, Int, SetType)]) -> WorkoutSessionDto {
            WorkoutSessionDto(
                id: id,
                workoutNameSnapshot: id,
                startedAt: startedAt,
                exercises: [SessionExerciseDto(
                    sessionId: id,
                    exerciseId: exerciseId,
                    exerciseNameSnapshot: exerciseId,
                    primaryMuscleSnapshot: .CHEST,
                    orderIndex: 0,
                    sets: sets.enumerated().map { n, s in
                        SessionSetDto(sessionExerciseId: id, setNumber: n + 1, setType: s.2, weight: s.0, reps: s.1, completed: true)
                    }
                )]
            )
        }
        let sessions = [
            lift("b", "2026-10-27T07:00:00Z", exerciseId: "bench", sets: [(60, 10, .WARMUP), (90, 3, .WORKING)]),
            lift("f", "2026-10-26T07:00:00Z", exerciseId: "fly", sets: [(20, 12, .WORKING)]),
            lift("a", "2026-10-20T07:00:00Z", exerciseId: "bench", sets: [(80, 6, .WORKING)]),
        ]
        let bench = WorkoutHistorySnapshot(sessions: sessions, period: .all, muscle: nil, exerciseId: "bench", now: now, calendar: calendar)
        XCTAssertEqual(bench.items.map(\.id), ["b", "a"])
        XCTAssertEqual(bench.exerciseProgression.map(\.id), ["a", "b"])
        XCTAssertEqual(bench.exerciseProgression.map(\.maxWeightKg), [80, 90])
        XCTAssertEqual(bench.exerciseProgression.last?.est1RM ?? 0, 99, accuracy: 0.001)
        XCTAssertEqual(bench.insights.personalBests.map(\.key), ["bench"])
        XCTAssertEqual(
            WorkoutHistorySnapshot.loggedExercises(in: sessions).map(\.id),
            ["bench", "fly"]
        )
    }
}
