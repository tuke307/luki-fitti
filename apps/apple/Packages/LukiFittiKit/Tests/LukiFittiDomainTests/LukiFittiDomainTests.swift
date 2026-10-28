import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain
@testable import LukiFittiDesign

final class LukiFittiDomainTests: XCTestCase {
    func testStarterCatalogBundleLoadsExercisesFoldersAndRoutines() {
        let bundleData = StarterCatalogLoader.load()
        XCTAssertGreaterThanOrEqual(bundleData.exercises.count, 50)
        XCTAssertEqual(bundleData.folders.count, 3)
        XCTAssertGreaterThanOrEqual(bundleData.stretchingRoutines.count, 6)
    }

    func testStarterCatalogBundleLoadsEveryLocale() {
        let english = StarterCatalogLoader.load(locale: .en)
        let german = StarterCatalogLoader.load(locale: .de)
        XCTAssertEqual(german.exercises.map(\.id), english.exercises.map(\.id))
        XCTAssertEqual(german.exercises.first { $0.id == "ex-barbell-bench-press-medium-grip" }?.name, "Bankdrücken (Langhantel)")
        XCTAssertEqual(german.folders.first?.templates.first?.name, "Tag 1 — Brust & Trizeps")
    }

    func testBlendedEpleyAndBrzyckiOneRepMaxParity() {
        // 100kg x 5 reps @ RPE 8 -> RIR 2 -> effectiveReps = 6
        // Epley: 100 * (1 + 6/30) = 120.0
        // Brzycki: 100 * (36 / 31) = 116.129032...
        // Blended: (120 + 116.129032) / 2 = 118.06
        let e1rm = ProgressionEngine.estimateOneRepMax(weight: 100, reps: 5, rpe: 8)
        XCTAssertEqual(e1rm, 118.06, accuracy: 0.01)

        // Single rep @ RPE 10 -> 100kg
        XCTAssertEqual(ProgressionEngine.estimateOneRepMax(weight: 100, reps: 1, rpe: 10), 100)
    }

    func testGlobalExerciseHistoryAndProgressiveOverloadRecommendation() {
        let bundleData = StarterCatalogLoader.load()
        let benchCatalog = bundleData.exercises.first { $0.id == "ex-barbell-bench-press-medium-grip" }
        XCTAssertNotNil(benchCatalog)

        let pastSet1 = SessionSetDto(
            id: "s1",
            clientSetId: "s1",
            sessionExerciseId: "sex-1",
            setNumber: 1,
            setType: .WORKING,
            weight: 85,
            weightUnit: .KG,
            reps: 10,
            rpe: 8.0,
            completed: true,
            completedAt: "2026-10-10T17:15:00.000Z"
        )
        let pastSet2 = SessionSetDto(
            id: "s2",
            clientSetId: "s2",
            sessionExerciseId: "sex-1",
            setNumber: 2,
            setType: .WORKING,
            weight: 85,
            weightUnit: .KG,
            reps: 10,
            rpe: 8.5,
            completed: true,
            completedAt: "2026-10-10T17:18:00.000Z"
        )
        let pastSet3 = SessionSetDto(
            id: "s3",
            clientSetId: "s3",
            sessionExerciseId: "sex-1",
            setNumber: 3,
            setType: .WORKING,
            weight: 85,
            weightUnit: .KG,
            reps: 10,
            rpe: 8.5,
            completed: true,
            completedAt: "2026-10-10T17:21:00.000Z"
        )

        let pastExercise = SessionExerciseDto(
            id: "sex-1",
            clientExerciseId: "sex-1",
            sessionId: "hist-1",
            exerciseId: "ex-barbell-bench-press-medium-grip",
            exerciseNameSnapshot: "Barbell Bench Press",
            primaryMuscleSnapshot: .CHEST,
            exerciseTypeSnapshot: .STRENGTH,
            origin: .PLANNED,
            status: .COMPLETED,
            orderIndex: 0,
            plannedSets: 3,
            targetRepsMin: 6,
            targetRepsMax: 10,
            targetWeight: 80,
            restSeconds: 120,
            sets: [pastSet1, pastSet2, pastSet3]
        )

        let pastSession = WorkoutSessionDto(
            id: "hist-1",
            clientSessionId: "hist-1",
            userId: "user-1",
            sessionType: .STRENGTH,
            workoutNameSnapshot: "Full Body Friday",
            status: .COMPLETED,
            startedAt: "2026-10-10T17:00:00.000Z",
            completedAt: "2026-10-10T18:00:00.000Z",
            activeDurationSeconds: 3600,
            weightUnit: .KG,
            exercises: [pastExercise]
        )

        let insight = ProgressionEngine.computeExerciseProgression(
            exerciseId: "ex-barbell-bench-press-medium-grip",
            exerciseName: "Barbell Bench Press",
            historySessions: [pastSession],
            catalogExercise: benchCatalog,
            plannedSets: 3,
            targetRepsMin: 6,
            targetRepsMax: 10,
            targetWeight: 80,
            weightUnit: .KG
        )

        XCTAssertEqual(insight.phase, .INCREASE_WEIGHT)
        XCTAssertEqual(insight.setSuggestions.first?.suggestedWeight, 87.5)
        XCTAssertEqual(insight.setSuggestions.first?.weightDelta, 2.5)
        XCTAssertEqual(ProgressionEngine.formatCompactDelta(2.5), "+2.5")
    }

