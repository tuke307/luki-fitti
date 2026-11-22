import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

/// `isFinalOpenSet` drives the Watch's "Finish Workout" button on the last open set.
final class FinalOpenSetTests: XCTestCase {
    private func set(_ clientSetId: String, completed: Bool) -> SessionSetDto {
        SessionSetDto(
            clientSetId: clientSetId,
            sessionExerciseId: "ex",
            setNumber: 1,
            completed: completed
        )
    }

    private func session(sets: [[SessionSetDto]]) -> WorkoutSessionDto {
        WorkoutSessionDto(
            clientSessionId: "sess-1",
            workoutNameSnapshot: "Workout",
            exercises: sets.enumerated().map { idx, sets in
                SessionExerciseDto(
                    clientExerciseId: "ex-\(idx)",
                    sessionId: "sess-1",
                    exerciseNameSnapshot: "Exercise \(idx)",
                    primaryMuscleSnapshot: .CHEST,
                    orderIndex: idx,
                    sets: sets
                )
            }
        )
    }

    private func isFinal(_ session: WorkoutSessionDto, _ index: Int) -> Bool {
        SessionCalculator.isFinalOpenSet(session: session, exerciseIndex: index)
    }

    func testMiddleSetIsNotFinal() {
        let s = session(sets: [[
            set("s1", completed: true), set("s2", completed: false), set("s3", completed: false),
        ]])
        XCTAssertFalse(isFinal(s, 0))
    }

    func testLastSetOfExerciseWithLaterExerciseOpenIsNotFinal() {
        let s = session(sets: [
            [set("s1", completed: true), set("s2", completed: false)],
            [set("s3", completed: false)],
        ])
        XCTAssertFalse(isFinal(s, 0))
    }

    func testLastSetOfLastExerciseIsFinal() {
        let s = session(sets: [
            [set("s1", completed: true)],
            [set("s2", completed: true), set("s3", completed: false)],
        ])
        XCTAssertTrue(isFinal(s, 1))
    }

    func testEarlierExerciseOpenMeansNotFinal() {
        let s = session(sets: [
            [set("s1", completed: false)],
            [set("s2", completed: true), set("s3", completed: false)],
        ])
        XCTAssertFalse(isFinal(s, 1))
    }

    func testSingleSetStretchingRoutineIsFinal() {
        let s = session(sets: [[set("s1", completed: false)]])
        XCTAssertTrue(isFinal(s, 0))
    }

    func testOutOfRangeIndexAndEmptySessionAreNotFinal() {
        let s = session(sets: [[set("s1", completed: false)]])
        XCTAssertFalse(isFinal(s, 5))
        XCTAssertFalse(isFinal(s, -1))
        XCTAssertFalse(isFinal(session(sets: []), 0))
    }
}
