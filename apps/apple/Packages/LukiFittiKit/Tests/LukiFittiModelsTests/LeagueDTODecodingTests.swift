import XCTest
@testable import LukiFittiModels

/// Decodes the league/points DTOs from real API responses captured against the local
/// `luki_fitti_social` database (fixtures in `Fixtures/`). Guards against silent decode
/// regressions — a mismatch here is what left `league`/`pointsWeek` nil with the old `try?`.
final class LeagueDTODecodingTests: XCTestCase {
    private struct Envelope<T: Decodable>: Decodable {
        let data: T
    }

    private func decode<T: Decodable>(_ type: T.Type, fixture name: String) throws -> T {
        let fixture = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("Fixtures/\(name).json")
        let data = try Data(contentsOf: fixture)
        return try JSONDecoder().decode(Envelope<T>.self, from: data).data
    }

    func testLeagueCurrentFriendsStage() throws {
        let dto = try decode(LeagueCurrentDto.self, fixture: "current-friends")
        XCTAssertEqual(dto.stage, .FRIENDS)
        XCTAssertEqual(dto.arena, .BRONZE)
        XCTAssertNil(dto.cohort)
        XCTAssertNil(dto.pendingResult)
    }

    func testLeagueCurrentGlobalWithCohort() throws {
        let dto = try decode(LeagueCurrentDto.self, fixture: "current-global")
        XCTAssertEqual(dto.stage, .GLOBAL)
        let cohort = try XCTUnwrap(dto.cohort)
        XCTAssertEqual(cohort.members.count, 3)
        XCTAssertEqual(cohort.members.first?.zone, .SAFE)
        XCTAssertTrue(cohort.members.contains { $0.isSelf && $0.rank == 1 })
        XCTAssertNil(dto.pendingResult)
    }

    func testLeagueCurrentArenasStage() throws {
        let dto = try decode(LeagueCurrentDto.self, fixture: "current-arenas")
        XCTAssertEqual(dto.stage, .ARENAS)
        XCTAssertNotNil(dto.cohort)
    }

    func testPendingResultEachOutcome() throws {
        let promoted = try decode(LeagueCurrentDto.self, fixture: "pending-promoted").pendingResult
        XCTAssertEqual(promoted?.outcome, .PROMOTED)
        XCTAssertEqual(promoted?.toArena, .SILVER)
        XCTAssertEqual(promoted?.rank, 2)
        XCTAssertEqual(promoted?.points, 1240)

        let demoted = try decode(LeagueCurrentDto.self, fixture: "pending-demoted").pendingResult
        XCTAssertEqual(demoted?.outcome, .DEMOTED)

        let stayed = try decode(LeagueCurrentDto.self, fixture: "pending-stayed").pendingResult
        XCTAssertEqual(stayed?.outcome, .STAYED)
    }

    func testPointsWeek() throws {
        let dto = try decode(PointsWeekDto.self, fixture: "points-week")
        XCTAssertEqual(dto.points, 420)
        XCTAssertEqual(dto.dailyCap, 600)
        XCTAssertEqual(dto.days.count, 1)
        XCTAssertEqual(dto.sessions.first?.breakdown.sets, 3)
        XCTAssertEqual(dto.goal.target, 4)
        XCTAssertEqual(dto.goal.available, 100)
    }

    func testPointsWeekEmptyDays() throws {
        let dto = try decode(PointsWeekDto.self, fixture: "points-week-empty")
        XCTAssertEqual(dto.points, 0)
        XCTAssertTrue(dto.days.isEmpty)
        XCTAssertTrue(dto.sessions.isEmpty)
        XCTAssertEqual(dto.goal.done, 0)
    }

    func testLeagueFriends() throws {
        struct Resp: Decodable { let entries: [LeagueFriendRowDto] }
        let dto = try decode(Resp.self, fixture: "friends")
        XCTAssertEqual(dto.entries.count, 1)
        XCTAssertTrue(dto.entries[0].isSelf)
        XCTAssertEqual(dto.entries[0].card.handle, "iossocial")
    }
}
