import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

/// Mirrors `active-session.util.spec.ts` so iOS and web reopen the same exercise.
final class FocusedExerciseTests: XCTestCase {
    private func ex(_ id: String, _ completedAt: [String?], status: SessionExerciseStatus = .PENDING) -> SessionExerciseDto {
        SessionExerciseDto(
            clientExerciseId: id,
            sessionId: "sess-1",
            exerciseNameSnapshot: id,
            primaryMuscleSnapshot: .CHEST,
            status: status,
            orderIndex: 0,
            sets: completedAt.enumerated().map { idx, at in
                SessionSetDto(sessionExerciseId: id, setNumber: idx + 1, completed: at != nil, completedAt: at)
            }
        )
    }

    private func resolve(_ exercises: [SessionExerciseDto], _ remembered: String? = nil) -> Int {
        SessionCalculator.resolveFocusedExerciseIndex(exercises, rememberedClientExerciseId: remembered)
    }

    func testEmptyWorkout() {
        XCTAssertEqual(resolve([]), 0)
    }

    func testKeepsLastOpenedEvenWhenFinished() {
        let exercises = [
            ex("a", [nil, nil]),
            ex("b", ["2026-10-28T10:00:00Z", "2026-10-28T10:03:00Z"], status: .COMPLETED),
            ex("c", [nil]),
        ]
        XCTAssertEqual(resolve(exercises, "b"), 1)
    }

    func testIgnoresRememberedExerciseThatIsGone() {
        XCTAssertEqual(resolve([ex("a", ["2026-10-28T10:00:00Z"]), ex("b", [nil])], "gone"), 1)
    }

    func testFallsBackToLatestLoggedExerciseWithOpenSets() {
        let exercises = [
            ex("a", ["2026-10-28T10:00:00.000Z", nil]),
            ex("b", ["2026-10-28T10:10:00.000Z", nil]),
            ex("c", [nil]),
        ]
        XCTAssertEqual(resolve(exercises), 1)
    }

    func testMovesToFirstUnfinishedOnceLatestIsDone() {
        let exercises = [
            ex("a", ["2026-10-28T10:00:00Z", "2026-10-28T10:02:00Z"], status: .COMPLETED),
            ex("b", [nil, nil]),
            ex("c", [nil]),
        ]
        XCTAssertEqual(resolve(exercises), 1)
    }

    func testSkipsSkippedExercises() {
        XCTAssertEqual(resolve([ex("a", [nil], status: .SKIPPED), ex("b", [nil])]), 1)
    }

    func testReturnsZeroWhenEverythingIsFinished() {
        let exercises = [
            ex("a", ["2026-10-28T10:00:00Z"], status: .COMPLETED),
            ex("b", ["2026-10-28T10:05:00Z"], status: .COMPLETED),
        ]
        XCTAssertEqual(resolve(exercises), 0)
    }

    func testFinishMarksUntouchedExercisesAsSkipped() {
        let session = WorkoutSessionDto(workoutNameSnapshot: "Push", exercises: [
            ex("done", ["2026-10-28T10:00:00Z", nil], status: .IN_PROGRESS),
            ex("variant", [nil, nil]),
        ])
        let statuses = SessionCalculator.finalizeExerciseStatuses(session).exercises.map(\.status)
        XCTAssertEqual(statuses, [.COMPLETED, .SKIPPED])
    }

    func testChangingSetTypeKeepsWarmupsFirstAndRenumbers() {
        let sets = [
            SessionSetDto(clientSetId: "w", sessionExerciseId: "x", setNumber: 1, setType: .WARMUP),
            SessionSetDto(clientSetId: "a", sessionExerciseId: "x", setNumber: 2, setType: .WORKING),
            SessionSetDto(clientSetId: "b", sessionExerciseId: "x", setNumber: 3, setType: .WORKING),
        ]
        let toWarmup = SessionCalculator.changingSetType(sets, clientSetId: "b", to: .WARMUP)
        XCTAssertEqual(toWarmup.map(\.clientSetId), ["w", "b", "a"])
        XCTAssertEqual(toWarmup.map(\.setNumber), [1, 2, 3])

        let toWorking = SessionCalculator.changingSetType(sets, clientSetId: "w", to: .WORKING)
        XCTAssertEqual(toWorking.map(\.setType), [.WORKING, .WORKING, .WORKING])
        XCTAssertEqual(toWorking.map(\.clientSetId), ["w", "a", "b"])
    }
}
