import XCTest
@testable import LukiFittiDomain

/// Runs every case of `packages/common/src/utils/__fixtures__/effort-points-cases.json`
/// so the Swift EP mirror stays in lockstep with the TypeScript formula.
final class EffortPointsTests: XCTestCase {
    private struct FixtureCase: Decodable {
        struct Session: Decodable {
            struct Exercise: Decodable {
                struct Set: Decodable {
                    var setType: String
                    var completed: Bool
                    var completedAt: String?
                    var isPersonalRecord: Bool
                    var durationSeconds: Int?
                }
                var exerciseTypeSnapshot: String
                var sets: [Set]
            }
            var status: String
            var sessionType: String
            var sourceDevice: String?
            var activeDurationSeconds: Int
            var totalStretchSeconds: Int
            var completedAt: String?
            var exercises: [Exercise]
        }
        struct Expected: Decodable {
            struct Breakdown: Decodable {
                var sets: Int
                var warmups: Int
                var prs: Int
                var cardioMinutes: Int
                var stretchMinutes: Int
                var finishBonus: Int
                var droppedSets: Int
            }
            var total: Int
            var breakdown: Breakdown
            // Raid weak-spot attribution arrives with the Swift mirror in a later part.
            var pointsByWeakSpot: [String: Int]?
        }
        var name: String
        var session: Session
        var expected: Expected
    }

    private func loadCases() throws -> [FixtureCase] {
        let repositoryRoot = (0..<7).reduce(URL(fileURLWithPath: #filePath)) { url, _ in
            url.deletingLastPathComponent()
        }
        let fixture = repositoryRoot
            .appendingPathComponent("packages/common/src/utils/__fixtures__/effort-points-cases.json")
        guard let data = try? Data(contentsOf: fixture) else {
            throw XCTSkip("shared effort-points fixture not found at \(fixture.path)")
        }
        return try JSONDecoder().decode([FixtureCase].self, from: data)
    }

    func testSharedFixtureCases() throws {
        let cases = try loadCases()
        XCTAssertEqual(cases.count, 20, "fixture should cover 20 cases")
        for c in cases {
            let input = EffortPoints.SessionInput(
                status: c.session.status,
                sessionType: c.session.sessionType,
                sourceDevice: c.session.sourceDevice,
                activeDurationSeconds: c.session.activeDurationSeconds,
                totalStretchSeconds: c.session.totalStretchSeconds,
                exercises: c.session.exercises.map {
                    EffortPoints.ExerciseInput(
                        exerciseTypeSnapshot: $0.exerciseTypeSnapshot,
                        sets: $0.sets.map {
                            EffortPoints.SetInput(
                                setType: $0.setType,
                                completed: $0.completed,
                                completedAt: $0.completedAt,
                                isPersonalRecord: $0.isPersonalRecord,
                                durationSeconds: $0.durationSeconds
                            )
                        }
                    )
                }
            )
            let result = EffortPoints.compute(session: input)
            XCTAssertEqual(result.total, c.expected.total, "total mismatch in '\(c.name)'")
            let b = result.breakdown
            let e = c.expected.breakdown
            XCTAssertEqual(b.sets, e.sets, "sets mismatch in '\(c.name)'")
            XCTAssertEqual(b.warmups, e.warmups, "warmups mismatch in '\(c.name)'")
            XCTAssertEqual(b.prs, e.prs, "prs mismatch in '\(c.name)'")
            XCTAssertEqual(b.cardioMinutes, e.cardioMinutes, "cardioMinutes mismatch in '\(c.name)'")
            XCTAssertEqual(b.stretchMinutes, e.stretchMinutes, "stretchMinutes mismatch in '\(c.name)'")
            XCTAssertEqual(b.finishBonus, e.finishBonus, "finishBonus mismatch in '\(c.name)'")
            XCTAssertEqual(b.droppedSets, e.droppedSets, "droppedSets mismatch in '\(c.name)'")
        }
    }
}
