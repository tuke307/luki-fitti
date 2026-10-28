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
}
