import Foundation
import LukiFittiModels
import LukiFittiDomain

/// Localized copy for the smart exercise suggestion card.
/// Wording mirrors `workouts.smartSuggestionBadge`, `suggestionReason*`, `suggestionChip*`,
/// `addSuggestedBtn` and `swapSuggestedBtn` in `apps/web/lib/i18n/locales/{en,de}.ts` —
/// keep both in sync.
public enum SuggestionReasonFormatter {
    public static func badge(locale: SupportedLocale) -> String {
        locale == .de ? "Vorschlag" : "Suggestion"
    }

    public static func addButton(locale: SupportedLocale) -> String {
        locale == .de ? "Hinzufügen" : "Add"
    }

    public static func replaceButton(_ name: String, locale: SupportedLocale) -> String {
        locale == .de ? "\(name) ersetzen" : "Replace \(name)"
    }

    public static func reason(for suggestion: WorkoutExerciseSuggestion, locale: SupportedLocale) -> String {
        let name = suggestion.suggestedExercise.name
        let muscle = LukiI18n.muscleLabel(suggestion.targetMuscle, locale: locale)
        let stalling = suggestion.stallingExerciseName ?? ""
        let split = suggestion.splitArchetype.rawValue.replacingOccurrences(of: "_", with: " ")

        switch (suggestion.reasonType, locale) {
        case (.PLATEAU, .en):
            return "\(stalling) hasn’t hit a new best in a while. \(name) could give your \(muscle) a fresh challenge."
        case (.PLATEAU, .de):
            return "\(stalling) hat schon länger keine neue Bestleistung. \(name) bringt einen neuen Reiz für: \(muscle)."
        case (.GRINDING, .en):
            return "\(stalling) keeps taking max effort without moving up. Try \(name) for your \(muscle)."
        case (.GRINDING, .de):
            return "\(stalling) braucht Maximaleinsatz, ohne dass es vorangeht. Probier \(name) für: \(muscle)."
        case (.REGRESSION, .en):
            return "\(stalling) is trending down. \(name) can get your \(muscle) back on track."
        case (.REGRESSION, .de):
            return "\(stalling) geht zurück. \(name) bringt dich bei \(muscle) wieder in die Spur."
        case (.MISSING_MUSCLE, .en):
            return "Your \(split) workout has no \(muscle) work yet. \(name) fills the gap."
        case (.MISSING_MUSCLE, .de):
            return "Dein \(split)-Workout hat noch nichts für \(muscle). \(name) schließt die Lücke."
        case (.LOW_VOLUME, .en):
            return "\(muscle) gets fewer sets than the rest of this workout. \(name) balances it out."
        case (.LOW_VOLUME, .de):
            return "\(muscle) bekommt weniger Sätze als der Rest dieses Workouts. \(name) gleicht das aus."
        }
    }

    public static func evidence(for suggestion: WorkoutExerciseSuggestion, locale: SupportedLocale) -> String? {
        let e = suggestion.evidence
        let de = locale == .de
        switch suggestion.reasonType {
        case .PLATEAU:
            if e.weeksSinceBest >= 1 {
                return de
                    ? "\(e.sessionsSinceBest) Einheiten · \(e.weeksSinceBest) Wo. ohne neue Bestleistung"
                    : "\(e.sessionsSinceBest) sessions · \(e.weeksSinceBest) wks without a new best"
            }
            return de
                ? "\(e.sessionsSinceBest) Einheiten ohne neue Bestleistung"
                : "\(e.sessionsSinceBest) sessions without a new best"
        case .GRINDING:
            return de
                ? "Maximaleinsatz \(e.hardSessionsRecent) von \(e.recentWindow) · kein Zuwachs"
                : "Max effort \(e.hardSessionsRecent) of last \(e.recentWindow) · no gain"
        case .REGRESSION:
            let rounded = Int(e.changePct.rounded())
            let change = "\(rounded < 0 ? "−" : "")\(abs(rounded))"
            return de
                ? "\(change) % in den letzten \(e.recentWindow) Einheiten"
                : "\(change)% over last \(e.recentWindow) sessions"
        case .MISSING_MUSCLE, .LOW_VOLUME:
            guard e.setsTotal > 0 else { return nil }
            return de
                ? "\(e.setsForMuscle) von \(e.setsTotal) Sätzen"
                : "\(e.setsForMuscle) of \(e.setsTotal) sets"
        }
    }
}
