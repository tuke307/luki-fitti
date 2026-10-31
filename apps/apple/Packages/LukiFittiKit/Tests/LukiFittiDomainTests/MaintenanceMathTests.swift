import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

/// Same cases as `packages/common/src/utils/maintenance.util.spec.ts`.
final class MaintenanceMathTests: XCTestCase {
    private let calendar = Calendar.current

    private func localDate(_ year: Int, _ month: Int, _ day: Int, hour: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: year, month: month, day: day, hour: hour))!
    }

    /// 28 local days starting 2026-09-01.
    private func window(_ fill: (Int) -> Double? = { _ in nil }) -> [MaintenanceMath.DayInput] {
        (0..<28).map { i in
            let date = calendar.date(byAdding: .day, value: i, to: localDate(2026, 9, 1))!
            return MaintenanceMath.DayInput(
                day: LukiDayKey.string(date, timeZone: calendar.timeZone),
                intakeKcal: fill(i) ?? 2500,
                burnedKcal: 400
            )
        }
    }

    /// Weigh-in every 3 days at 07:00 local, losing `kgPerWeek`.
    private func weighIns(_ kgPerWeek: Double, startKg: Double = 80) -> [WeighInPoint] {
        (0..<10).map { i in
            WeighInPoint(
                date: localDate(2026, 9, 1 + i * 3, hour: 7),
                weightKg: startKg + (kgPerWeek / 7) * Double(i * 3)
            )
        }
    }

    func testFitsALeastSquaresLineThroughNoisyWeighIns() {
        let t0 = Date(timeIntervalSince1970: 0)
        let day = 86_400.0
        let slope = MaintenanceMath.weightSlopeKgPerDay([
            WeighInPoint(date: t0, weightKg: 80.4),
            WeighInPoint(date: t0.addingTimeInterval(day), weightKg: 79.6),
            WeighInPoint(date: t0.addingTimeInterval(2 * day), weightKg: 80.2),
            WeighInPoint(date: t0.addingTimeInterval(3 * day), weightKg: 79.4),
        ])
        // Σ(x−x̄)(y−ȳ) = −1.2, Σ(x−x̄)² = 5
        XCTAssertEqual(slope, -0.24, accuracy: 1e-9)
        XCTAssertEqual(MaintenanceMath.weightSlopeKgPerDay([WeighInPoint(date: t0, weightKg: 80)]), 0)
    }

    func testEqualsIntakeWhenWeightIsStable() throws {
        let est = try XCTUnwrap(MaintenanceMath.estimate(days: window(), weighIns: weighIns(0)))
        XCTAssertEqual(est.totalKcal, 2500)
        XCTAssertEqual(est.baseKcal, 2100)
        XCTAssertEqual(est.avgBurnedKcal, 400)
        XCTAssertEqual(est.loggedDays, 28)
        XCTAssertEqual(est.weighIns, 10)
    }

    func testAddsTheEnergyOfTheWeightLostOnTopOfIntake() throws {
        // −0.5 kg/week → 0.5 × 7700 / 7 = 550 kcal/day deficit
        let est = try XCTUnwrap(MaintenanceMath.estimate(days: window(), weighIns: weighIns(-0.5)))
        XCTAssertEqual(est.totalKcal, 3050)
        XCTAssertEqual(est.baseKcal, 2650)
        XCTAssertEqual(est.weightChangeKgPerWeek, -0.5)
    }

    func testSkipsPartlyLoggedDaysInsteadOfTreatingThemAsLowIntake() throws {
        let days = window { i in i % 4 == 0 ? 600 : i % 4 == 1 ? 0 : nil }
        let est = try XCTUnwrap(MaintenanceMath.estimate(days: days, weighIns: weighIns(0)))
        XCTAssertEqual(est.loggedDays, 14)
        XCTAssertEqual(est.totalKcal, 2500)
    }

    func testNeedsEnoughLoggedDaysAndWeighIns() {
        let sparse = window { i in i < 28 - MaintenanceMath.Rules.minLoggedDays + 1 ? 0 : nil }
        XCTAssertNil(MaintenanceMath.estimate(days: sparse, weighIns: weighIns(0)))
        XCTAssertNil(MaintenanceMath.estimate(days: window(), weighIns: Array(weighIns(0).prefix(3))))
        // Four weigh-ins within 9 days: span too short.
        XCTAssertNil(MaintenanceMath.estimate(days: window(), weighIns: Array(weighIns(0).prefix(4))))
        XCTAssertNil(MaintenanceMath.estimate(days: [], weighIns: weighIns(0)))
    }

    func testIgnoresWeighInsOutsideTheWindow() {
        let outside = [WeighInPoint(date: localDate(2026, 8, 1, hour: 7), weightKg: 95)]
            + weighIns(0)
            + [WeighInPoint(date: localDate(2026, 10, 15, hour: 7), weightKg: 60)]
        XCTAssertEqual(MaintenanceMath.estimate(days: window(), weighIns: outside)?.totalKcal, 2500)
    }

    func testDiscardsImplausibleResults() {
        // Logging ~1000 kcal while weight is stable means meals are missing.
        XCTAssertNil(MaintenanceMath.estimate(days: window { _ in 1000 }, weighIns: weighIns(0)))
    }

    func testWindowDayKeysEndYesterday() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "Europe/Berlin")!
        let now = cal.date(from: DateComponents(year: 2026, month: 10, day: 3, hour: 9))!
        let keys = MaintenanceMath.windowDayKeys(endingBefore: now, calendar: cal)
        XCTAssertEqual(keys.count, 28)
        XCTAssertEqual(keys.first, "2026-09-05")
        XCTAssertEqual(keys.last, "2026-10-02")
    }
}
