import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

/// Runs the cases of `packages/common/src/utils/exercise-history.util.spec.ts` (shared fixture)
/// so the Swift and TypeScript exercise history logs stay in sync.
final class ExerciseHistoryLogTests: XCTestCase {
    private struct HistoryCase: Decodable {
        struct Session: Decodable {
            var day: Int
            var unit: WeightUnit?
            /// `[setType, weight, reps, durationSeconds]`.
            var sets: [[LoggedValue]]
        }

        struct Expect: Decodable {
            var metric: String
            var sessionDays: [Int]
            var bestEstimated1RM: Double?
            var heaviestSet: [Double]?
            var prDay: Int?
            var trend: [Double]
            var warmupsInNewest: Int
        }

        var name: String
        var exerciseId: String
        var exerciseType: ExerciseType?
        var unit: WeightUnit
        var sessions: [Session]
        var expect: Expect
    }

    private enum LoggedValue: Decodable {
        case text(String)
        case number(Double)
        case none

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if container.decodeNil() {
                self = .none
            } else if let number = try? container.decode(Double.self) {
                self = .number(number)
            } else {
                self = .text(try container.decode(String.self))
            }
        }

        var number: Double? { if case .number(let n) = self { n } else { nil } }
    }

    private let start = Date(timeIntervalSince1970: 1_785_603_600)

    private func loadCases() throws -> [HistoryCase] {
        let repositoryRoot = (0..<7).reduce(URL(fileURLWithPath: #filePath)) { url, _ in
            url.deletingLastPathComponent()
        }
        let fixture = repositoryRoot
            .appendingPathComponent("packages/common/src/utils/__fixtures__/exercise-history-cases.json")
        guard let data = try? Data(contentsOf: fixture) else {
            throw XCTSkip("shared exercise history fixture not found at \(fixture.path)")
        }
        return try JSONDecoder().decode([HistoryCase].self, from: data)
    }

    private func session(
        _ exerciseId: String,
        day: Int,
        sets: [SessionSetDto],
        type: ExerciseType = .STRENGTH
    ) -> WorkoutSessionDto {
        let iso = ISO8601DateFormatter().string(from: start.addingTimeInterval(Double(day) * 86_400))
        return WorkoutSessionDto(
            clientSessionId: "s-\(exerciseId)-\(day)",
            workoutNameSnapshot: "Workout",
            status: .COMPLETED,
            startedAt: iso,
            completedAt: iso,
            exercises: [SessionExerciseDto(
                sessionId: "s",
                exerciseId: exerciseId,
                exerciseNameSnapshot: exerciseId,
                primaryMuscleSnapshot: .CHEST,
                exerciseTypeSnapshot: type,
                orderIndex: 0,
                sets: sets
            )]
        )
    }

    private func day(_ iso: String) -> Int {
        let date = ISO8601DateFormatter().date(from: iso)!
        return Int((date.timeIntervalSince(start) / 86_400).rounded())
    }

    func testSharedCases() throws {
        let cases = try loadCases()
        XCTAssertFalse(cases.isEmpty)
        for c in cases {
            let sessions = c.sessions.map { s in
                session(c.exerciseId, day: s.day, sets: s.sets.enumerated().map { idx, v in
                    guard case .text(let type) = v[0] else { fatalError("set type") }
                    return SessionSetDto(
                        sessionExerciseId: "e",
                        setNumber: idx + 1,
                        setType: SetType(rawValue: type)!,
                        weight: v[1].number,
                        weightUnit: s.unit ?? .KG,
                        reps: v[2].number.map { Int($0) },
                        durationSeconds: v[3].number.map { Int($0) },
                        completed: true
                    )
                }, type: c.exerciseType ?? .STRENGTH)
            }
            let log = ExerciseHistoryLog.build(
                exerciseId: c.exerciseId,
                exerciseType: c.exerciseType ?? .STRENGTH,
                historySessions: sessions,
                weightUnit: c.unit
            )
            XCTAssertEqual(log.metric.rawValue, c.expect.metric, c.name)
            XCTAssertEqual(log.sessions.map { day($0.startedAt) }, c.expect.sessionDays, c.name)
            XCTAssertEqual(log.bestEstimated1RM, c.expect.bestEstimated1RM, c.name)
            XCTAssertEqual(
                log.heaviestSet.map { [$0.weight, Double($0.reps)] },
                c.expect.heaviestSet,
                c.name
            )
            XCTAssertEqual(
                log.sessions.filter(\.isPersonalRecord).map { day($0.startedAt) },
                c.expect.prDay.map { [$0] } ?? [],
                c.name
            )
            XCTAssertEqual(log.trend.map(\.value), c.expect.trend, c.name)
            XCTAssertEqual(log.sessions.first?.sets.filter(\.warmup).count ?? 0, c.expect.warmupsInNewest, c.name)
        }
    }

    func testMatchesSessionsLoggedWithoutAnIdByName() {
        var logged = session("ex-bench", day: 0, sets: [SessionSetDto(sessionExerciseId: "e", setNumber: 1, weight: 60, reps: 8, completed: true)])
        logged.exercises[0].exerciseId = nil
        logged.exercises[0].exerciseNameSnapshot = " Bench Press "
        let other = session("ex-other", day: 1, sets: [SessionSetDto(sessionExerciseId: "e", setNumber: 1, weight: 80, reps: 5, completed: true)])
        let log = ExerciseHistoryLog.build(exerciseId: "ex-bench", exerciseName: "bench press", historySessions: [logged, other])
        XCTAssertEqual(log.sessions.count, 1)
    }
}
