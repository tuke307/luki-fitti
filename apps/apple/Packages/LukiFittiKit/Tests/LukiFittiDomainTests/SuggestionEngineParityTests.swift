import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain
@testable import LukiFittiDesign

/// Mirrors `packages/common/src/utils/progression.util.spec.ts` case by case so the
/// Swift and TypeScript suggestion engines stay in sync.
final class SuggestionEngineParityTests: XCTestCase {
    private let bench = "ex-barbell-bench-press-medium-grip"
    private let shoulderPress = "ex-dumbbell-shoulder-press"
    private let pushdown = "ex-triceps-pushdown-rope-attachment"
    private lazy var catalog = StarterCatalogLoader.load().exercises

    private func session(day: Int, exerciseId: String, weight: Double, reps: Int, rpe: Double?) -> WorkoutSessionDto {
        let ex = catalog.first { $0.id == exerciseId }!
        let start = Date(timeIntervalSince1970: 1_785_603_600 + Double(day) * 86_400)
        let iso = ISO8601DateFormatter().string(from: start)
        let id = "hist-\(exerciseId)-\(day)"
        let sets = (1...3).map { n in
            SessionSetDto(
                sessionExerciseId: "\(id)-ex",
                setNumber: n,
                setType: .WORKING,
                weight: weight,
                weightUnit: .KG,
                reps: reps,
                rpe: rpe,
                completed: true
            )
        }
        let sessionExercise = SessionExerciseDto(
            sessionId: id,
            exerciseId: exerciseId,
            exerciseNameSnapshot: ex.name,
            primaryMuscleSnapshot: ex.primaryMuscleGroup,
            orderIndex: 0,
            plannedSets: 3,
            targetRepsMin: 8,
            targetRepsMax: 12,
            sets: sets
        )
        return WorkoutSessionDto(
            clientSessionId: id,
            workoutNameSnapshot: "Push Day",
            status: .COMPLETED,
            startedAt: iso,
            completedAt: iso,
            exercises: [sessionExercise]
        )
    }

    private var balancedPush: [WorkoutSuggestionInputExercise] {
        [bench, shoulderPress, pushdown].map { WorkoutSuggestionInputExercise(exerciseId: $0, plannedSets: 3) }
    }

    private func suggest(
        _ exercises: [WorkoutSuggestionInputExercise],
        _ history: [WorkoutSessionDto] = [],
        dismissed: [DismissedWorkoutSuggestion] = []
    ) -> WorkoutExerciseSuggestion? {
        ProgressionEngine.computeWorkoutExerciseSuggestion(
            workoutName: "Push Day",
            exercises: exercises,
            catalog: catalog,
            historySessions: history,
            dismissed: dismissed
        )
    }

    func testDismissedSuggestionMovesOnToTheNextReason() {
        let history = [0, 7, 14].map { session(day: $0, exerciseId: shoulderPress, weight: 28, reps: 6, rpe: 9.5) }
            + [(0, 30.0), (7, 28.0), (14, 26.0)].map { session(day: $0.0, exerciseId: pushdown, weight: $0.1, reps: 12, rpe: 8) }
        let first = suggest(balancedPush, history)
        XCTAssertEqual(first?.reasonType, .REGRESSION)
        XCTAssertEqual(first?.stallingExerciseId, pushdown)

        let second = suggest(balancedPush, history, dismissed: [ProgressionEngine.toDismissedSuggestion(first!)])
        XCTAssertEqual(second?.reasonType, .GRINDING)
        XCTAssertEqual(second?.stallingExerciseId, shoulderPress)
        XCTAssertNotEqual(second?.suggestedExercise.id, first?.suggestedExercise.id)
    }

    func testAllReasonsDismissedReturnsNil() {
        let history = [0, 7, 14].map { session(day: $0, exerciseId: shoulderPress, weight: 28, reps: 6, rpe: 9.5) }
        let first = suggest(balancedPush, history)!
        XCTAssertNil(suggest(balancedPush, history, dismissed: [ProgressionEngine.toDismissedSuggestion(first)]))
    }

    func testTrendCountsSessionsAndWeeksSinceBestIgnoringTies() {
        let history = ProgressionEngine.extractGlobalExerciseHistory(
            exerciseId: shoulderPress,
            exerciseName: nil,
            historySessions: [0, 10, 20, 30, 42].map { session(day: $0, exerciseId: shoulderPress, weight: 28, reps: 8, rpe: 8) }
        )
        let trend = ProgressionEngine.analyzeExerciseTrend(history)
        XCTAssertEqual(trend.sessionsCount, 5)
        XCTAssertEqual(trend.sessionsSinceBest, 4)
        XCTAssertEqual(trend.weeksSinceBest, 6)
        XCTAssertEqual(trend.hardSessionsRecent, 0)
        XCTAssertEqual(trend.recentWindow, 3)
        XCTAssertEqual(trend.changePct, 0)
    }

    func testSingleMaxEffortSessionIsNotFlagged() {
        let history = [session(day: 0, exerciseId: shoulderPress, weight: 28, reps: 8, rpe: 9.5)]
        XCTAssertNil(suggest(balancedPush, history))
    }

    func testRepeatedMaxEffortWhileImprovingIsNotFlagged() {
        let history = [6, 7, 8].enumerated().map { idx, reps in
            session(day: idx * 7, exerciseId: shoulderPress, weight: 28, reps: reps, rpe: 9.5)
        }
        XCTAssertNil(suggest(balancedPush, history))
    }

