import Foundation
import SwiftUI
import LukiFittiModels
import LukiFittiDomain

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Semantic palette aligned with the web tokens (packages/ui/src/globals.css): system grouped
/// surfaces plus a single ember accent, adapting to light and dark appearance.
public enum LukiColors {
    // MARK: Semantic tokens

    /// Brand accent for primary actions, progress and the live workout (#B73D00 light / #F2823B dark).
    public static let accent = adaptive(light: (0.718, 0.239, 0.0), dark: (0.949, 0.510, 0.231))
    /// Text/icon color on top of `accent` fills.
    public static let accentForeground = adaptive(light: (1, 1, 1), dark: (0.11, 0.07, 0.04))

    #if os(iOS)
    public static let groupedBackground = Color(uiColor: .systemGroupedBackground)
    public static let cardBackground = Color(uiColor: .secondarySystemGroupedBackground)
    public static let fill = Color(uiColor: .tertiarySystemFill)
    public static let separator = Color(uiColor: .separator)
    #else
    public static let groupedBackground = Color.black
    public static let cardBackground = Color(white: 0.13)
    public static let fill = Color(white: 0.2)
    public static let separator = Color.white.opacity(0.15)
    #endif

    /// Logged sets and goals reached. 4.57:1 with white in light, 10.4:1 with black in dark.
    public static let success = adaptive(light: (0.110, 0.529, 0.259), dark: (0.188, 0.820, 0.345))
    public static let warning = Color.orange
    /// Destructive text and icons: 5.38:1 on white, 6.03:1 on #1C1C1E.
    public static let destructive = adaptive(light: (0.843, 0.0, 0.082), dark: (1.0, 0.412, 0.380))
    /// Neutral swipe actions (white text, 5.99:1).
    public static let neutralAction = Color(red: 0.388, green: 0.388, blue: 0.400)
    /// Text on filled set-type, success and destructive tints: white in light, black in dark.
    public static let onTint = adaptive(light: (1, 1, 1), dark: (0, 0, 0))
    /// Heart rate and energy as text: 5.38:1 / 5.28:1 on white, 6.0:1+ on #1C1C1E.
    public static let heartRate = destructive
    public static let calories = adaptive(light: (0.788, 0.204, 0.0), dark: (1.0, 0.624, 0.039))

    // Set types — kept clear of the green/amber/red effort scale (mirrors --set-* in globals.css).
    public static let setWarmup = adaptive(light: (0.16, 0.45, 0.78), dark: (0.45, 0.68, 0.95))
    public static let setDropset = adaptive(light: (0.53, 0.25, 0.78), dark: (0.74, 0.56, 0.98))
    public static let setStretch = adaptive(light: (0.05, 0.46, 0.49), dark: (0.42, 0.82, 0.84))

    /// Badge colour for a set type; working sets use `success` once logged and a neutral fill before.
    public static func setTypeColor(_ type: SetType) -> Color? {
        switch type {
        case .WARMUP: return setWarmup
        case .DROPSET: return setDropset
        case .STRETCH: return setStretch
        case .WORKING: return nil
        }
    }

    /// Effort level for a logged RPE: 0 = not rated, 1 = easy, 2 = just right, 3 = max.
    /// Mirrors `intensityLevel` in the web set row.
    public static func effortLevel(rpe: Double?) -> Int {
        guard let rpe else { return 0 }
        if rpe <= 7.5 { return 1 }
        return rpe < ProgressionEngine.maxEffortRpe ? 2 : 3
    }

    /// Green / amber / red effort scale (web: success / warning / destructive).
    public static func effortColor(level: Int) -> Color {
        switch level {
        case 1: return success
        case 2: return warning
        case 3: return destructive
        default: return .secondary
        }
    }

    private static func adaptive(
        light: (Double, Double, Double),
        dark: (Double, Double, Double)
    ) -> Color {
        #if os(watchOS)
        return Color(red: dark.0, green: dark.1, blue: dark.2)
        #elseif canImport(UIKit)
        return Color(uiColor: UIColor { traits in
            let c = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: c.0, green: c.1, blue: c.2, alpha: 1)
        })
        #elseif canImport(AppKit)
        return Color(nsColor: NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            let c = isDark ? dark : light
            return NSColor(red: c.0, green: c.1, blue: c.2, alpha: 1)
        })
        #else
        return Color(red: light.0, green: light.1, blue: light.2)
        #endif
    }

    // Folder accent palette — mirrors FOLDER_COLOR_PALETTE in @luki-fitti/common.
    public static let folderPaletteHex = ["#E8743B", "#3A7BD5", "#5E9C76", "#8E6CC4", "#D9577B", "#7C8794"]
    public static let defaultFolderHex = "#E8743B"

    /// Neon colors from before the redesign, mapped to their palette replacement.
    public static let legacyFolderHexMap: [String: String] = [
        "#CCFF00": "#5E9C76",
        "#00E5FF": "#3A7BD5",
        "#FF6B00": "#E8743B",
        "#A855F7": "#8E6CC4",
        "#22C55E": "#5E9C76",
    ]

    /// Normalizes a stored folder color, upgrading legacy neon values and falling back to the default.
    public static func resolveFolderHex(_ hex: String?) -> String {
        let normalized = (hex ?? "").trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        let isValid = normalized.count == 7
            && normalized.hasPrefix("#")
            && normalized.dropFirst().allSatisfy(\.isHexDigit)
        guard isValid else { return defaultFolderHex }
        return legacyFolderHexMap[normalized] ?? normalized
    }

    public static func folderColor(_ hex: String?) -> Color {
        colorFromHex(resolveFolderHex(hex))
    }

    public static func colorFromHex(_ hex: String) -> Color {
        let cleaned = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: cleaned).scanHexInt64(&int)
        let r, g, b: UInt64
        switch cleaned.count {
        case 6:
            (r, g, b) = (int >> 16, int >> 8 & 0xFF, int & 0xFF)
        default:
            return accent
        }
        return Color(
            red: Double(r) / 255.0,
            green: Double(g) / 255.0,
            blue: Double(b) / 255.0
        )
    }

}

