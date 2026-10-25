import Foundation
import SwiftUI
import LukiFittiModels

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

    public static let success = Color.green
    public static let warning = Color.orange
    public static let destructive = Color.red
    public static let heartRate = Color.red
    public static let calories = Color.orange

    // MARK: Legacy names (pre-redesign) mapped onto the semantic palette

    public static let neonLime = accent
    public static let electricCyan = accent
    public static let vibrantPurple = Color.indigo
    public static let heartRose = heartRate
    public static let calorieAmber = calories
    public static let darkBackground = groupedBackground
    public static let darkCard = cardBackground
    public static let darkBorder = separator
    public static let watchFolderSlate = cardBackground
    public static let watchCardMint = cardBackground
    public static let watchCardLime = cardBackground
    public static let watchCardAmber = cardBackground
    public static let watchCardCyan = cardBackground
    public static let watchActionChangeLavender = fill
    public static let watchActionEditCream = fill
    public static let watchActionPauseSky = fill
    public static let watchActionFinishMint = fill

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

    public static func watchTemplateCardFill(at index: Int) -> Color {
        cardBackground
    }
}

public enum LukiI18n {
    public static func resolveLocale(_ pref: LanguagePreference?) -> SupportedLocale {
        SupportedLocale.resolve(pref)
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
