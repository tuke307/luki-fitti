import XCTest
@testable import LukiFittiDomain
@testable import LukiFittiModels

/// Mirrors `training-goal.util.spec.ts` in @luki-fitti/common.
final class TrainingGoalTests: XCTestCase {
    func testResolvePrefersTemplateGoal() {
        XCTAssertEqual(
            TrainingGoalProfiles.resolve(templateGoal: .STRENGTH, profileGoal: .ENDURANCE),
            .STRENGTH
        )
    }

    func testResolveFallsBackToProfileGoal() {
        XCTAssertEqual(TrainingGoalProfiles.resolve(templateGoal: nil, profileGoal: .ENDURANCE), .ENDURANCE)
    }

    func testResolveReturnsNilWhenUnset() {
        XCTAssertNil(TrainingGoalProfiles.resolve(templateGoal: nil, profileGoal: nil))
    }

    func testRepRangeUsesCompoundBandForNonIsolation() {
        XCTAssertEqual(TrainingGoalProfiles.repRange(for: .STRENGTH).min, 3)
        XCTAssertEqual(TrainingGoalProfiles.repRange(for: .STRENGTH).max, 6)
        let compound = ExerciseDto(id: "x", slug: "x", name: "Squat", description: "", category: .COMPOUND, primaryMuscleGroup: .CHEST)
        XCTAssertEqual(TrainingGoalProfiles.repRange(for: .ENDURANCE, exercise: compound).max, 20)
    }

    func testRepRangeUsesIsolationBandOnlyForIsolation() {
        let isolation = ExerciseDto(id: "x", slug: "x", name: "Curl", description: "", category: .ISOLATION, primaryMuscleGroup: .BICEPS)
        let band = TrainingGoalProfiles.repRange(for: .STRENGTH, exercise: isolation)
        XCTAssertEqual(band.min, 6)
        XCTAssertEqual(band.max, 10)
        let hypo = TrainingGoalProfiles.repRange(for: .HYPERTROPHY, exercise: isolation)
        XCTAssertEqual(hypo.min, 10)
        XCTAssertEqual(hypo.max, 15)
    }

    func testResolveRestSecondsSwapsLegacyDefault() {
        XCTAssertEqual(TrainingGoalProfiles.resolveRestSeconds(90, goal: .STRENGTH), 180)
        XCTAssertEqual(TrainingGoalProfiles.resolveRestSeconds(90, goal: .ENDURANCE), 60)
    }

    func testResolveRestSecondsKeepsZeroAndCustom() {
        XCTAssertEqual(TrainingGoalProfiles.resolveRestSeconds(0, goal: .STRENGTH), 0)
        XCTAssertEqual(TrainingGoalProfiles.resolveRestSeconds(120, goal: .STRENGTH), 120)
    }

    func testResolveRestSecondsUnchangedWithoutGoal() {
        XCTAssertEqual(TrainingGoalProfiles.resolveRestSeconds(90, goal: nil), 90)
    }
}
