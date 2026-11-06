import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

/// Runs the cases of `packages/common/src/utils/history-insights.util.spec.ts` (shared fixture)
/// so the Swift and TypeScript muscle shares and personal bests stay in sync.
final class HistoryInsightsTests: XCTestCase {
    private enum Value: Decodable, Equatable {
        case text(String)
        case number(Double)
        case bool(Bool)
        case none

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if container.decodeNil() {
                self = .none
            } else if let bool = try? container.decode(Bool.self) {
                self = .bool(bool)
            } else if let number = try? container.decode(Double.self) {
                self = .number(number)
            } else {
                self = .text(try container.decode(String.self))
            }
        }

        var number: Double? { if case .number(let n) = self { n } else { nil } }
        var text: String? { if case .text(let t) = self { t } else { nil } }
    }

    private struct InsightsCase: Decodable {
        struct Filter: Decodable {
            var muscle: MuscleGroup?
            var exerciseId: String?
        }

        struct Session: Decodable {
            struct Exercise: Decodable {
                var id: String
                var name: String
                var muscle: MuscleGroup
                var type: ExerciseType?
                /// `[setType, weight, reps, completed]`.
                var sets: [[Value]]
            }

            var day: Int
            var unit: WeightUnit?
            var exercises: [Exercise]
        }

        struct Expect: Decodable {
            var muscles: [[Value]]
            var bests: [[Value]]
        }

        var name: String
        var filter: Filter?
        var sessions: [Session]
        var expect: Expect
    }

    private let start = Date(timeIntervalSince1970: 1_785_603_600)

    private func loadCases() throws -> [InsightsCase] {
        let repositoryRoot = (0..<7).reduce(URL(fileURLWithPath: #filePath)) { url, _ in
            url.deletingLastPathComponent()
        }
        let fixture = repositoryRoot
            .appendingPathComponent("packages/common/src/utils/__fixtures__/history-insights-cases.json")
        guard let data = try? Data(contentsOf: fixture) else {
            throw XCTSkip("shared history insights fixture not found at \(fixture.path)")
        }
        return try JSONDecoder().decode([InsightsCase].self, from: data)
    }

    private func session(_ s: InsightsCase.Session) -> WorkoutSessionDto {
        let iso = ISO8601DateFormatter().string(from: start.addingTimeInterval(Double(s.day) * 86_400))
        return WorkoutSessionDto(
            clientSessionId: "s-\(s.day)",
            workoutNameSnapshot: "Workout",
            status: .COMPLETED,
            startedAt: iso,
            completedAt: iso,
            exercises: s.exercises.enumerated().map { idx, e in
                SessionExerciseDto(
                    sessionId: "s",
                    exerciseId: e.id,
                    exerciseNameSnapshot: e.name,
                    primaryMuscleSnapshot: e.muscle,
                    exerciseTypeSnapshot: e.type ?? .STRENGTH,
                    orderIndex: idx,
                    sets: e.sets.enumerated().map { n, v in
                        SessionSetDto(
                            sessionExerciseId: "e",
                            setNumber: n + 1,
                            setType: SetType(rawValue: v[0].text!)!,
                            weight: v[1].number,
                            weightUnit: s.unit ?? .KG,
                            reps: v[2].number.map { Int($0) },
                            completed: v[3] == .bool(true)
                        )
                    }
                )
            }
        )
    }

    private func day(_ iso: String) -> Double {
        let date = ISO8601DateFormatter().date(from: iso)!
        return (date.timeIntervalSince(start) / 86_400).rounded()
    }

    func testSharedCases() throws {
        let cases = try loadCases()
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            // Newest first, like the history list.
            let insights = HistoryInsights(
                sessions: c.sessions.map(session).reversed(),
                muscle: c.filter?.muscle,
                exerciseId: c.filter?.exerciseId
            )
            XCTAssertEqual(
                insights.muscles.map { [Value.text($0.muscle.rawValue), .number(Double($0.sets)), .number(Double($0.volumeKg)), .number(Double($0.pct))] },
                c.expect.muscles,
                c.name
            )
            XCTAssertEqual(
                insights.personalBests.map {
                    [Value.text($0.key), .text($0.exerciseName), .text($0.muscle.rawValue), .number($0.maxWeightKg),
                     .number(Double($0.reps)), .number($0.est1RM), .number(day($0.startedAt))]
                },
                c.expect.bests,
                c.name
            )
        }
    }
}
