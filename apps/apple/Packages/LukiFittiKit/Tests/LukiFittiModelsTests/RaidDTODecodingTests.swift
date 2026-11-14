import XCTest
@testable import LukiFittiModels

/// Decodes the raid/squad DTOs from real API responses captured against the local
/// `luki_fitti_social` database (fixtures in `Fixtures/`). Same intent as the duel
/// tests: a silent decode mismatch here would hide the whole raids section.
final class RaidDTODecodingTests: XCTestCase {
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

    func testRaidsCurrent() throws {
        let list = try decode(RaidListDto.self, fixture: "raids-current")
        let community = try XCTUnwrap(list.community)
        XCTAssertEqual(community.kind, .COMMUNITY)
        XCTAssertEqual(community.bossSlug, "core-kraken")
        XCTAssertEqual(community.maxHp, 2000)
        XCTAssertEqual(community.yourDamage, 1300)
        XCTAssertEqual(community.status, .ACTIVE)
        XCTAssertTrue(list.pendingResults.isEmpty)
        XCTAssertGreaterThanOrEqual(community.effectivePhase, community.phase)
    }

    func testRaidDetail() throws {
        let detail = try decode(RaidDetailDto.self, fixture: "raid-detail")
        XCTAssertFalse(detail.top.isEmpty)
        XCTAssertEqual(detail.top.first?.rank, 1)
        XCTAssertEqual(detail.you.damage, 1300)
        XCTAssertEqual(detail.you.rank, 2) // tied at 1,300 with the seeded shot user
    }

    func testRaidFeed() throws {
        let feed = try decode(RaidFeedDto.self, fixture: "raid-feed")
        XCTAssertFalse(feed.items.isEmpty)
        let own = try XCTUnwrap(feed.items.first { $0.card.handle.hasPrefix("fx_raider") })
        XCTAssertEqual(own.damage, 1300)
        XCTAssertEqual(own.weakSpotDamage, 650)
        XCTAssertEqual(own.topExercise, "Plank")
        // Strangers' hits decode with workout content stripped.
        XCTAssertTrue(feed.items.contains { $0.topExercise == nil })
    }

    func testRaidBosses() throws {
        let bosses = try decode([RaidBossDto].self, fixture: "raid-bosses")
        XCTAssertEqual(bosses.count, 8)
        let kraken = try XCTUnwrap(bosses.first { $0.slug == "core-kraken" })
        XCTAssertFalse(kraken.weakTo.isEmpty)
        XCTAssertEqual(kraken.name.en, RaidBossCatalog.boss(slug: "core-kraken")?.name.en)
    }

    func testSquadsList() throws {
        let list = try decode(SquadListDto.self, fixture: "squads-list")
        let squad = try XCTUnwrap(list.squads.first)
        XCTAssertEqual(squad.name, "FX Squad")
        XCTAssertEqual(squad.role, .OWNER)
        XCTAssertEqual(squad.members.count, 1)
        XCTAssertTrue(list.invites.isEmpty)
    }

    func testWatchSnapshotRaidRoundTrip() throws {
        let snap = SocialWatchSnapshot(
            weekPoints: 340,
            arena: .GOLD,
            rank: 4,
            cohortSize: 20,
            stage: .GLOBAL,
            raid: RaidWatchSnapshot(bossSlug: "core-kraken", hpFraction: 0.05, phase: 3, endsAt: "2026-11-15T23:00:00.000Z")
        )
        let data = try JSONEncoder().encode(snap)
        XCTAssertLessThan(data.count, 1024, "watch snapshot must stay tiny")
        let back = try JSONDecoder().decode(SocialWatchSnapshot.self, from: data)
        XCTAssertEqual(back.raid?.bossSlug, "core-kraken")
        XCTAssertEqual(back.raid?.phase, 3)
    }
}
