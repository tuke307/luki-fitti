import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

/// Same cases as `packages/common/src/utils/body-weight.util.spec.ts`.
final class BodyWeightMathTests: XCTestCase {
    private func d(_ iso: String) -> Date { LukiISODate.parse(iso)! }
    private func p(_ iso: String, _ kg: Double) -> WeighInPoint { WeighInPoint(date: d(iso), weightKg: kg) }

    private var points: [WeighInPoint] {
        [p("2026-10-01T07:00:00Z", 82), p("2026-10-15T07:00:00Z", 80), p("2026-10-08T07:00:00Z", 81)]
    }

    func testWeightAtUsesLatestOnOrBeforeDate() {
        XCTAssertEqual(BodyWeightMath.weightAt(points, date: d("2026-10-10T18:00:00Z")), 81)
        XCTAssertEqual(BodyWeightMath.weightAt(points, date: d("2026-10-15T07:00:00Z")), 80)
        XCTAssertEqual(BodyWeightMath.weightAt(points, date: d("2026-12-01T00:00:00Z")), 80)
    }

    func testWeightAtFallsBackToEarliestThenNil() {
        XCTAssertEqual(BodyWeightMath.weightAt(points, date: d("2026-09-01T00:00:00Z")), 82)
        XCTAssertNil(BodyWeightMath.weightAt([], date: Date()))
    }

    func testEstimateWeightFallsBackToProfileValue() {
        XCTAssertEqual(BodyWeightMath.estimateWeightKg(points, at: d("2026-10-10T00:00:00Z"), fallbackKg: 70), 81)
        XCTAssertEqual(BodyWeightMath.estimateWeightKg(points, at: d("2026-01-01T00:00:00Z"), fallbackKg: 70), 82)
        XCTAssertEqual(BodyWeightMath.estimateWeightKg([], at: Date(), fallbackKg: 70), 70)
        XCTAssertNil(BodyWeightMath.estimateWeightKg([], at: Date(), fallbackKg: nil))
    }

    func testBurnUsesWeightAtEachSessionDate() {
        let session = WorkoutSessionDto(workoutNameSnapshot: "Push", status: .COMPLETED, activeDurationSeconds: 3600)
        let early = BodyWeightMath.estimateWeightKg(points, at: d("2026-10-02T10:00:00Z"), fallbackKg: nil)
        let late = BodyWeightMath.estimateWeightKg(points, at: d("2026-10-16T10:00:00Z"), fallbackKg: nil)
        XCTAssertEqual(NutritionMath.burnedKcal(for: session, bodyWeightKg: early), 205) // 2.5 × 82
        XCTAssertEqual(NutritionMath.burnedKcal(for: session, bodyWeightKg: late), 200) // 2.5 × 80
    }

    func testLatestAndHasWeighInSince() {
        XCTAssertEqual(BodyWeightMath.latest(points)?.weightKg, 80)
        XCTAssertNil(BodyWeightMath.latest([]))
        XCTAssertTrue(BodyWeightMath.hasWeighIn(points, since: d("2026-10-12T00:00:00Z")))
        XCTAssertFalse(BodyWeightMath.hasWeighIn(points, since: d("2026-10-19T00:00:00Z")))
    }

    func testMovingAverageOverTrailingWindow() {
        let avg = BodyWeightMath.movingAverage(
            [p("2026-10-01T07:00:00Z", 80), p("2026-10-03T07:00:00Z", 82), p("2026-10-20T07:00:00Z", 78)],
            windowDays: 7
        )
        XCTAssertEqual(avg.map(\.averageKg), [80, 81, 78])
    }

    func testTrend() {
        let trend = BodyWeightMath.trend(points, now: d("2026-10-17T07:00:00Z"))
        XCTAssertEqual(trend.latestKg, 80)
        XCTAssertEqual(trend.change7dKg, -1)
        XCTAssertNil(trend.change30dKg)
        XCTAssertEqual(trend.daysSinceLast, 2)
        XCTAssertEqual(BodyWeightMath.trend([]), WeightTrend())
    }

    func testUnitConversionAndParsing() {
        XCTAssertEqual(BodyWeightMath.lbsToKg(BodyWeightMath.kgToLbs(80)), 80, accuracy: 1e-9)
        XCTAssertEqual(BodyWeightMath.kgToLbs(1), 2.20462, accuracy: 1e-4)
        XCTAssertEqual(BodyWeightMath.parseInput("72,5", unit: .KG), 72.5)
        XCTAssertEqual(BodyWeightMath.parseInput(" 72.5 kg", unit: .KG), 72.5)
        XCTAssertEqual(BodyWeightMath.parseInput("160", unit: .LBS)!, 72.57, accuracy: 0.01)
        XCTAssertNil(BodyWeightMath.parseInput("12", unit: .KG))
        XCTAssertNil(BodyWeightMath.parseInput("abc", unit: .KG))
        XCTAssertNil(BodyWeightMath.parseInput("900", unit: .LBS))
    }

    func testEntriesBecomeSortedPoints() {
        let entries = [
            BodyWeightEntryDto(id: "b", clientEntryId: "weight-b", measuredAt: "2026-10-08T07:00:00Z", weightKg: 81),
            BodyWeightEntryDto(id: "a", clientEntryId: "weight-a", measuredAt: "2026-10-01T07:00:00.000Z", weightKg: 82),
        ]
        XCTAssertEqual(BodyWeightMath.points(entries).map(\.weightKg), [82, 81])
    }

    func testPreferencesDecodeReminderDefaults() throws {
        let prefs = try JSONDecoder().decode(UserPreferencesDto.self, from: Data("{}".utf8))
        XCTAssertFalse(prefs.weighInReminderEnabled)
        XCTAssertEqual(prefs.weighInReminderWeekday, 2)
        XCTAssertEqual(prefs.weighInReminderMinutes, 450)
        let custom = try JSONDecoder().decode(
            UserPreferencesDto.self,
            from: Data(#"{"weighInReminderEnabled":true,"weighInReminderWeekday":7,"weighInReminderMinutes":600}"#.utf8)
        )
        XCTAssertTrue(custom.weighInReminderEnabled)
        XCTAssertEqual(custom.weighInReminderWeekday, 7)
        XCTAssertEqual(custom.weighInReminderMinutes, 600)
    }

    func testEntryDecodesServerShape() throws {
        let json = #"""
        {"id":"e1","clientEntryId":"weight-1234","measuredAt":"2026-10-01T07:00:00.000Z","weightKg":80.4,
         "source":"HEALTHKIT","healthKitUuid":"abcd-1234","note":null,
         "createdAt":"2026-10-01T07:00:01.000Z","updatedAt":"2026-10-01T07:00:01.000Z"}
        """#
        let entry = try JSONDecoder().decode(BodyWeightEntryDto.self, from: Data(json.utf8))
        XCTAssertEqual(entry.source, .HEALTHKIT)
        XCTAssertEqual(entry.healthKitUuid, "abcd-1234")
        XCTAssertNil(entry.note)
        XCTAssertNotNil(entry.measuredAtDate)
    }
}
