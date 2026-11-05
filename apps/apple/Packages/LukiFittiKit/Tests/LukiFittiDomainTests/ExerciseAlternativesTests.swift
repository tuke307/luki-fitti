import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

/// Runs the cases of `packages/common/src/utils/exercise-alternatives.util.spec.ts` (shared
/// fixture) so the Swift and TypeScript alternative rankings stay in sync.
final class ExerciseAlternativesTests: XCTestCase {
    private struct AlternativesCase: Decodable {
        var target: String
        var pattern: MovementPattern
        var laterality: Laterality?
        var preferLaterality: Laterality?
        var preferredIds: [String]?
        var top: [String]
        var exclude: [String]
    }

    private lazy var catalog = StarterCatalogLoader.load(locale: .en).exercises
    private var coreIds: Set<String> { Set(ExerciseSearchData.bundled.coreExerciseIds) }

    private func loadCases() throws -> [AlternativesCase] {
        let repositoryRoot = (0..<7).reduce(URL(fileURLWithPath: #filePath)) { url, _ in
            url.deletingLastPathComponent()
        }
        let fixture = repositoryRoot
            .appendingPathComponent("packages/common/src/utils/__fixtures__/alternatives-cases.json")
        guard let data = try? Data(contentsOf: fixture) else {
            throw XCTSkip("shared alternatives fixture not found at \(fixture.path)")
        }
        return try JSONDecoder().decode([AlternativesCase].self, from: data)
    }

    private func exercise(_ id: String) -> ExerciseDto {
        catalog.first { $0.id == id }!
    }

    func testSharedCasesInEveryLanguage() throws {
        let cases = try loadCases()
        XCTAssertFalse(cases.isEmpty)
        for locale in [SupportedLocale.en, .de] {
            let exercises = StarterCatalogLoader.load(locale: locale).exercises
            for c in cases {
                let target = try XCTUnwrap(exercises.first { $0.id == c.target })
                let ranked = ExerciseAlternatives.rank(
                    target: target,
                    catalog: exercises,
                    preferredIds: Set(c.preferredIds ?? []),
                    popularIds: coreIds,
                    preferLaterality: c.preferLaterality
                )
                let top = Array(ranked.prefix(3))
                XCTAssertEqual(top.map(\.exercise.id), c.top, "[\(locale)] \(c.target)")
                for r in top {
                    let pattern = try XCTUnwrap(r.exercise.movementPattern)
                    XCTAssertTrue(
                        pattern == c.pattern || ExerciseAlternatives.areCompatible(c.pattern, pattern),
                        "[\(locale)] \(c.target): \(r.exercise.id) is \(pattern)"
                    )
                    if let laterality = c.laterality { XCTAssertEqual(r.exercise.laterality, laterality) }
                }
                let ids = Set(ranked.map(\.exercise.id))
                for id in c.exclude { XCTAssertFalse(ids.contains(id), "[\(locale)] \(c.target) ranked \(id)") }
            }
        }
    }

    func testExplainsEachMatch() throws {
        let first = try XCTUnwrap(ExerciseAlternatives.rank(target: exercise("ex-straight-arm-pulldown"), catalog: catalog).first)
        XCTAssertEqual(first.exercise.id, "ex-rope-straight-arm-pulldown")
        XCTAssertEqual(first.reasons, [.YOUR_ALTERNATIVE, .SAME_MOVEMENT, .SAME_MUSCLES, .SAME_SIDE])
    }

    func testKeepsTheUsersOwnAlternativesAndSkipsExcludedOnes() {
        let ranked = ExerciseAlternatives.rank(
            target: exercise("ex-straight-arm-pulldown"),
            catalog: catalog,
            excludeIds: ["ex-rope-straight-arm-pulldown"],
            preferredIds: ["ex-wide-grip-lat-pulldown"]
        )
        XCTAssertFalse(ranked.contains { $0.exercise.id == "ex-rope-straight-arm-pulldown" })
        XCTAssertEqual(ranked.first { $0.exercise.id == "ex-wide-grip-lat-pulldown" }?.reasons.first, .YOUR_ALTERNATIVE)
        XCTAssertFalse(ranked.contains { $0.exercise.id == "ex-alternative-db-gorilla-rows" })
        XCTAssertFalse(ranked.contains { $0.exercise.exerciseType == .STRETCHING })
    }

    func testReturnsNothingWithoutAKnownMovement() {
        var custom = exercise("ex-straight-arm-pulldown")
        custom.id = "custom"
        custom.movementPattern = nil
        custom.alternativeExerciseIds = []
        XCTAssertTrue(ExerciseAlternatives.rank(target: custom, catalog: catalog).isEmpty)
    }

    func testRanksOneSidedVersionsFirstWhenAsked() throws {
        let first = try XCTUnwrap(ExerciseAlternatives.rank(
            target: exercise("ex-barbell-row-underhand"),
            catalog: catalog,
            preferLaterality: .UNILATERAL
        ).first)
        XCTAssertEqual(first.exercise.laterality, .UNILATERAL)
        XCTAssertEqual(first.exercise.movementPattern, .HORIZONTAL_PULL)
        XCTAssertTrue(first.reasons.contains(.UNILATERAL_VARIANT))
        XCTAssertFalse(first.reasons.contains(.SAME_SIDE))
    }

    func testOneSidedBeatsDoneBeforeButNotYourOwnAlternatives() {
        var row = exercise("ex-barbell-row-underhand")
        row.alternativeExerciseIds = []
        let history = [WorkoutSessionDto(workoutNameSnapshot: "Pull", exercises: [SessionExerciseDto(
            sessionId: "s",
            exerciseId: "ex-bent-over-barbell-row",
            exerciseNameSnapshot: "Row",
            primaryMuscleSnapshot: .BACK,
            orderIndex: 0,
            sets: [SessionSetDto(sessionExerciseId: "e", setNumber: 1, completed: true)]
        )])]
        let ranked = ExerciseAlternatives.rank(target: row, catalog: catalog, historySessions: history, preferLaterality: .UNILATERAL)
        let oneSided = ranked.firstIndex { $0.exercise.laterality == .UNILATERAL } ?? .max
        let doneBefore = ranked.firstIndex { $0.exercise.id == "ex-bent-over-barbell-row" } ?? .max
        XCTAssertLessThan(oneSided, doneBefore)

        let withOwn = ExerciseAlternatives.rank(
            target: row,
            catalog: catalog,
            preferredIds: ["ex-bent-over-barbell-row"],
            preferLaterality: .UNILATERAL
        )
        XCTAssertEqual(withOwn.first?.exercise.id, "ex-bent-over-barbell-row")
    }

    func testRanksAsBeforeWithoutAOneSidedVersion() {
        let curl = exercise("ex-seated-leg-curl")
        XCTAssertEqual(
            ExerciseAlternatives.rank(target: curl, catalog: catalog, preferLaterality: .UNILATERAL),
            ExerciseAlternatives.rank(target: curl, catalog: catalog)
        )
    }
}
