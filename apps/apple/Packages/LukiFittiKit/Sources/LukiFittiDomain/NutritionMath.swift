import Foundation
import LukiFittiModels

/// Swift port of `packages/common/src/utils/{nutrition,energy}.util.ts` — keep the numbers in sync.
public enum NutritionMath {
    public static let defaultBodyWeightKg = 75.0
    static let strengthMetLight = 3.5
    static let strengthMetVigorous = 6.0
    static let stretchingMet = 2.3
    static let defaultCardioMet = 7.0
    static let densityLight = 0.12
    static let densityVigorous = 0.35

    private static func round1(_ v: Double) -> Double { (v * 10).rounded() / 10 }
    private static func safe(_ v: Double) -> Double { v.isFinite && v > 0 ? v : 0 }

    public static func sum(_ items: [MealItemDto]) -> NutritionTotalsDto {
        sum(items.map { NutritionTotalsDto(kcal: $0.kcal, proteinG: $0.proteinG, carbsG: $0.carbsG, fatG: $0.fatG) })
    }

    public static func sum(_ totals: [NutritionTotalsDto]) -> NutritionTotalsDto {
        NutritionTotalsDto(
            kcal: totals.reduce(0) { $0 + safe($1.kcal) }.rounded(),
            proteinG: round1(totals.reduce(0) { $0 + safe($1.proteinG) }),
            carbsG: round1(totals.reduce(0) { $0 + safe($1.carbsG) }),
            fatG: round1(totals.reduce(0) { $0 + safe($1.fatG) })
        )
    }

    /// Rescales nutrients when only the portion changes (e.g. the AI guessed 150 g, it was 200 g).
    public static func scale(_ item: MealItemDto, toGrams grams: Double) -> MealItemDto {
        var copy = item
        copy.grams = grams
        guard let base = item.grams, base > 0, grams.isFinite, grams >= 0 else { return copy }
        let f = grams / base
        copy.kcal = (item.kcal * f).rounded()
        copy.proteinG = round1(item.proteinG * f)
        copy.carbsG = round1(item.carbsG * f)
        copy.fatG = round1(item.fatG * f)
        copy.fiberG = item.fiberG.map { round1($0 * f) }
        copy.sugarG = item.sugarG.map { round1($0 * f) }
        return copy
    }

    /// Units offered in amount inputs; `l` is stored as `.ML` × 1000.
    public enum AmountDisplayUnit: String, CaseIterable, Sendable, Identifiable {
        case g, ml, l
        public var id: String { rawValue }
        public var stored: MealAmountUnit { self == .g ? .G : .ML }
    }

    /// Rescales within the same unit; switching g ↔ ml only relabels (no density guess).
    public static func scale(_ item: MealItemDto, toAmount amount: Double, unit: MealAmountUnit) -> MealItemDto {
        guard unit == item.amountUnit else {
            var copy = item
            copy.grams = amount
            copy.amountUnit = unit
            return copy
        }
        return scale(item, toGrams: amount)
    }

    /// Typed value (e.g. 1.5 l) → stored amount and unit (1500 ml).
    public static func storedAmount(_ value: Double, _ unit: AmountDisplayUnit) -> (amount: Double, unit: MealAmountUnit) {
        unit == .l ? (round1(value * 1000), .ML) : (value, unit.stored)
    }

    /// Friendliest display unit: from 1000 ml upward volumes show as litres.
    public static func displayAmount(_ amount: Double, _ unit: MealAmountUnit) -> (value: Double, unit: AmountDisplayUnit) {
        switch unit {
        case .G: (amount, .g)
        case .ML: amount >= 1000 ? (amount / 1000, .l) : (amount, .ml)
        }
    }

