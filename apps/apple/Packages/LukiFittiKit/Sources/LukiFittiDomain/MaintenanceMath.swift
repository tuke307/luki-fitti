import Foundation
import LukiFittiModels

/// Learned maintenance ("adaptive TDEE"): what the user actually burns, derived from logged intake
/// and the weight trend instead of a population formula.
///
///     energy out = average intake − weight change × 7700 kcal/kg
///
/// Swift port of `packages/common/src/utils/maintenance.util.ts` — keep the numbers in sync.
public enum MaintenanceMath {
    public enum Rules {
        /// Days looked back (ending yesterday; today is still being logged).
        public static let windowDays = 28
        /// Fully logged days required inside the window.
        public static let minLoggedDays = 14
        public static let minWeighIns = 4
        /// Days between the first and last weigh-in in the window.
        public static let minWeighInSpanDays = 10.0
        /// Energy per kg of body weight change (mixed fat / lean tissue).
        public static let kcalPerKg = 7700.0
        /// Days below this share of the median logged intake count as partly logged and are skipped.
        public static let partialDayRatio = 0.5
        /// Results outside this range point to incomplete logging and are discarded.
        public static let plausibleKcal = 1200.0...6000.0
    }

    static let daySeconds = 86_400.0

    public struct DayInput: Sendable, Equatable {
        /// Local calendar day, "YYYY-MM-DD".
        public var day: String
        public var intakeKcal: Double
        /// Workouts and activity burned that day (as shown in the food ring).
        public var burnedKcal: Double

        public init(day: String, intakeKcal: Double, burnedKcal: Double) {
            self.day = day
            self.intakeKcal = intakeKcal
            self.burnedKcal = burnedKcal
        }
    }

    public struct Estimate: Sendable, Equatable {
        /// Average total energy burned per day, activity included.
        public let totalKcal: Int
        /// Total minus the average burned calories: the base goal that matches how the food ring
        /// adds burned calories on top.
        public let baseKcal: Int
        public let avgIntakeKcal: Int
        public let avgBurnedKcal: Int
        public let weightChangeKgPerWeek: Double
        public let loggedDays: Int
        public let weighIns: Int
    }

    /// The day keys of the `windowDays` days ending yesterday, oldest first.
    public static func windowDayKeys(endingBefore now: Date = Date(), calendar: Calendar = .current) -> [String] {
        let today = calendar.startOfDay(for: now)
        return (1...Rules.windowDays).reversed().compactMap { offset in
            calendar.date(byAdding: .day, value: -offset, to: today).map { LukiDayKey.string($0, timeZone: calendar.timeZone) }
        }
    }

    private static func median(_ values: [Double]) -> Double {
        let sorted = values.sorted()
        let mid = sorted.count / 2
        return sorted.count % 2 == 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
    }

    /// Least-squares slope of weight over time, in kg per day.
    public static func weightSlopeKgPerDay(_ points: [WeighInPoint]) -> Double {
        let n = Double(points.count)
        guard points.count >= 2 else { return 0 }
        let first = points[0].date
        let xs = points.map { $0.date.timeIntervalSince(first) / daySeconds }
        let meanX = xs.reduce(0, +) / n
        let meanY = points.reduce(0) { $0 + $1.weightKg } / n
        var num = 0.0
        var den = 0.0
        for (i, point) in points.enumerated() {
            num += (xs[i] - meanX) * (point.weightKg - meanY)
            den += (xs[i] - meanX) * (xs[i] - meanX)
        }
        return den > 0 ? num / den : 0
    }

    /// Estimates maintenance from the given days (the caller passes the window, e.g. the 28 days
    /// ending yesterday) and all weigh-ins; weigh-ins outside the days' range are ignored. `nil`
    /// until there is enough data or when the result is implausible.
    public static func estimate(
        days: [DayInput],
        weighIns: [WeighInPoint],
        calendar: Calendar = .current
    ) -> Estimate? {
        guard !days.isEmpty else { return nil }

        let logged = days.filter { $0.intakeKcal > 0 }
        guard logged.count >= Rules.minLoggedDays else { return nil }
        let threshold = median(logged.map(\.intakeKcal)) * Rules.partialDayRatio
        let complete = logged.filter { $0.intakeKcal >= threshold }
        guard complete.count >= Rules.minLoggedDays else { return nil }

        let starts = days.compactMap { LukiDayKey.date($0.day, calendar: calendar) }
        guard let from = starts.min(), let last = starts.max() else { return nil }
        let to = last.addingTimeInterval(daySeconds)
        let points = weighIns
            .filter { $0.date >= from && $0.date < to && $0.weightKg > 0 }
            .sorted { $0.date < $1.date }
        guard points.count >= Rules.minWeighIns,
              let firstPoint = points.first, let lastPoint = points.last,
              lastPoint.date.timeIntervalSince(firstPoint.date) / daySeconds >= Rules.minWeighInSpanDays
        else { return nil }

        let count = Double(complete.count)
        let avgIntake = complete.reduce(0) { $0 + $1.intakeKcal } / count
        let avgBurned = complete.reduce(0) { $0 + max(0, $1.burnedKcal) } / count
        let slope = weightSlopeKgPerDay(points)
        let total = avgIntake - slope * Rules.kcalPerKg
        guard Rules.plausibleKcal.contains(total) else { return nil }

        func round10(_ v: Double) -> Int { Int(NutritionMath.jsRound(v / 10)) * 10 }
        return Estimate(
            totalKcal: round10(total),
            baseKcal: round10(total - avgBurned),
            avgIntakeKcal: Int(NutritionMath.jsRound(avgIntake)),
            avgBurnedKcal: Int(NutritionMath.jsRound(avgBurned)),
            weightChangeKgPerWeek: NutritionMath.jsRound(slope * 7 * 100) / 100,
            loggedDays: complete.count,
            weighIns: points.count
        )
    }
}
