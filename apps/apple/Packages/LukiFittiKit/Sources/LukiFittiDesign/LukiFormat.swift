import Foundation
import LukiFittiModels

/// Unit-aware display helpers. Session totals are stored in kg; people see their chosen unit.
/// Mirrors apps/web/lib/format/weight.ts.
public enum LukiFormat {
    private static let kgToLbs = 2.2046226218

    public static func unitLabel(_ unit: WeightUnit) -> String {
        unit.rawValue.lowercased()
    }

    public static func volumeValue(kg: Double, unit: WeightUnit) -> Int {
        Int((unit == .LBS ? kg * kgToLbs : kg).rounded())
    }

    /// "1,240 kg" / "2,734 lbs".
    public static func volume(kg: Double, unit: WeightUnit) -> String {
        "\(volumeValue(kg: kg, unit: unit).formatted()) \(unitLabel(unit))"
    }

    /// −/+ increment: 2.5 kg or 5 lb plates.
    public static func weightStep(_ unit: WeightUnit) -> Double {
        unit == .LBS ? 5 : 2.5
    }

    /// "62.5" without trailing zeros.
    public static func weight(_ value: Double) -> String {
        String(format: "%g", value)
    }

    /// "1:30" or "1:02:03".
    public static func clock(_ seconds: Int) -> String {
        let s = max(0, seconds)
        return s >= 3600
            ? String(format: "%d:%02d:%02d", s / 3600, (s % 3600) / 60, s % 60)
            : String(format: "%d:%02d", s / 60, s % 60)
    }
}
