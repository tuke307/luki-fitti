import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain

/// Same cases as `packages/common/src/utils/{energy,nutrition}.util.spec.ts`.
final class NutritionMathTests: XCTestCase {
    func testSumRoundsAndIgnoresInvalidValues() {
        let totals = NutritionMath.sum([
            MealItemDto(name: "a", kcal: 120.4, proteinG: 10.04, carbsG: 5, fatG: 1.11),
            MealItemDto(name: "b", kcal: 300, proteinG: 2, carbsG: 50.05, fatG: 8),
            MealItemDto(name: "c", kcal: -50, proteinG: .nan, carbsG: 0, fatG: .infinity),
        ])
        XCTAssertEqual(totals, NutritionTotalsDto(kcal: 420, proteinG: 12, carbsG: 55.1, fatG: 9.1))
    }

    func testScaleRescalesFromThePortion() {
        let item = MealItemDto(name: "rice", grams: 150, kcal: 195, proteinG: 4, carbsG: 42, fatG: 0.4, fiberG: 0.6)
        let scaled = NutritionMath.scale(item, toGrams: 200)
        XCTAssertEqual(scaled.kcal, 260)
        XCTAssertEqual(scaled.proteinG, 5.3)
        XCTAssertEqual(scaled.carbsG, 56)
        XCTAssertEqual(scaled.fiberG, 0.8)
    }

    func testScaleWithinUnitAndRelabelAcrossUnits() {
        let tea = MealItemDto(name: "tea", grams: 500, amountUnit: .ML, kcal: 140, carbsG: 34)
        let half = NutritionMath.scale(tea, toAmount: 250, unit: .ML)
        XCTAssertEqual(half.kcal, 70)
        XCTAssertEqual(half.carbsG, 17)
        XCTAssertEqual(half.amountUnit, .ML)
        let relabeled = NutritionMath.scale(tea, toAmount: 500, unit: .G)
        XCTAssertEqual(relabeled.kcal, 140)
        XCTAssertEqual(relabeled.amountUnit, .G)
    }

    func testLitresAreStoredAsMillilitres() {
        let stored = NutritionMath.storedAmount(1.5, .l)
        XCTAssertEqual(stored.amount, 1500)
        XCTAssertEqual(stored.unit, .ML)
        XCTAssertEqual(NutritionMath.storedAmount(80, .g).unit, .G)
        XCTAssertEqual(NutritionMath.displayAmount(1500, .ML).unit, .l)
        XCTAssertEqual(NutritionMath.displayAmount(500, .ML).unit, .ml)
    }

    func testFormatAmountIsLocaleAware() {
        XCTAssertEqual(NutritionMath.formatAmount(500, .ML, locale: Locale(identifier: "en_US")), "500 ml")
        XCTAssertEqual(NutritionMath.formatAmount(1500, .ML, locale: Locale(identifier: "de_DE")), "1,5 l")
        XCTAssertEqual(NutritionMath.formatAmount(150, .G, locale: Locale(identifier: "en_US")), "150 g")
        XCTAssertEqual(NutritionMath.formatAmount(nil, .G), "")
    }

    func testLegacyItemJSONDecodesAsGrams() throws {
        let json = #"{"id":"i","orderIndex":0,"name":"Rice","grams":150,"kcal":200,"proteinG":4,"carbsG":44,"fatG":1,"fiberG":null,"sugarG":null,"source":"MANUAL","confidence":null}"#
        let item = try JSONDecoder().decode(MealItemDto.self, from: Data(json.utf8))
        XCTAssertEqual(item.amountUnit, .G)
        let input = try JSONDecoder().decode(MealItemInputDto.self, from: Data(#"{"name":"Tea","grams":500,"amountUnit":"ML","kcal":140,"proteinG":0,"carbsG":34,"fatG":0,"source":"AI"}"#.utf8))
        XCTAssertEqual(input.amountUnit, .ML)
    }

    func testBurnPrefersServerThenHealthKitThenMet() {
        var session = WorkoutSessionDto(workoutNameSnapshot: "Push", status: .COMPLETED, activeDurationSeconds: 3600)
        XCTAssertEqual(NutritionMath.burnedKcal(for: session, bodyWeightKg: 80), 200) // (3.5 − 1) × 80 × 1 h
        XCTAssertEqual(NutritionMath.burnedKcal(for: session, bodyWeightKg: nil), Int((2.5 * 75).rounded()))
        session.activeCaloriesKcal = 412.6
        XCTAssertEqual(NutritionMath.burnedKcal(for: session, bodyWeightKg: 80), 413)
        session.estimatedCaloriesKcal = 300
        XCTAssertEqual(NutritionMath.burnedKcal(for: session, bodyWeightKg: 80), 300)
    }

    func testStrengthMetIsClamped() {
        XCTAssertEqual(NutritionMath.strengthMet(setsPerMinute: 0), 3.5)
        XCTAssertEqual(NutritionMath.strengthMet(setsPerMinute: 5), 6.0)
    }

    func testSuggestedDailyKcal() {
        let now = ISO8601DateFormatter().date(from: "2026-06-01T00:00:00Z")!
        XCTAssertEqual(
            NutritionMath.suggestedDailyKcal(bodyWeightKg: 80, heightCm: 180, birthYear: 1996, sex: "male", now: now),
            2490
        )
        XCTAssertNil(NutritionMath.suggestedDailyKcal(bodyWeightKg: 80, heightCm: nil, birthYear: 1996, sex: "male"))
    }

    func testMealTypeForTime() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let at = { (h: Int) in cal.date(from: DateComponents(year: 2026, month: 1, day: 1, hour: h))! }
        XCTAssertEqual(MealType.forTime(at(7), calendar: cal), .BREAKFAST)
        XCTAssertEqual(MealType.forTime(at(12), calendar: cal), .LUNCH)
        XCTAssertEqual(MealType.forTime(at(19), calendar: cal), .DINNER)
    }
}
