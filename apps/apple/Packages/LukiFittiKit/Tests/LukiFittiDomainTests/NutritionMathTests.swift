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