    func testGrindingWhenMaxEffortRepeatsWithoutGain() throws {
        let history = [0, 7, 14].map { session(day: $0, exerciseId: shoulderPress, weight: 28, reps: 6, rpe: 9.5) }
        let suggestion = try XCTUnwrap(suggest(balancedPush, history))
        XCTAssertEqual(suggestion.reasonType, .GRINDING)
        XCTAssertEqual(suggestion.targetMuscle, .SHOULDERS)
        XCTAssertEqual(suggestion.stallingExerciseId, shoulderPress)
        XCTAssertEqual(suggestion.evidence.hardSessionsRecent, 3)
        XCTAssertEqual(suggestion.evidence.recentWindow, 3)
        XCTAssertEqual(suggestion.evidence.changePct, 0)
        XCTAssertEqual(SuggestionReasonFormatter.evidence(for: suggestion, locale: .en), "Max effort 3 of last 3 · no gain")
    }

    func testPlateauAfterWeeksWithoutNewBest() throws {
        let history = [0, 10, 20, 30, 42].map { session(day: $0, exerciseId: shoulderPress, weight: 28, reps: 8, rpe: 8) }
        let suggestion = try XCTUnwrap(suggest(balancedPush, history))
        XCTAssertEqual(suggestion.reasonType, .PLATEAU)
        XCTAssertEqual(suggestion.stallingExerciseId, shoulderPress)
        XCTAssertEqual(suggestion.evidence.sessionsSinceBest, 4)
        XCTAssertEqual(suggestion.evidence.weeksSinceBest, 6)
        XCTAssertEqual(SuggestionReasonFormatter.evidence(for: suggestion, locale: .en), "4 sessions · 6 wks without a new best")
    }

    func testRegressionWhenEstimatedOneRepMaxTrendsDown() throws {
        let history = [(0, 30.0), (7, 28.0), (14, 26.0)].map {
            session(day: $0.0, exerciseId: shoulderPress, weight: $0.1, reps: 8, rpe: 8)
        }
        let suggestion = try XCTUnwrap(suggest(balancedPush, history))
        XCTAssertEqual(suggestion.reasonType, .REGRESSION)
        XCTAssertLessThanOrEqual(suggestion.evidence.changePct, -4)
    }

    func testMissingMuscleHasNoSwapTarget() throws {
        let suggestion = try XCTUnwrap(suggest([
            WorkoutSuggestionInputExercise(exerciseId: bench, plannedSets: 3),
            WorkoutSuggestionInputExercise(exerciseId: shoulderPress, plannedSets: 3),
        ]))
        XCTAssertEqual(suggestion.reasonType, .MISSING_MUSCLE)
        XCTAssertEqual(suggestion.targetMuscle, .TRICEPS)
        XCTAssertNil(suggestion.stallingExerciseId)
        XCTAssertNil(suggestion.stallingExerciseName)
        XCTAssertEqual(suggestion.evidence.setsForMuscle, 0)
        XCTAssertEqual(suggestion.evidence.setsTotal, 6)
        XCTAssertTrue(SuggestionReasonFormatter.reason(for: suggestion, locale: .en).hasPrefix("Your PUSH workout has no Triceps work yet."))
    }

    func testLowVolumeWhenKeyMuscleGetsFarFewerSets() throws {
        let suggestion = try XCTUnwrap(suggest([
            WorkoutSuggestionInputExercise(exerciseId: bench, plannedSets: 6),
            WorkoutSuggestionInputExercise(exerciseId: shoulderPress, plannedSets: 4),
            WorkoutSuggestionInputExercise(exerciseId: pushdown, plannedSets: 1),
        ]))
        XCTAssertEqual(suggestion.reasonType, .LOW_VOLUME)
        XCTAssertEqual(suggestion.targetMuscle, .TRICEPS)
        XCTAssertNil(suggestion.stallingExerciseId)
        XCTAssertEqual(suggestion.evidence.setsForMuscle, 1)
        XCTAssertEqual(suggestion.evidence.setsTotal, 11)
        XCTAssertEqual(SuggestionReasonFormatter.evidence(for: suggestion, locale: .en), "1 of 11 sets")
    }

    func testBalancedWorkoutWithoutStallsReturnsNothing() {
        XCTAssertNil(suggest(balancedPush))
    }

    private func progress(reps: Int, rpe: Double) -> ExerciseProgressionInsight {
        ProgressionEngine.computeExerciseProgression(
            exerciseId: shoulderPress,
            exerciseName: nil,
            historySessions: [session(day: 0, exerciseId: shoulderPress, weight: 20, reps: reps, rpe: rpe)],
            catalogExercise: catalog.first { $0.id == shoulderPress },
            plannedSets: 3,
            targetRepsMin: 8,
            targetRepsMax: 12
        )
    }

    func testMaxEffortAtTopOfRangeIncreasesWeight() {
        let insight = progress(reps: 12, rpe: 9.5)
        XCTAssertEqual(insight.phase, .INCREASE_WEIGHT)
        XCTAssertGreaterThan(insight.setSuggestions.first?.weightDelta ?? 0, 0)
    }

    func testMaxEffortBelowTopOfRangeHoldsPrescription() {
        let insight = progress(reps: 9, rpe: 9.5)
        XCTAssertEqual(insight.phase, .MAINTAIN)
        XCTAssertEqual(insight.setSuggestions.first?.suggestedWeight, 20)
        XCTAssertEqual(insight.setSuggestions.first?.suggestedReps, 9)
    }
}