    /// "500 g", "500 ml", "1,5 l" (locale-aware decimals); empty without an amount.
    public static func formatAmount(_ amount: Double?, _ unit: MealAmountUnit, locale: Locale = .current) -> String {
        guard let amount, amount.isFinite else { return "" }
        let display = displayAmount(amount, unit)
        let value = display.value.formatted(
            .number.precision(.fractionLength(0...(display.unit == .l ? 2 : 1))).locale(locale)
        )
        return "\(value) \(display.unit.rawValue)"
    }

    public static func progress(_ value: Double, goal: Int?) -> Double? {
        guard let goal, goal > 0 else { return nil }
        return min(1, max(0, value / Double(goal)))
    }

    // MARK: Workout energy

    public static func strengthMet(setsPerMinute: Double) -> Double {
        let t = min(1, max(0, (setsPerMinute - densityLight) / (densityVigorous - densityLight)))
        return strengthMetLight + t * (strengthMetVigorous - strengthMetLight)
    }

    public static func cardioMet(kmPerHour: Double?) -> Double {
        guard let v = kmPerHour, v.isFinite, v > 0 else { return defaultCardioMet }
        switch v {
        case ..<5: return 3.5
        case ..<7: return 5.0
        case ..<9: return 8.3
        case ..<11: return 9.8
        case ..<13: return 11.0
        default: return 11.8
        }
    }

    /// Active kcal for a session: server estimate → HealthKit → (MET − 1) × kg × h.
    public static func burnedKcal(for session: WorkoutSessionDto, bodyWeightKg: Double?) -> Int {
        if let server = session.estimatedCaloriesKcal { return Int(server.rounded()) }
        if let hk = session.activeCaloriesKcal { return Int(max(0, hk).rounded()) }
        let weight = (bodyWeightKg ?? 0) > 0 ? bodyWeightKg! : defaultBodyWeightKg
        let total = Double(max(0, session.activeDurationSeconds))
        guard total > 0 else { return 0 }

        var stretch = 0.0, cardio = 0.0, meters = 0.0, workingSets = 0.0
        for ex in session.exercises {
            for set in ex.sets where set.completed {
                let duration = Double(max(0, set.durationSeconds ?? 0))
                if ex.exerciseTypeSnapshot == .STRETCHING || set.setType == .STRETCH {
                    stretch += duration
                } else if ex.exerciseTypeSnapshot == .CARDIO {
                    cardio += duration
                    meters += max(0, set.distanceMeters ?? 0)
                } else if set.setType != .WARMUP {
                    workingSets += 1
                }
            }
        }
        if stretch + cardio > total {
            let f = total / (stretch + cardio)
            stretch *= f
            cardio *= f
        }
        var strength = max(0, total - stretch - cardio)
        if session.sessionType == .STRETCHING && workingSets == 0 {
            stretch += strength
            strength = 0
        }
        let met = strength > 0 ? strengthMet(setsPerMinute: workingSets / (strength / 60)) : strengthMetLight
        let speed = cardio > 0 && meters > 0 ? (meters / 1000) / (cardio / 3600) : nil
        let kcal = (met - 1) * weight * strength / 3600
            + (stretchingMet - 1) * weight * stretch / 3600
            + (cardioMet(kmPerHour: speed) - 1) * weight * cardio / 3600
        return Int(kcal.rounded())
    }

    // MARK: Daily goal suggestion

    /// Plausible body fat in %; values outside are ignored.
    public static let bodyFatPctRange = 3.0...60.0

    /// Multipliers on resting energy for everyday life *without* workouts (includes ~10 % for
    /// digestion). Workouts are added on top by the food ring, so they must not be in here.
    public static let activityLevelFactors: [ActivityLevel: Double] = [
        .SEDENTARY: 1.2,
        .LIGHT: 1.3,
        .ACTIVE: 1.45,
        .VERY_ACTIVE: 1.6,
    ]
    public static let defaultActivityLevel = ActivityLevel.LIGHT

    /// With Apple Health, all movement above resting energy is measured and added to the ring, so
    /// the base only covers resting energy plus digestion.
    public static let measuredActivityFactor = 1.1

