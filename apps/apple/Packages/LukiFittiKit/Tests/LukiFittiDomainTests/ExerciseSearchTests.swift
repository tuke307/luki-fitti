import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain
@testable import LukiFittiDesign

/// Runs the cases of `packages/common/src/utils/exercise-search.util.spec.ts` (shared fixture) so
/// the Swift and TypeScript exercise searches stay in sync.
final class ExerciseSearchTests: XCTestCase {
    private struct SearchCase: Decodable {
        var query: String
        var top: Int
        var expect: [String]
        var exclude: [String]?
    }

    private func loadCases() throws -> [SearchCase] {
        let repositoryRoot = (0..<7).reduce(URL(fileURLWithPath: #filePath)) { url, _ in
            url.deletingLastPathComponent()
        }
        let fixture = repositoryRoot
            .appendingPathComponent("packages/common/src/utils/__fixtures__/exercise-search-cases.json")
        guard let data = try? Data(contentsOf: fixture) else {
            throw XCTSkip("shared search fixture not found at \(fixture.path)")
        }
        return try JSONDecoder().decode([SearchCase].self, from: data)
    }

    func testSharedCasesInEveryLanguage() throws {
        let cases = try loadCases()
        XCTAssertFalse(cases.isEmpty)
        for locale in [SupportedLocale.en, .de] {
            let index = ExerciseSearchIndex.catalog(StarterCatalogLoader.load(locale: locale).exercises) {
                [LukiI18n.muscleLabel($0.primaryMuscleGroup), LukiI18n.equipmentLabel($0.equipment)]
            }
            for c in cases {
                let results = index.search(c.query).map(\.exercise.id)
                let top = Array(results.prefix(max(c.top, c.expect.count)))
                for id in c.expect {
                    XCTAssertTrue(top.contains(id), "[\(locale)] \"\(c.query)\": \(id) not in \(results.prefix(8))")
                }
                for id in c.exclude ?? [] {
                    XCTAssertFalse(results.contains(id), "[\(locale)] \"\(c.query)\" matched \(id)")
                }
            }
        }
    }

    func testNormalization() {
        XCTAssertEqual(ExerciseSearchText.fold("Bankdrücken"), "bankdrucken")
        XCTAssertEqual(ExerciseSearchText.fold("Bankdruecken"), "bankdrucken")
        XCTAssertEqual(ExerciseSearchText.tokenAlternatives("Sit-Ups"), [[["situp"]]])
        XCTAssertEqual(ExerciseSearchText.tokenAlternatives("KH"), [[["kh"], ["dumbbell"]]])
        XCTAssertEqual(ExerciseSearchIndex.catalog([]).search("   "), [])
    }
}