    func testCardiovascularFatigueDetectionFromAppleWatchHRRecovery() {
        let fatiguedSet = SessionSetDto(
            sessionExerciseId: "sex-hr",
            setNumber: 1,
            setType: .WORKING,
            weight: 100,
            weightUnit: .KG,
            reps: 10,
            rpe: nil,
            completed: true,
            peakHeartRateBpm: 176,
            restEndHeartRateBpm: 168 // Only 8 BPM drop after rest (< 15 BPM threshold)
        )
        let fatiguedEx = SessionExerciseDto(
            sessionId: "sess-hr",
            exerciseId: "ex-barbell-bench-press-medium-grip",
            exerciseNameSnapshot: "Barbell Bench Press",
            primaryMuscleSnapshot: .CHEST,
            orderIndex: 0,
            plannedSets: 1,
            targetRepsMin: 8,
            targetRepsMax: 10,
            sets: [fatiguedSet]
        )
        let fatiguedSession = WorkoutSessionDto(
            clientSessionId: "sess-hr",
            workoutNameSnapshot: "Watch Push",
            status: .COMPLETED,
            startedAt: "2026-10-15T17:00:00.000Z",
            completedAt: "2026-10-15T18:00:00.000Z",
            sourceDevice: .APPLE_WATCH,
            exercises: [fatiguedEx]
        )

        let insight = ProgressionEngine.computeExerciseProgression(
            exerciseId: "ex-barbell-bench-press-medium-grip",
            exerciseName: "Barbell Bench Press",
            historySessions: [fatiguedSession],
            plannedSets: 1,
            targetRepsMin: 8,
            targetRepsMax: 10
        )

        XCTAssertTrue(insight.elevatedSystemicFatigueFromHR)
        // Because HR recovery drop < 15 BPM indicates elevated systemic fatigue, phase holds at MAINTAIN instead of INCREASE_WEIGHT
        XCTAssertEqual(insight.phase, .MAINTAIN)
    }

    func testSupersetGroupingAndWorkoutExerciseSuggestionEngine() throws {
        let bundleData = StarterCatalogLoader.load()
        let ex1 = WorkoutTemplateExerciseDto(
            templateId: "tpl-1",
            exerciseId: "ex-barbell-bench-press-medium-grip",
            orderIndex: 0,
            plannedSets: 3,
            restSeconds: 120
        )
        let ex2 = WorkoutTemplateExerciseDto(
            templateId: "tpl-1",
            exerciseId: "ex-side-lateral-raise",
            orderIndex: 1,
            plannedSets: 3,
            restSeconds: 0
        )
        let ex3 = WorkoutTemplateExerciseDto(
            templateId: "tpl-1",
            exerciseId: "ex-triceps-pushdown-rope-attachment",
            orderIndex: 2,
            plannedSets: 3,
            restSeconds: 60
        )

        let blocks = ProgressionEngine.groupTemplateExercisesIntoBlocks([ex1, ex2, ex3])
        XCTAssertEqual(blocks.count, 2)
        XCTAssertFalse(blocks[0].isSuperset)
        XCTAssertTrue(blocks[1].isSuperset)
        XCTAssertEqual(blocks[1].rounds, 3)
        XCTAssertEqual(blocks[1].roundRestSeconds, 60)
        XCTAssertEqual(blocks[1].items.count, 2)
        XCTAssertEqual(blocks[1].items[0].stepNumber, 1)
        XCTAssertEqual(blocks[1].items[1].stepNumber, 2)
        XCTAssertEqual(ProgressionEngine.formatRestDurationMinSec(60), "1:00")

        let suggestion = ProgressionEngine.computeWorkoutExerciseSuggestion(
            workoutName: "Push Day — Chest & Shoulders",
            exercises: [WorkoutSuggestionInputExercise(exerciseId: "ex-barbell-bench-press-medium-grip")],
            catalog: bundleData.exercises,
            historySessions: []
        )
        XCTAssertNotNil(suggestion)
        XCTAssertEqual(suggestion?.reasonType, .MISSING_MUSCLE)
        XCTAssertNotEqual(suggestion?.suggestedExercise.id, "ex-barbell-bench-press-medium-grip")

        // Verify legacy FAILURE and MOBILITY JSON values decode safely
        let legacySetType = try JSONDecoder().decode(SetType.self, from: Data("\"FAILURE\"".utf8))
        XCTAssertEqual(legacySetType, .WORKING)
        let legacyExType = try JSONDecoder().decode(ExerciseType.self, from: Data("\"MOBILITY\"".utf8))
        XCTAssertEqual(legacyExType, .STRETCHING)
    }
}