public enum LukiI18n {
    public static func resolveLocale(_ pref: LanguagePreference?) -> SupportedLocale {
        SupportedLocale.resolve(pref)
    }

    /// Effort level label for a logged RPE. Mirrors `session.intensity*` in the web locales:
    /// 1 bar = Easy (RPE 7), 2 bars = Just right (RPE 8), 3 bars = Max (RPE 9.5).
    public static func effortLabel(rpe: Double?, locale: SupportedLocale = .en) -> String {
        let de = locale == .de
        guard let rpe else { return de ? "Intensität" : "Effort" }
        if rpe <= 7.5 { return de ? "Leicht" : "Easy" }
        if rpe < ProgressionEngine.maxEffortRpe { return de ? "Genau richtig" : "Just right" }
        return "Max"
    }

    /// Mirrors `enums.setTypes` in the web locales.
    public static func setTypeLabel(_ type: SetType, locale: SupportedLocale = .en) -> String {
        let de = locale == .de
        switch type {
        case .WARMUP: return de ? "Aufwärmsatz" : "Warm-up"
        case .WORKING: return de ? "Arbeitssatz" : "Working"
        case .DROPSET: return de ? "Dropsatz" : "Dropset"
        case .STRETCH: return de ? "Dehnung" : "Stretch"
        }
    }

    /// Gym notation for set badges: W / D / S for special sets, only working sets are numbered.
    public static func setBadgeLabels(_ types: [SetType]) -> [String] {
        var working = 0
        return types.map { type in
            switch type {
            case .WARMUP: return "W"
            case .DROPSET: return "D"
            case .STRETCH: return "S"
            case .WORKING:
                working += 1
                return "\(working)"
            }
        }
    }

    public static func muscleLabel(_ muscle: MuscleGroup, locale: SupportedLocale = .en) -> String {
        switch locale {
        case .en:
            switch muscle {
            case .CHEST: return "Chest"
            case .BACK: return "Back"
            case .SHOULDERS: return "Shoulders"
            case .BICEPS: return "Biceps"
            case .TRICEPS: return "Triceps"
            case .FOREARMS: return "Forearms"
            case .QUADRICEPS: return "Quadriceps"
            case .HAMSTRINGS: return "Hamstrings"
            case .GLUTES: return "Glutes"
            case .CALVES: return "Calves"
            case .ABS_CORE: return "Abs & Core"
            case .HIP_FLEXORS: return "Hip Flexors"
            case .FULL_BODY: return "Full Body"
            }
        case .de:
            switch muscle {
            case .CHEST: return "Brust"
            case .BACK: return "Rücken"
            case .SHOULDERS: return "Schultern"
            case .BICEPS: return "Bizeps"
            case .TRICEPS: return "Trizeps"
            case .FOREARMS: return "Unterarme"
            case .QUADRICEPS: return "Quadrizeps"
            case .HAMSTRINGS: return "Beinbeuger"
            case .GLUTES: return "Gesäß"
            case .CALVES: return "Waden"
            case .ABS_CORE: return "Bauch & Core"
            case .HIP_FLEXORS: return "Hüftbeuger"
            case .FULL_BODY: return "Ganzkörper"
            }
        }
    }

    public static func equipmentLabel(_ eq: EquipmentType, locale: SupportedLocale = .en) -> String {
        switch locale {
        case .en:
            switch eq {
            case .BARBELL: return "Barbell"
            case .DUMBBELL: return "Dumbbell"
            case .MACHINE: return "Machine"
            case .CABLE: return "Cable"
            case .BODYWEIGHT: return "Bodyweight"
            case .KETTLEBELL: return "Kettlebell"
            case .BAND: return "Resistance Band"
            case .EZ_BAR: return "EZ-Bar"
            case .SMITH_MACHINE: return "Smith Machine"
            case .CARDIO_MACHINE: return "Cardio Machine"
            case .FOAM_ROLLER: return "Foam Roller"
            case .NONE: return "No Equipment"
            case .OTHER: return "Other"
            }
        case .de:
            switch eq {
            case .BARBELL: return "Langhantel"
            case .DUMBBELL: return "Kurzhantel"
            case .MACHINE: return "Maschine"
            case .CABLE: return "Kabelzug"
            case .BODYWEIGHT: return "Körpergewicht"
            case .KETTLEBELL: return "Kettlebell"
            case .BAND: return "Widerstandsband"
            case .EZ_BAR: return "SZ-Stange"
            case .SMITH_MACHINE: return "Multipresse"
            case .CARDIO_MACHINE: return "Cardio-Gerät"
            case .FOAM_ROLLER: return "Faszienrolle"
            case .NONE: return "Ohne Gerät"
            case .OTHER: return "Sonstiges"
            }
        }
    }
}
