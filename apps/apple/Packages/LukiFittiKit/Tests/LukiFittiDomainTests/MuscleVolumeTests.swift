import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

/// Same cases as `packages/common/src/utils/muscle-volume.util.spec.ts`.
final class MuscleVolumeTests: XCTestCase {
    private let now = LukiISODate.parse("2026-10-31T12:00:00Z")!

    private func sets(_ n: Int, _ type: SetType = .WORKING, completed: Bool = true) -> [SessionSetDto] {
        (0..<n).map { SessionSetDto(sessionExerciseId: "x", setNumber: $0 + 1, setType: type, completed: completed) }
    }

    private let secondary: [String: [MuscleGroup]] = [
        "bench": [.TRICEPS, .SHOULDERS, .CHEST],
        "squat": [.GLUTES, .FULL_BODY],
    ]

    private func exercise(
        _ id: String?, _ primary: MuscleGroup, _ type: ExerciseType = .STRENGTH, _ sets: [SessionSetDto]
    ) -> SessionExerciseDto {
        SessionExerciseDto(
            sessionId: "s", exerciseId: id, exerciseNameSnapshot: id ?? "custom",
            primaryMuscleSnapshot: primary, exerciseTypeSnapshot: type, orderIndex: 0, sets: sets
        )
    }

    private func session(_ startedAt: String, _ exercises: [SessionExerciseDto]) -> WorkoutSessionDto {
        var s = WorkoutSessionDto(workoutNameSnapshot: "W", status: .COMPLETED, startedAt: startedAt)
        s.exercises = exercises
        return s
    }

    func testCountsSecondaryMusclesAtHalfASetAndAveragesPerWeek() {
        let result = MuscleVolume.weeklySetsByMuscle(
            [
                session("2026-10-28T10:00:00Z", [
                    exercise("bench", .CHEST, .STRENGTH, sets(1, .WARMUP) + sets(4) + sets(1, .WORKING, completed: false)),
                ]),
                session("2026-10-21T10:00:00Z", [exercise("bench", .CHEST, .STRENGTH, sets(4))]),
            ],
            secondaryMuscles: { self.secondary[$0] },
            weeks: 2,
            now: now
        )
        XCTAssertEqual(result, [
            .init(muscle: .CHEST, setsPerWeek: 4, directSetsPerWeek: 4, status: .below),
            .init(muscle: .SHOULDERS, setsPerWeek: 2, directSetsPerWeek: 0, status: .below),
            .init(muscle: .TRICEPS, setsPerWeek: 2, directSetsPerWeek: 0, status: .below),
        ])
    }

    func testSkipsStretchingCardioFullBodyPrimariesAndSessionsOutsideTheWindow() {
        let result = MuscleVolume.weeklySetsByMuscle(
            [
                session("2026-10-30T10:00:00Z", [
                    exercise("squat", .QUADRICEPS, .STRENGTH, sets(12)),
                    exercise(nil, .FULL_BODY, .STRENGTH, sets(3)),
                    exercise("stretch", .HAMSTRINGS, .STRETCHING, sets(3, .STRETCH)),
                    exercise("run", .CALVES, .CARDIO, sets(1)),
                ]),
                session("2026-09-01T10:00:00Z", [exercise("squat", .QUADRICEPS, .STRENGTH, sets(30))]),
            ],
            secondaryMuscles: { self.secondary[$0] },
            weeks: 1,
            now: now
        )
        XCTAssertEqual(result, [
            .init(muscle: .QUADRICEPS, setsPerWeek: 12, directSetsPerWeek: 12, status: .within),
            .init(muscle: .GLUTES, setsPerWeek: 6, directSetsPerWeek: 0, status: .below),
        ])
    }

    func testClassifiesAgainstTheTenToTwentySetsTarget() {
        XCTAssertEqual(MuscleVolume.status(setsPerWeek: 9.5), .below)
        XCTAssertEqual(MuscleVolume.status(setsPerWeek: 10), .within)
        XCTAssertEqual(MuscleVolume.status(setsPerWeek: 20), .within)
        XCTAssertEqual(MuscleVolume.status(setsPerWeek: 20.5), .above)
    }
}
