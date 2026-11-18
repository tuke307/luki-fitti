import XCTest
@testable import LukiFittiModels

final class RaidHitMomentTests: XCTestCase {
    func testNotAppliedAddsHitOnTop() {
        let m = RaidBossMath.hitMoment(
            raidDamage: 500, maxHp: 1000, hit: 100, weakBonus: 0, alreadyApplied: false)
        XCTAssertEqual(m.beforeDamage, 500)
        XCTAssertEqual(m.afterDamage, 600)
        XCTAssertEqual(m.hit, 100)
        XCTAssertEqual(m.weakBonus, 0)
    }

    func testAlreadyAppliedSubtractsHit() {
        let m = RaidBossMath.hitMoment(
            raidDamage: 500, maxHp: 1000, hit: 100, weakBonus: 0, alreadyApplied: true)
        XCTAssertEqual(m.beforeDamage, 400)
        XCTAssertEqual(m.afterDamage, 500)
    }

    func testAlreadyAppliedClampsBeforeAtZero() {
        let m = RaidBossMath.hitMoment(
            raidDamage: 50, maxHp: 1000, hit: 100, weakBonus: 0, alreadyApplied: true)
        XCTAssertEqual(m.beforeDamage, 0)
        XCTAssertEqual(m.afterDamage, 50)
    }

    func testAfterClampsAtMaxHp() {
        let m = RaidBossMath.hitMoment(
            raidDamage: 950, maxHp: 1000, hit: 100, weakBonus: 0, alreadyApplied: false)
        XCTAssertEqual(m.beforeDamage, 950)
        XCTAssertEqual(m.afterDamage, 1000)
        XCTAssertTrue(m.finishes)
    }

    func testBeforeClampsAtMaxHp() {
        let m = RaidBossMath.hitMoment(
            raidDamage: 1200, maxHp: 1000, hit: 100, weakBonus: 0, alreadyApplied: false)
        XCTAssertEqual(m.beforeDamage, 1000)
        XCTAssertEqual(m.afterDamage, 1000)
        XCTAssertFalse(m.finishes)
    }

    func testPhaseCrossing() {
        // 200/1000 → 80 % left (phase 0); 300/1000 → 70 % left (phase 1).
        let m = RaidBossMath.hitMoment(
            raidDamage: 200, maxHp: 1000, hit: 100, weakBonus: 0, alreadyApplied: false)
        XCTAssertEqual(m.beforePhase, 0)
        XCTAssertEqual(m.afterPhase, 1)
    }

    func testFinishesOnlyWhenBossWasAliveBefore() {
        let finishing = RaidBossMath.hitMoment(
            raidDamage: 900, maxHp: 1000, hit: 200, weakBonus: 0, alreadyApplied: false)
        XCTAssertTrue(finishing.finishes)

        // Overkill damage already applied: the boss was dead before this hit.
        let overkill = RaidBossMath.hitMoment(
            raidDamage: 1050, maxHp: 1000, hit: 40, weakBonus: 0, alreadyApplied: true)
        XCTAssertEqual(overkill.beforeDamage, 1010)
        XCTAssertEqual(overkill.afterDamage, 1000)
        XCTAssertFalse(overkill.finishes)
    }
}
