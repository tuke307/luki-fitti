import Foundation
import LukiFittiModels

/// Localized names and range captions for `TrainingGoal`; mirrors the web i18n strings.
public enum TrainingGoalLabels {
    public static func name(_ goal: TrainingGoal, _ tr: SupportedLocale) -> String {
        switch goal {
        case .STRENGTH: return tr("Strength")
        case .HYPERTROPHY: return tr("Hypertrophy")
        case .ENDURANCE: return tr("Endurance")
        }
    }

    /// Short range caption shown under the goal name in pickers.
    public static func caption(_ goal: TrainingGoal, _ tr: SupportedLocale) -> String {
        switch goal {
        case .STRENGTH: return tr("3–6 reps compound · 6–10 isolation · 3 min rest")
        case .HYPERTROPHY: return tr("6–10 reps compound · 10–15 isolation · 90 s rest")
        case .ENDURANCE: return tr("12–20 reps compound · 15–25 isolation · 60 s rest")
        }
    }
}
