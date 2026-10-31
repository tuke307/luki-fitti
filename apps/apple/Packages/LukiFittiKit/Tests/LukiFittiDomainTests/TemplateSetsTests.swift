import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

final class TemplateSetsTests: XCTestCase {
    private func template(_ exercises: [WorkoutTemplateExerciseDto]) -> WorkoutTemplateDto {
        WorkoutTemplateDto(id: "tpl-1", name: "Day 4", exercises: exercises)
    }

    private func set(_ type: SetType, _ weight: Double, _ reps: Int, completed: Bool = true) -> SessionSetDto {
        SessionSetDto(sessionExerciseId: "x", setNumber: 1, setType: type, weight: weight, reps: reps, completed: completed)
    }

    private func session(_ exercises: [SessionExerciseDto]) -> WorkoutSessionDto {
        WorkoutSessionDto(templateId: "tpl-1", workoutNameSnapshot: "Day 4", status: .COMPLETED, exercises: exercises)
    }

    func testResolveExpandsSummaryOnlyTemplates() {
        let te = WorkoutTemplateExerciseDto(templateId: "tpl-1", exerciseId: "press", orderIndex: 0, plannedSets: 2, warmupSets: 1, targetWeight: 60)
        XCTAssertEqual(TemplateSets.resolve(te).map(\.setType), [.WARMUP, .WORKING, .WORKING])
        XCTAssertEqual(TemplateSets.resolve(te).first?.weight, 36)
    }

    func testWriteBackCopiesSetsKeepsSkippedAndReplacesSwaps() {
        let tpl = template([
            WorkoutTemplateExerciseDto(id: "te-a", templateId: "tpl-1", exerciseId: "a", orderIndex: 0),
            WorkoutTemplateExerciseDto(id: "te-b", templateId: "tpl-1", exerciseId: "b", orderIndex: 1),
            WorkoutTemplateExerciseDto(id: "te-c", templateId: "tpl-1", exerciseId: "c", orderIndex: 2),
        ])
        let result = TemplateSets.buildTemplateExercises(template: tpl, session: session([
            SessionExerciseDto(sessionId: "sess-1", exerciseId: "a", exerciseNameSnapshot: "A", primaryMuscleSnapshot: .SHOULDERS, orderIndex: 0, sets: [
                set(.WORKING, 62.5, 10), set(.WARMUP, 30, 12),
            ]),
            SessionExerciseDto(sessionId: "sess-1", exerciseId: "b", exerciseNameSnapshot: "B", primaryMuscleSnapshot: .SHOULDERS, orderIndex: 0, sets: [
                set(.WORKING, 20, 10, completed: false),
            ]),
            SessionExerciseDto(sessionId: "sess-1", exerciseId: "smith", replacedExerciseId: "c", exerciseNameSnapshot: "Smith", primaryMuscleSnapshot: .SHOULDERS, origin: .SUBSTITUTED, orderIndex: 2, sets: [
                set(.WORKING, 50, 8),
            ]),
        ]))

        XCTAssertNotNil(result)
        XCTAssertEqual(result?.map { $0.exerciseId }, ["a", "b", "smith"])
        XCTAssertEqual(result?[0].sets?.map { $0.setType }, [SetType.WARMUP, SetType.WORKING])
        XCTAssertEqual(result?[0].warmupSets, 1)
        XCTAssertEqual(result?[0].targetWeight, 62.5)
        XCTAssertNil(result?[1].sets, "skipped exercise keeps its previous plan")
        XCTAssertEqual(result?[2].id, "te-c")
        XCTAssertEqual(result?[2].alternativeExerciseIds, ["c"])
    }

    func testWriteBackReturnsNilWhenNothingChanged() {
        let tpl = template([
            WorkoutTemplateExerciseDto(id: "te-a", templateId: "tpl-1", exerciseId: "a", orderIndex: 0, plannedSets: 1, targetWeight: 60),
        ])
        let unchanged = session([
            SessionExerciseDto(sessionId: "sess-1", exerciseId: "a", exerciseNameSnapshot: "A", primaryMuscleSnapshot: .SHOULDERS, orderIndex: 0, sets: [set(.WORKING, 60, 8)]),
        ])
        XCTAssertNil(TemplateSets.buildTemplateExercises(template: tpl, session: unchanged))
    }

    private func planned(_ type: SetType, _ reps: Int?) -> TemplateSetDto {
        TemplateSetDto(setType: type, weight: 50, reps: reps)
    }

    func testDeriveRepRangeKeepsRangeContainingPlannedReps() {
        let range = TemplateSets.deriveRepRange([planned(.WORKING, 10), planned(.WORKING, 9)], currentMin: 8, currentMax: 12)
        XCTAssertEqual(range.min, 8)
        XCTAssertEqual(range.max, 12)
    }

    func testDeriveRepRangeMovesBandBelowAndAbove() {
        let below = TemplateSets.deriveRepRange([planned(.WORKING, 6)], currentMin: 8, currentMax: 12)
        XCTAssertEqual(below.min, 6)
        XCTAssertEqual(below.max, 10)
        let above = TemplateSets.deriveRepRange([planned(.WORKING, 15), planned(.DROPSET, 14)], currentMin: 8, currentMax: 12)
        XCTAssertEqual(above.min, 14)
        XCTAssertEqual(above.max, 18)
    }

    func testDeriveRepRangeWithoutExistingRange() {
        let range = TemplateSets.deriveRepRange([planned(.WORKING, 98)], currentMin: nil, currentMax: nil)
        XCTAssertEqual(range.min, 98)
        XCTAssertEqual(range.max, 100)
    }

    func testDeriveRepRangeIgnoresWarmupsAndStretches() {
        let range = TemplateSets.deriveRepRange(
            [planned(.WARMUP, 3), planned(.STRETCH, 1), planned(.WORKING, 10)],
            currentMin: nil, currentMax: nil
        )
        XCTAssertEqual(range.min, 10)
        XCTAssertEqual(range.max, 14)
    }

    func testDeriveRepRangeUnchangedWithoutWorkingReps() {
        let sets = [planned(.WARMUP, 10), planned(.WORKING, nil), planned(.WORKING, 0)]
        let kept = TemplateSets.deriveRepRange(sets, currentMin: 8, currentMax: 12)
        XCTAssertEqual(kept.min, 8)
        XCTAssertEqual(kept.max, 12)
        let empty = TemplateSets.deriveRepRange(sets, currentMin: nil, currentMax: nil)
        XCTAssertNil(empty.min)
        XCTAssertNil(empty.max)
    }
}
