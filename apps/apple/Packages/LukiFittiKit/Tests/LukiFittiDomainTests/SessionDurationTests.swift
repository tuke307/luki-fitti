import XCTest
import LukiFittiModels
import LukiFittiDomain

final class SessionDurationTests: XCTestCase {
    private let start = "2026-11-27T10:00:00.000Z"

    private func at(_ sec: Int) -> Date {
        Date(timeIntervalSince1970: LukiDate.parseISO(start)!.timeIntervalSince1970 + TimeInterval(sec))
    }
    private func atIso(_ sec: Int) -> String {
        ISO8601DateFormatter().string(from: at(sec))
    }
    private func running(_ mutate: (inout WorkoutSessionDto) -> Void = { _ in }) -> WorkoutSessionDto {
        var s = WorkoutSessionDto(workoutNameSnapshot: "Test", startedAt: start)
        mutate(&s)
        return s
    }

    func testCountsPlainWallTimeWithoutPauses() {
        XCTAssertEqual(SessionDuration.activeElapsedSeconds(running(), now: at(600)), 600)
    }

    func testExcludesCompletedPauseAfterResume() {
        var s = running()
        SessionDuration.pause(&s, nowIso: atIso(120))
        SessionDuration.resume(&s, nowIso: atIso(420))
        XCTAssertEqual(s.pausedDurationSeconds, 300)
        XCTAssertEqual(s.status, .IN_PROGRESS)
        XCTAssertNil(s.pausedAt)
        XCTAssertEqual(SessionDuration.activeElapsedSeconds(s, now: at(720)), 420)
    }

    func testClockStopsWhilePaused() {
        var s = running()
        SessionDuration.pause(&s, nowIso: atIso(60))
        XCTAssertEqual(s.activeDurationSeconds, 60)
        XCTAssertEqual(SessionDuration.activeElapsedSeconds(s, now: at(660)), 60)
        SessionDuration.resume(&s, nowIso: atIso(660))
        XCTAssertEqual(s.pausedDurationSeconds, 600)
    }

    func testClampsAtZero() {
        XCTAssertEqual(
            SessionDuration.activeElapsedSeconds(running { $0.pausedDurationSeconds = 9999 }, now: at(10)),
            0
        )
    }

    func testResumeWithoutPausedAtAddsNothing() {
        var s = running { $0.pausedDurationSeconds = 30 }
        SessionDuration.resume(&s, nowIso: atIso(500))
        XCTAssertEqual(s.pausedDurationSeconds, 30)
        XCTAssertNil(s.pausedAt)
    }

    func testDtoDecodesMissingPausedDurationAsZero() throws {
        let json = """
        {
            "id": "s1", "clientSessionId": "cs1", "userId": "u1",
            "sessionType": "STRENGTH", "workoutNameSnapshot": "W",
            "status": "COMPLETED", "startedAt": "2026-11-27T10:00:00.000Z",
            "activeDurationSeconds": 1200, "weightUnit": "KG",
            "totalVolumeKg": 0, "totalSetsCompleted": 0, "totalRepsCompleted": 0,
            "totalStretchSeconds": 0, "version": 1,
            "lastSyncedAt": "2026-11-27T11:00:00.000Z", "exercises": []
        }
        """.data(using: .utf8)!
        let dto = try JSONDecoder().decode(WorkoutSessionDto.self, from: json)
        XCTAssertEqual(dto.pausedDurationSeconds, 0)
    }
}
