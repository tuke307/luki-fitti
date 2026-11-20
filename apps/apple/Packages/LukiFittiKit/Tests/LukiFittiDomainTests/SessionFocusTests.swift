import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

/// Mirrors `session-focus.util.spec.ts` so iOS/Watch and web pick the same focus winner.
final class SessionFocusTests: XCTestCase {
    private func session(
        focusedClientExerciseId: String? = nil,
        focusedAt: String? = nil
    ) -> WorkoutSessionDto {
        WorkoutSessionDto(
            clientSessionId: "sess-1",
            workoutNameSnapshot: "Workout",
            focusedClientExerciseId: focusedClientExerciseId,
            focusedAt: focusedAt,
            exercises: (0..<3).map { idx in
                SessionExerciseDto(
                    clientExerciseId: "ex-\(idx)",
                    sessionId: "sess-1",
                    exerciseNameSnapshot: "Exercise \(idx)",
                    primaryMuscleSnapshot: .CHEST,
                    orderIndex: idx,
                    sets: [SessionSetDto(sessionExerciseId: "ex-\(idx)", setNumber: 1)]
                )
            }
        )
    }

    func testFocusingStampsExerciseAndTimestamp() {
        let focused = SessionCalculator.focusing(
            session(),
            clientExerciseId: "ex-2",
            now: Date(timeIntervalSince1970: 1_763_700_000)
        )
        XCTAssertEqual(focused.focusedClientExerciseId, "ex-2")
        XCTAssertNotNil(focused.focusedAt)
        XCTAssertTrue(focused.focusedAt!.contains("."))
    }

    func testMergingKeepsNewerFocus() {
        let local = session(focusedClientExerciseId: "ex-1", focusedAt: "2026-11-20T10:00:00.000Z")
        let incoming = session(focusedClientExerciseId: "ex-2", focusedAt: "2026-11-20T11:00:00.000Z")
        let merged = SessionCalculator.mergingFocus(into: local, from: incoming)
        XCTAssertEqual(merged.focusedClientExerciseId, "ex-2")
        XCTAssertEqual(merged.focusedAt, "2026-11-20T11:00:00.000Z")
    }

    func testMergingKeepsLocalWhenIncomingIsOlder() {
        let local = session(focusedClientExerciseId: "ex-1", focusedAt: "2026-11-20T11:00:00.000Z")
        let incoming = session(focusedClientExerciseId: "ex-2", focusedAt: "2026-11-20T10:00:00.000Z")
        let merged = SessionCalculator.mergingFocus(into: local, from: incoming)
        XCTAssertEqual(merged.focusedClientExerciseId, "ex-1")
    }

    func testMergingIgnoresUnparsableIncomingTimestamp() {
        let local = session(focusedClientExerciseId: "ex-1", focusedAt: "2026-11-20T10:00:00.000Z")
        let incoming = session(focusedClientExerciseId: "ex-2", focusedAt: "not-a-date")
        let merged = SessionCalculator.mergingFocus(into: local, from: incoming)
        XCTAssertEqual(merged.focusedClientExerciseId, "ex-1")
    }

    func testFocusedIndexResolvesThroughSessionFocus() {
        let focused = session(focusedClientExerciseId: "ex-2", focusedAt: "2026-11-20T10:00:00.000Z")
        XCTAssertEqual(
            SessionCalculator.resolveFocusedExerciseIndex(
                focused.exercises,
                rememberedClientExerciseId: focused.focusedClientExerciseId
            ),
            2
        )
    }
}
