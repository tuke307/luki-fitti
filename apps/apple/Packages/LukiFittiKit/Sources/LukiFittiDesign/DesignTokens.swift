import Foundation
import SwiftUI
import LukiFittiModels

public enum LukiColors {
    public static let neonLime = Color(red: 0.80, green: 1.00, blue: 0.00) // #CCFF00
    public static let electricCyan = Color(red: 0.00, green: 0.90, blue: 1.00) // #00E5FF
    public static let vibrantPurple = Color(red: 0.66, green: 0.33, blue: 0.97) // #A855F7
    public static let heartRose = Color(red: 0.96, green: 0.25, blue: 0.37) // #F43F5E
    public static let calorieAmber = Color(red: 0.98, green: 0.62, blue: 0.09) // #F97316

    public static let darkBackground = Color(red: 0.04, green: 0.05, blue: 0.08) // #0A0D14
    public static let darkCard = Color(red: 0.08, green: 0.10, blue: 0.15) // #141A26
    public static let darkBorder = Color.white.opacity(0.10)

    // Apple Watch Folder & Template Card Palette (matching Section 7.1 & 7.2)
    public static let watchFolderSlate = Color(red: 0.29, green: 0.31, blue: 0.41) // #4A4E69
    public static let watchCardMint = Color(red: 0.43, green: 0.91, blue: 0.72) // #6EE7B7
    public static let watchCardLime = Color(red: 0.80, green: 1.00, blue: 0.00) // #CCFF00
    public static let watchCardAmber = Color(red: 0.99, green: 0.88, blue: 0.28) // #FDE047
    public static let watchCardCyan = Color(red: 0.40, green: 0.91, blue: 0.98) // #67E8F9

    // Apple Watch Page 1 Action Grid Pastel Fills
    public static let watchActionChangeLavender = Color(red: 0.91, green: 0.84, blue: 1.00) // #E9D5FF
    public static let watchActionEditCream = Color(red: 1.00, green: 0.98, blue: 0.76) // #FEF9C3
    public static let watchActionPauseSky = Color(red: 0.75, green: 0.86, blue: 0.99) // #BFDBFE
    public static let watchActionFinishMint = Color(red: 0.65, green: 0.95, blue: 0.82) // #A7F3D0

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
            return neonLime
        }
        return Color(
            red: Double(r) / 255.0,
            green: Double(g) / 255.0,
            blue: Double(b) / 255.0
        )
    }

    public static func watchTemplateCardFill(at index: Int) -> Color {
        let palette = [watchCardMint, watchCardLime, watchCardAmber, watchCardCyan]
        return palette[abs(index) % palette.count]
    }
}

public enum LukiI18n {
    public static func resolveLocale(_ pref: LanguagePreference?) -> SupportedLocale {
        if let pref {
            switch pref {
            case .en: return .en
            case .de: return .de
            case .system: break
            }
        }
        let sysCode = Locale.current.language.languageCode?.identifier.lowercased() ?? "en"
        return sysCode.hasPrefix("de") ? .de : .en
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
