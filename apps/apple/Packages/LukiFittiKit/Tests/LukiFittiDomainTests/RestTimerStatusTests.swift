import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

/// The API echoes `restTimerEndsAt` via `toISOString()` (with milliseconds); the timer must keep
/// running after the iPhone adopts the server copy of the session.
final class RestTimerStatusTests: XCTestCase {
    private let now = LukiDate.parseISO("2026-10-31T16:00:00Z")!

    private func session(endsAt: String) -> WorkoutSessionDto {
        WorkoutSessionDto(workoutNameSnapshot: "Arme", restTimerEndsAt: endsAt, restTimerDurationSec: 90)
    }

    func testParsesServerTimestampWithMilliseconds() {
        let rest = SessionCalculator.computeRemainingRestSeconds(
            session: session(endsAt: "2026-10-31T16:01:30.000Z"),
            now: now
        )
        XCTAssertTrue(rest.isRunning)
        XCTAssertEqual(rest.remainingSeconds, 90)
    }

    func testParsesDeviceTimestampWithoutFraction() {
        let rest = SessionCalculator.computeRemainingRestSeconds(
            session: session(endsAt: "2026-10-31T16:00:45Z"),
            now: now
        )
        XCTAssertTrue(rest.isRunning)
        XCTAssertEqual(rest.remainingSeconds, 45)
    }

    func testParseISORejectsGarbage() {
        XCTAssertNil(LukiDate.parseISO("not a date"))
        XCTAssertNil(LukiDate.parseISO(nil))
    }
}
