import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

/// Runs the cases of `packages/common/src/utils/progression-in-session.util.spec.ts` (shared
/// fixture) so the Swift and TypeScript in-session anchors stay in sync.
final class ProgressionInSessionTests: XCTestCase {
    private struct HistorySet: Decodable {
        var weight: Double
        var reps: Int
        var rpe: Double?
    }

    private struct FixtureSet: Decodable {
        var setType: String?
        var weight: Double?
        var reps: Int?
        var rpe: Double?
        var completed: Bool
    }

    private struct Expectation: Decodable {
        var workingSetIndex: Int
        var suggestedWeight: Double?
        var suggestedReps: Int?
        var weightDelta: Double
        var repsDelta: Int
        var phase: String
    }

    private struct InSessionCase: Decodable {
        var name: String
        var exerciseId: String
        var repMin: Int
        var repMax: Int
        var historySets: [HistorySet]
        var currentSets: [FixtureSet]
        var expect: Expectation
    }

    private lazy var catalog = StarterCatalogLoader.load().exercises

    private func loadCases() throws -> [InSessionCase] {
        let repositoryRoot = (0..<7).reduce(URL(fileURLWithPath: #filePath)) { url, _ in
            url.deletingLastPathComponent()
        }
        let fixture = repositoryRoot
            .appendingPathComponent("packages/common/src/utils/__fixtures__/progression-in-session-cases.json")
        guard let data = try? Data(contentsOf: fixture) else {
            throw XCTSkip("shared in-session fixture not found at \(fixture.path)")
        }
        return try JSONDecoder().decode([InSessionCase].self, from: data)
    }

    private func historySession(_ c: InSessionCase) -> WorkoutSessionDto {
        let ex = catalog.first { $0.id == c.exerciseId }!
        let iso = ISO8601DateFormatter().string(from: Date(timeIntervalSince1970: 1_785_603_600))
        let id = "hist-\(c.exerciseId)-0"
        let sets = c.historySets.enumerated().map { idx, s in
            SessionSetDto(
                sessionExerciseId: "\(id)-ex",
                setNumber: idx + 1,
                setType: .WORKING,
                weight: s.weight,
                weightUnit: .KG,
                reps: s.reps,
                rpe: s.rpe,
                completed: true,
                completedAt: iso
            )
        }
        let sessionExercise = SessionExerciseDto(
            sessionId: id,
            exerciseId: c.exerciseId,
            exerciseNameSnapshot: ex.name,
            primaryMuscleSnapshot: ex.primaryMuscleGroup,
            orderIndex: 0,
            plannedSets: c.historySets.count,
            targetRepsMin: c.repMin,
            targetRepsMax: c.repMax,
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

    func testSharedInSessionCases() throws {
        let cases = try loadCases()
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let currentSets = c.currentSets.enumerated().map { idx, s in
                SessionSetDto(
                    sessionExerciseId: "cur-\(c.exerciseId)-ex",
                    setNumber: idx + 1,
                    setType: SetType(rawValue: s.setType ?? "WORKING") ?? .WORKING,
                    weight: s.weight,
                    weightUnit: .KG,
                    reps: s.reps,
                    rpe: s.rpe,
                    completed: s.completed
                )
            }
            let insight = ProgressionEngine.computeExerciseProgression(
                exerciseId: c.exerciseId,
                exerciseName: nil,
                historySessions: c.historySets.isEmpty ? [] : [historySession(c)],
                catalogExercise: catalog.first { $0.id == c.exerciseId },
                plannedSets: c.currentSets.count,
                targetRepsMin: c.repMin,
                targetRepsMax: c.repMax,
                weightUnit: .KG,
                currentSets: currentSets
            )

            let suggestion = try XCTUnwrap(
                insight.setSuggestions.count > c.expect.workingSetIndex
                    ? insight.setSuggestions[c.expect.workingSetIndex]
                    : nil,
                "\(c.name): no suggestion at index \(c.expect.workingSetIndex)"
            )
            XCTAssertEqual(suggestion.suggestedWeight, c.expect.suggestedWeight, c.name)
            XCTAssertEqual(suggestion.suggestedReps, c.expect.suggestedReps, c.name)
            XCTAssertEqual(suggestion.weightDelta, c.expect.weightDelta, c.name)
            XCTAssertEqual(suggestion.repsDelta, c.expect.repsDelta, c.name)
            XCTAssertEqual(suggestion.phase, ProgressionPhase(rawValue: c.expect.phase), c.name)
        }
    }
}
