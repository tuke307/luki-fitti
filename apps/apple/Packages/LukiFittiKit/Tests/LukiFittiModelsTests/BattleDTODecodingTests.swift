import XCTest
@testable import LukiFittiModels

/// Decodes the duel/streak/trophy DTOs from real API responses captured against the local
/// `luki_fitti_social` database (fixtures in `Fixtures/`). Same intent as the league tests:
/// a silent decode mismatch here would hide the whole duels section.
final class BattleDTODecodingTests: XCTestCase {
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

    func testDuelListActiveAndRecent() throws {
        let dto = try decode(DuelListDto.self, fixture: "duels-list-active")
        let active = try XCTUnwrap(dto.active.first)
        XCTAssertEqual(active.status, .ACTIVE)
        XCTAssertEqual(active.opponent.handle, "shotbob_mwflew0b")
        XCTAssertEqual(active.daysLeft, 8)
        XCTAssertNil(active.outcome)
        XCTAssertEqual(active.startDayKey, "2026-11-15")
        XCTAssertEqual(active.endDayKey, "2026-11-22")

        let recent = try XCTUnwrap(dto.recent.first)
        XCTAssertEqual(recent.status, .COMPLETED)
        XCTAssertEqual(recent.outcome, .WON)
        XCTAssertEqual(recent.you, 340)
        XCTAssertEqual(recent.them, 280)
        // The completed duel was still unseen when the fixture was captured.
        let pending = try XCTUnwrap(dto.pendingResult)
        XCTAssertEqual(pending.id, recent.id)
        XCTAssertEqual(pending.outcome, .WON)
        XCTAssertNil(pending.seenAt)
    }

    func testDuelDetailDays() throws {
        let dto = try decode(DuelDetailDto.self, fixture: "duel-detail")
        XCTAssertEqual(dto.status, .ACTIVE)
        XCTAssertFalse(dto.days.isEmpty)
        let day = dto.days[0]
        XCTAssertEqual(day.dayKey, "2026-11-15")
    }

    func testDuelListPendingResultLost() throws {
        let dto = try decode(DuelListDto.self, fixture: "duels-pending-result")
        let pending = try XCTUnwrap(dto.pendingResult)
        XCTAssertEqual(pending.outcome, .LOST)
        XCTAssertEqual(pending.opponent.handle, "shotanna_mwflew0b")
        XCTAssertEqual(pending.you, 280)
        XCTAssertEqual(pending.them, 340)
        XCTAssertNil(pending.seenAt)
    }

    func testStreakListActive() throws {
        let dto = try decode(StreakListDto.self, fixture: "streaks-list")
        let streak = try XCTUnwrap(dto.active.first)
        XCTAssertEqual(streak.status, .ACTIVE)
        XCTAssertEqual(streak.count, 5)
        XCTAssertEqual(streak.freezes, 1)
        XCTAssertEqual(streak.friend.handle, "shotbob_mwflew0b")
        XCTAssertEqual(streak.thisWeek.you.target, 4)
    }

    func testTrophyList() throws {
        let dto = try decode(TrophyListDto.self, fixture: "trophies")
        XCTAssertEqual(dto.items.first?.kind, .DUEL_WIN)
        XCTAssertEqual(dto.counts["DUEL_WIN"], 1)
    }

    func testWatchSnapshotRoundTripsWithDuel() throws {
        let snapshot = SocialWatchSnapshot(
            weekPoints: 340,
            arena: .GOLD,
            rank: 4,
            cohortSize: 20,
            stage: .GLOBAL,
            duel: DuelWatchSnapshot(opponentHandle: "anna", you: 340, them: 280, daysLeft: 3)
        )
        let data = try JSONEncoder().encode(snapshot)
        // Stays comfortably under the ~1 KB context budget.
        XCTAssertLessThan(data.count, 400)
        let back = try JSONDecoder().decode(SocialWatchSnapshot.self, from: data)
        XCTAssertEqual(back.duel?.opponentHandle, "anna")
        XCTAssertEqual(back.duel?.daysLeft, 3)
    }
}
