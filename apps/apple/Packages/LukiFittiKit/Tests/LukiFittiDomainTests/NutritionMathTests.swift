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

    func testMealTextAnalysisResponseDecodesIntoDrafts() throws {
        let json = #"""
        {"runId":"r1","items":[{"name":"Müsli","grams":100,"amountUnit":"G","kcal":380,"proteinG":10,"carbsG":62,"fatG":7,"fiberG":8,"sugarG":null,"source":"AI","confidence":0.85},{"name":"Haferdrink","grams":150,"amountUnit":"ML","kcal":70,"proteinG":0.5,"carbsG":10,"fatG":2.2,"fiberG":null,"sugarG":6,"source":"AI","confidence":0.5}],"analysis":{"items":[],"containsFood":true,"mealTypeGuess":"BREAKFAST","uncertaintyNote":"Menge geschätzt."},"usage":{"promptTokens":10,"completionTokens":5,"costUsd":null}}
        """#
        let res = try JSONDecoder().decode(MealTextAnalysisResponseDto.self, from: Data(json.utf8))
        XCTAssertEqual(res.analysis.mealTypeGuess, .BREAKFAST)
        let drafts = res.items.map { MealItemDto($0) }
        XCTAssertEqual(drafts.map(\.name), ["Müsli", "Haferdrink"])
        XCTAssertEqual(drafts[1].amountUnit, .ML)
        XCTAssertEqual(drafts[1].source, .AI)
        XCTAssertNotEqual(drafts[0].id, drafts[1].id)

        let noGuess = try JSONDecoder().decode(
            MealAnalysisSummaryDto.self,
            from: Data(#"{"containsFood":false,"uncertaintyNote":"","mealTypeGuess":null}"#.utf8)
        )
        XCTAssertNil(noGuess.mealTypeGuess)
    }

    func testHistoryPicksDecodeInServerOrder() throws {
        let json = #"""
        {"entries":[{"key":"e1","label":null,"mealType":"BREAKFAST","items":[{"id":"i1","orderIndex":0,"name":"Oats","grams":60,"amountUnit":"G","kcal":228,"proteinG":8,"carbsG":40,"fatG":4,"source":"MANUAL"},{"id":"i2","orderIndex":1,"name":"Milk","grams":200,"amountUnit":"ML","kcal":130,"proteinG":7,"carbsG":10,"fatG":7,"source":"AI","confidence":0.7}],"totals":{"kcal":358,"proteinG":15,"carbsG":50,"fatG":11},"timesLogged":5,"lastLoggedAt":"2025-06-01T07:30:00.000Z"},{"key":"e2","label":"Pasta night","mealType":"DINNER","items":[],"totals":{"kcal":0,"proteinG":0,"carbsG":0,"fatG":0},"timesLogged":1,"lastLoggedAt":"2025-05-20T19:00:00Z"}],
         "items":[{"item":{"id":"i3","name":"Banana","grams":120,"kcal":107,"proteinG":1.3,"carbsG":27,"fatG":0.4,"source":"MANUAL"},"timesLogged":9,"lastLoggedAt":"2025-06-02T10:00:00Z"}]}
        """#
        let picks = try JSONDecoder().decode(NutritionHistoryPicksDto.self, from: Data(json.utf8))
        XCTAssertEqual(picks.entries.map(\.id), ["e1", "e2"])
        XCTAssertNil(picks.entries[0].label)
        XCTAssertEqual(picks.entries[1].label, "Pasta night")
        XCTAssertEqual(picks.entries[0].items.map(\.name), ["Oats", "Milk"])
        XCTAssertEqual(picks.entries[0].items[1].amountUnit, .ML)
        XCTAssertEqual(picks.entries[0].totals.kcal, 358)
        XCTAssertEqual(picks.entries[0].timesLogged, 5)
        XCTAssertEqual(picks.entries[0].lastLoggedDate, LukiISODate.parse("2025-06-01T07:30:00Z"))
        XCTAssertNotNil(picks.entries[1].lastLoggedDate)
        XCTAssertEqual(picks.items.count, 1)
        XCTAssertEqual(picks.items[0].item.name, "Banana")
        XCTAssertEqual(picks.items[0].item.amountUnit, .G)
        XCTAssertEqual(picks.items[0].timesLogged, 9)
        XCTAssertNotNil(picks.items[0].lastLoggedDate)
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

    private static let june2026 = ISO8601DateFormatter().date(from: "2026-06-01T00:00:00Z")!

    private func suggest(
        weight: Double? = 80, height: Double? = 180, birthYear: Int? = 1996, sex: String? = "male",
        bodyFat: Double? = nil, level: ActivityLevel? = nil, measured: Bool = false
    ) -> Int? {
        NutritionMath.suggestedDailyKcal(
            bodyWeightKg: weight, heightCm: height, birthYear: birthYear, sex: sex,
            bodyFatPct: bodyFat, activityLevel: level, measuredActivity: measured, now: Self.june2026
        )
    }

    func testSuggestsABaseGoalFromTheEverydayActivityFactor() {
        // BMR = 800 + 1125 − 150 + 5 = 1780 → × 1.3 (default LIGHT) = 2314 → rounded to 10
        XCTAssertEqual(suggest(), 2310)
        XCTAssertEqual(suggest(level: .SEDENTARY), 2140)
        XCTAssertEqual(suggest(level: .VERY_ACTIVE), 2850)
        XCTAssertNil(suggest(height: nil, birthYear: nil, sex: nil))
    }

    func testMeasuredActivityOnlyAddsDigestion() {
        // 1780 × 1.1 = 1958 → 1960, regardless of the chosen activity level
        XCTAssertEqual(suggest(measured: true), 1960)
        XCTAssertEqual(suggest(level: .VERY_ACTIVE, measured: true), 1960)
    }

    func testKatchMcArdleWhenBodyFatIsKnown() {
        // lean = 80 × 0.85 = 68 → 370 + 21.6 × 68 = 1838.8
        let resting = NutritionMath.restingEnergy(bodyWeightKg: 80, heightCm: nil, birthYear: nil, sex: nil, bodyFatPct: 15)
        XCTAssertEqual(resting?.method, .katchMcArdle)
        XCTAssertEqual(resting?.kcal ?? 0, 370 + 21.6 * 68, accuracy: 1e-9)
        XCTAssertEqual(suggest(height: nil, birthYear: nil, sex: nil, bodyFat: 15), 2390)
        // Implausible body fat falls back to Mifflin–St Jeor.
        XCTAssertEqual(
            NutritionMath.restingEnergy(bodyWeightKg: 80, heightCm: 180, birthYear: 1996, sex: "male", bodyFatPct: 80, now: Self.june2026)?.method,
            .mifflinStJeor
        )
    }

    func testProteinFromLeanMassWhenBodyFatIsKnown() {
        XCTAssertEqual(NutritionMath.suggestedProteinG(bodyWeightKg: 80), 144)
        XCTAssertNil(NutritionMath.suggestedProteinG(bodyWeightKg: nil))
        // 100 kg at 30 % → 70 kg lean × 2.2 = 154 (instead of 180 from total weight)
        XCTAssertEqual(NutritionMath.suggestedProteinG(bodyWeightKg: 100, bodyFatPct: 30), 154)
        XCTAssertNil(NutritionMath.leanBodyMassKg(bodyWeightKg: 100, bodyFatPct: nil))
    }

    func testPreferencesDecodeBodyFatAndActivityLevel() throws {
        let prefs = try JSONDecoder().decode(
            UserPreferencesDto.self, from: Data(#"{"bodyFatPct":18.5,"activityLevel":"ACTIVE"}"#.utf8)
        )
        XCTAssertEqual(prefs.bodyFatPct, 18.5)
        XCTAssertEqual(prefs.activityLevel, .ACTIVE)
        let unknown = try JSONDecoder().decode(
            UserPreferencesDto.self, from: Data(#"{"activityLevel":"ATHLETE","bodyFatPct":null}"#.utf8)
        )
        XCTAssertNil(unknown.activityLevel)
        XCTAssertNil(unknown.bodyFatPct)
    }

    func testUpdatePreferencesSendsNullOnlyForClearedFields() throws {
        var dto = UpdatePreferencesDto()
        dto.dailyKcalGoal = 2400
        dto.setOrClear(\.bodyFatPct, nil, key: .bodyFatPct)
        dto.setOrClear(\.activityLevel, .LIGHT, key: .activityLevel)
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        let json = String(decoding: try encoder.encode(dto), as: UTF8.self)
        XCTAssertEqual(json, #"{"activityLevel":"LIGHT","bodyFatPct":null,"dailyKcalGoal":2400}"#)
    }

    func testMealTypeForTime() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let at = { (h: Int) in cal.date(from: DateComponents(year: 2026, month: 1, day: 1, hour: h))! }
        XCTAssertEqual(MealType.forTime(at(7), calendar: cal), .BREAKFAST)
        XCTAssertEqual(MealType.forTime(at(12), calendar: cal), .LUNCH)
        XCTAssertEqual(MealType.forTime(at(19), calendar: cal), .DINNER)
    }

    func testMealTypeDecodesDrinkAndFallsBackToOther() throws {
        let decoded = try JSONDecoder().decode([MealType].self, from: Data(#"["DRINK","COFFEE","BRUNCH"]"#.utf8))
        XCTAssertEqual(decoded, [.DRINK, .COFFEE, .OTHER])
        XCTAssertTrue(MealType.allCases.contains(.DRINK))
        XCTAssertEqual(String(decoding: try JSONEncoder().encode(MealType.DRINK), as: UTF8.self), #""DRINK""#)
    }
}
