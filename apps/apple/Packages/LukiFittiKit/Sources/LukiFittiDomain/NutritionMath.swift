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

    /// Mifflin–St Jeor BMR × 1.4, rounded to 10 kcal. `nil` when inputs are missing.
    public static func suggestedDailyKcal(
        bodyWeightKg: Double?, heightCm: Double?, birthYear: Int?, sex: String?, now: Date = Date()
    ) -> Int? {
        guard let w = bodyWeightKg, let h = heightCm, let year = birthYear,
              let sex, sex == "male" || sex == "female" else { return nil }
        let age = Calendar(identifier: .gregorian).component(.year, from: now) - year
        guard (14...110).contains(age) else { return nil }
        let bmr = 10 * w + 6.25 * h - 5 * Double(age) + (sex == "male" ? 5 : -161)
        return Int((bmr * 1.4 / 10).rounded()) * 10
    }
}
