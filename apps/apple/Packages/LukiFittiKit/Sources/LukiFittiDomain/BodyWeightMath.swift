import Foundation
import LukiFittiModels

/// One weigh-in reduced to what the math needs.
public struct WeighInPoint: Sendable, Equatable, Hashable {
    public var date: Date
    public var weightKg: Double

    public init(date: Date, weightKg: Double) {
        self.date = date
        self.weightKg = weightKg
    }
}

public struct WeightTrend: Sendable, Equatable {
    public var latestKg: Double?
    /// Change vs. the weight that applied 7 / 30 days before the latest weigh-in.
    public var change7dKg: Double?
    public var change30dKg: Double?
    public var daysSinceLast: Int?

    public init(latestKg: Double? = nil, change7dKg: Double? = nil, change30dKg: Double? = nil, daysSinceLast: Int? = nil) {
        self.latestKg = latestKg
        self.change7dKg = change7dKg
        self.change30dKg = change30dKg
        self.daysSinceLast = daysSinceLast
    }
}

/// Swift port of `packages/common/src/utils/body-weight.util.ts` — keep the numbers in sync.
public enum BodyWeightMath {
    static let dayInterval: TimeInterval = 86_400
    static let kgPerLb = 0.45359237

    public static func points(_ entries: [BodyWeightEntryDto]) -> [WeighInPoint] {
        sorted(entries.compactMap { e in e.measuredAtDate.map { WeighInPoint(date: $0, weightKg: e.weightKg) } })
    }

    /// Oldest first. Does not mutate the input.
    public static func sorted(_ points: [WeighInPoint]) -> [WeighInPoint] {
        points.sorted { $0.date < $1.date }
    }

    /// Body weight that applies at `date`: the latest weigh-in on or before it. Dates before the
    /// first weigh-in use the earliest one. `nil` = no history.
    public static func weightAt(_ points: [WeighInPoint], date: Date) -> Double? {
        var best: WeighInPoint?
        var earliest: WeighInPoint?
        for p in points {
            if earliest == nil || p.date < earliest!.date { earliest = p }
            if p.date <= date, best == nil || p.date >= best!.date { best = p }
        }
        return (best ?? earliest)?.weightKg
    }

    /// Weight used for a workout's calorie estimate: history rule, then the profile value, then
    /// `nil` (callers fall back to `NutritionMath.defaultBodyWeightKg`).
    public static func estimateWeightKg(_ points: [WeighInPoint], at date: Date, fallbackKg: Double?) -> Double? {
        if let w = weightAt(points, date: date) { return w }
        if let fallbackKg, fallbackKg > 0 { return fallbackKg }
        return nil
    }

    public static func latest(_ points: [WeighInPoint]) -> WeighInPoint? {
        var latest: WeighInPoint?
        for p in points where latest == nil || p.date >= latest!.date { latest = p }
        return latest
    }

    /// Whether there is a weigh-in at or after `since` (e.g. start of the current week).
    public static func hasWeighIn(_ points: [WeighInPoint], since: Date) -> Bool {
        points.contains { $0.date >= since }
    }

    /// Trailing moving average over `windowDays` for each entry (oldest first), rounded to 0.01 kg.
    public static func movingAverage(_ points: [WeighInPoint], windowDays: Int = 7) -> [(point: WeighInPoint, averageKg: Double)] {
        let list = sorted(points)
        let window = TimeInterval(windowDays) * dayInterval
        var start = 0
        var sum = 0.0
        var result: [(point: WeighInPoint, averageKg: Double)] = []
        result.reserveCapacity(list.count)
        for (i, p) in list.enumerated() {
            sum += p.weightKg
            while list[start].date.timeIntervalSince1970 <= p.date.timeIntervalSince1970 - window {
                sum -= list[start].weightKg
                start += 1
            }
            result.append((p, (sum / Double(i - start + 1) * 100).rounded() / 100))
        }
        return result
    }

    public static func trend(_ points: [WeighInPoint], now: Date = Date()) -> WeightTrend {
        guard let latest = latest(points), let first = points.map(\.date).min() else { return WeightTrend() }
        func change(_ days: Int) -> Double? {
            let ref = latest.date.addingTimeInterval(-Double(days) * dayInterval)
            guard ref >= first, let before = weightAt(points, date: ref) else { return nil }
            return ((latest.weightKg - before) * 10).rounded() / 10
        }
        return WeightTrend(
            latestKg: latest.weightKg,
            change7dKg: change(7),
            change30dKg: change(30),
            daysSinceLast: max(0, Int((now.timeIntervalSince(latest.date) / dayInterval).rounded(.down)))
        )
    }

    public static func kgToLbs(_ kg: Double) -> Double { kg / kgPerLb }
    public static func lbsToKg(_ lbs: Double) -> Double { lbs * kgPerLb }

    /// Value shown to the person in their unit.
    public static func display(_ kg: Double, unit: WeightUnit) -> Double {
        unit == .LBS ? kgToLbs(kg) : kg
    }

    /// Value typed by the person, converted back to kg for storage.
    public static func kilograms(_ value: Double, unit: WeightUnit) -> Double {
        unit == .LBS ? lbsToKg(value) : value
    }

    /// Parses "72,5" / "72.5" / "160 lbs" typed in the person's unit and returns kg when valid.
    public static func parseInput(_ text: String, unit: WeightUnit) -> Double? {
        let cleaned = text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: ",", with: ".")
            .filter { $0.isNumber || $0 == "." }
        guard let value = Double(cleaned), value.isFinite, value > 0 else { return nil }
        let kg = kilograms(value, unit: unit)
        return BodyWeightLimits.kgRange.contains(kg) ? kg : nil
    }
}
