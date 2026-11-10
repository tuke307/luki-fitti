import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

/// The Watch follows the exercise the iPhone is working on instead of staying on a stale index.
final class FollowedExerciseIndexTests: XCTestCase {
    private func set(_ clientSetId: String, completed: Bool, completedAt: String? = nil) -> SessionSetDto {
        SessionSetDto(
            clientSetId: clientSetId,
            sessionExerciseId: "ex",
            setNumber: 1,
            completed: completed,
            completedAt: completedAt
        )
    }

    private func session(
        sets: [[SessionSetDto]],
        clientSessionId: String = "sess-1"
    ) -> WorkoutSessionDto {
        WorkoutSessionDto(
            clientSessionId: clientSessionId,
            workoutNameSnapshot: "Workout",
            exercises: sets.enumerated().map { idx, sets in
                SessionExerciseDto(
                    clientExerciseId: "ex-\(idx)",
                    sessionId: clientSessionId,
                    exerciseNameSnapshot: "Exercise \(idx)",
                    primaryMuscleSnapshot: .CHEST,
                    orderIndex: idx,
                    sets: sets
                )
            }
        )
    }

    private func follow(
        _ previous: WorkoutSessionDto?,
        _ incoming: WorkoutSessionDto,
        _ currentIndex: Int
    ) -> Int {
        SessionCalculator.followedExerciseIndex(
            previous: previous, incoming: incoming, currentIndex: currentIndex
        )
    }

    func testNoNewCompletionKeepsCurrentIndex() {
        let prev = session(sets: [[set("s1", completed: true)], [set("s2", completed: false)]])
        let incoming = prev
        XCTAssertEqual(follow(prev, incoming, 0), 0)
    }

    func testClampsOutOfRangeIndexWhenNothingChanged() {
        let prev = session(sets: [[set("s1", completed: false)]])
        XCTAssertEqual(follow(prev, prev, 5), 0)
    }

    func testSameExerciseCompletionStays() {
        let prev = session(sets: [
            [set("s1", completed: true), set("s2", completed: false), set("s4", completed: false)],
            [set("s3", completed: false)]
        ])
        var incoming = prev
        incoming.exercises[0].sets[1].completed = true
        incoming.exercises[0].sets[1].completedAt = "2026-05-01T10:01:00Z"
        XCTAssertEqual(follow(prev, incoming, 0), 0)
    }

    func testFinishedExerciseAdvancesToNext() {
        let prev = session(sets: [
            [set("s1", completed: true), set("s2", completed: false)],
            [set("s3", completed: false)]
        ])
        var incoming = prev
        incoming.exercises[0].sets[1].completed = true
        incoming.exercises[0].sets[1].completedAt = "2026-05-01T10:01:00Z"
        // Current index lags behind (e.g. still on the exercise list page index 0).
        XCTAssertEqual(follow(prev, incoming, 0), 1)
    }

    func testCompletionOnOtherExerciseJumpsThere() {
        let prev = session(sets: [
            [set("s1", completed: false)],
            [set("s2", completed: false), set("s3", completed: false)]
        ])
        var incoming = prev
        incoming.exercises[1].sets[0].completed = true
        incoming.exercises[1].sets[0].completedAt = "2026-05-01T10:01:00Z"
        XCTAssertEqual(follow(prev, incoming, 0), 1)
    }

    func testLastExerciseFinishedStays() {
        let prev = session(sets: [
            [set("s1", completed: true)],
            [set("s2", completed: false)]
        ])
        var incoming = prev
        incoming.exercises[1].sets[0].completed = true
        incoming.exercises[1].sets[0].completedAt = "2026-05-01T10:02:00Z"
        XCTAssertEqual(follow(prev, incoming, 0), 1)
    }

    func testLatestCompletedAtWinsAcrossExercises() {
        let prev = session(sets: [
            [set("s1", completed: false), set("s3", completed: false)],
            [set("s2", completed: false)]
        ])
        var incoming = prev
        incoming.exercises[0].sets[0].completed = true
        incoming.exercises[0].sets[0].completedAt = "2026-05-01T10:05:00Z"
        incoming.exercises[1].sets[0].completed = true
        incoming.exercises[1].sets[0].completedAt = "2026-05-01T10:01:00Z"
        XCTAssertEqual(follow(prev, incoming, 0), 0)
    }

    func testNilPreviousTreatsAllCompletedSetsAsNew() {
        let incoming = session(sets: [
            [set("s1", completed: true, completedAt: "2026-05-01T10:00:00Z")],
            [set("s2", completed: false)]
        ])
        XCTAssertEqual(follow(nil, incoming, 0), 1)
    }

    func testDifferentSessionIgnoresPrevious() {
        let prev = session(sets: [[set("s1", completed: true)]], clientSessionId: "sess-old")
        let incoming = session(sets: [[set("s2", completed: true, completedAt: "2026-05-01T10:00:00Z")]], clientSessionId: "sess-new")
        // No overlap in clientSessionId: the whole session is "new", last completed set rules.
        XCTAssertEqual(follow(prev, incoming, 0), 0)
    }
}