    public enum RestingEnergyMethod: String, Sendable, Equatable {
        case katchMcArdle = "katch-mcardle"
        case mifflinStJeor = "mifflin-st-jeor"
    }

    public struct RestingEnergy: Sendable, Equatable {
        public let kcal: Double
        public let method: RestingEnergyMethod
    }

    /// JavaScript `Math.round` (halves round up, also for negatives) so results match the web.
    static func jsRound(_ v: Double) -> Double { (v + 0.5).rounded(.down) }

    /// Lean body mass in kg when both weight and a plausible body fat % are known.
    public static func leanBodyMassKg(bodyWeightKg: Double?, bodyFatPct: Double?) -> Double? {
        guard let w = bodyWeightKg, w > 0, let pct = bodyFatPct, pct.isFinite, bodyFatPctRange.contains(pct) else {
            return nil
        }
        return w * (1 - pct / 100)
    }

    /// Resting energy (BMR) in kcal/day. Katch–McArdle (370 + 21.6 × lean mass) when body fat is
    /// known — more accurate for muscular people — otherwise Mifflin–St Jeor. `nil` when inputs
    /// are missing.
    public static func restingEnergy(
        bodyWeightKg: Double?, heightCm: Double?, birthYear: Int?, sex: String?,
        bodyFatPct: Double? = nil, now: Date = Date()
    ) -> RestingEnergy? {
        if let lean = leanBodyMassKg(bodyWeightKg: bodyWeightKg, bodyFatPct: bodyFatPct) {
            return RestingEnergy(kcal: 370 + 21.6 * lean, method: .katchMcArdle)
        }
        guard let w = bodyWeightKg, w != 0, let h = heightCm, h != 0, let year = birthYear, year != 0,
              let sex, sex == "male" || sex == "female" else { return nil }
        var utc = Calendar(identifier: .gregorian)
        utc.timeZone = TimeZone(identifier: "UTC")!
        let age = utc.component(.year, from: now) - year
        guard (14...110).contains(age) else { return nil }
        let kcal = 10 * w + 6.25 * h - 5 * Double(age) + (sex == "male" ? 5 : -161)
        return RestingEnergy(kcal: kcal, method: .mifflinStJeor)
    }

    /// Suggested **base** daily goal, rounded to 10 kcal: what the body burns on a day without
    /// workouts or (with Apple Health) without any measured activity. The food ring adds the day's
    /// burned calories on top, so activity is never counted twice. `nil` when inputs are missing.
    ///
    /// - Parameter measuredActivity: Apple Health active energy is synced for recent days.
    public static func suggestedDailyKcal(
        bodyWeightKg: Double?, heightCm: Double?, birthYear: Int?, sex: String?,
        bodyFatPct: Double? = nil, activityLevel: ActivityLevel? = nil, measuredActivity: Bool = false,
        now: Date = Date()
    ) -> Int? {
        guard let resting = restingEnergy(
            bodyWeightKg: bodyWeightKg, heightCm: heightCm, birthYear: birthYear, sex: sex,
            bodyFatPct: bodyFatPct, now: now
        ) else { return nil }
        let factor = measuredActivity
            ? measuredActivityFactor
            : activityLevelFactors[activityLevel ?? defaultActivityLevel] ?? 1.3
        return Int(jsRound(resting.kcal * factor / 10)) * 10
    }

    /// Protein target for people who lift: 2.2 g per kg lean mass when body fat is known (≈ 1.8 g/kg
    /// at typical body fat, and no overshoot at higher body fat), otherwise 1.8 g per kg body weight.
    public static func suggestedProteinG(bodyWeightKg: Double?, bodyFatPct: Double? = nil) -> Int? {
        if let lean = leanBodyMassKg(bodyWeightKg: bodyWeightKg, bodyFatPct: bodyFatPct) {
            return Int(jsRound(lean * 2.2))
        }
        guard let w = bodyWeightKg, w != 0, w.isFinite else { return nil }
        return Int(jsRound(w * 1.8))
    }
}
