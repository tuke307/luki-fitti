import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain
@testable import LukiFittiDesign

/// Expected strings are copied from `apps/web/lib/i18n/locales/{en,de}.ts` so iOS and web
/// wording cannot drift apart unnoticed.
final class SuggestionReasonFormatterTests: XCTestCase {
    private lazy var lateralRaise = StarterCatalogLoader.load().exercises.first { $0.id == "ex-side-lateral-raise" }!

    private func suggestion(
        _ reason: ExerciseSuggestionReasonType,
        muscle: MuscleGroup = .SHOULDERS,
        evidence: WorkoutSuggestionEvidence
    ) -> WorkoutExerciseSuggestion {
        WorkoutExerciseSuggestion(
            suggestedExercise: lateralRaise,
            targetMuscle: muscle,
            splitArchetype: .PUSH,
            reasonType: reason,
            stallingExerciseId: reason.isStall ? "ex-dumbbell-shoulder-press" : nil,
            stallingExerciseName: reason.isStall ? "Shoulder Press" : nil,
            evidence: evidence
        )
    }

    func testGermanStallCopy() {
        let name = lateralRaise.name
        let grinding = suggestion(.GRINDING, evidence: WorkoutSuggestionEvidence(hardSessionsRecent: 3, recentWindow: 3))
        XCTAssertEqual(
            SuggestionReasonFormatter.reason(for: grinding, locale: .de),
            "Shoulder Press braucht Maximaleinsatz, ohne dass es vorangeht. Probier \(name) für: Schultern."
        )
        XCTAssertEqual(SuggestionReasonFormatter.evidence(for: grinding, locale: .de), "Maximaleinsatz 3 von 3 · kein Zuwachs")

        let plateau = suggestion(.PLATEAU, evidence: WorkoutSuggestionEvidence(sessionsSinceBest: 4, weeksSinceBest: 6))
        XCTAssertEqual(
            SuggestionReasonFormatter.evidence(for: plateau, locale: .de),
            "4 Einheiten · 6 Wo. ohne neue Bestleistung"
        )

        let regression = suggestion(.REGRESSION, evidence: WorkoutSuggestionEvidence(recentWindow: 3, changePct: -6.7))
        XCTAssertEqual(SuggestionReasonFormatter.evidence(for: regression, locale: .de), "−7 % in den letzten 3 Einheiten")
        XCTAssertEqual(SuggestionReasonFormatter.evidence(for: regression, locale: .en), "−7% over last 3 sessions")
    }

    func testGermanBalanceCopy() {
        let name = lateralRaise.name
        let missing = suggestion(.MISSING_MUSCLE, muscle: .TRICEPS, evidence: WorkoutSuggestionEvidence(setsForMuscle: 0, setsTotal: 6))
        XCTAssertEqual(
            SuggestionReasonFormatter.reason(for: missing, locale: .de),
            "Dein PUSH-Workout hat noch nichts für Trizeps. \(name) schließt die Lücke."
        )
        XCTAssertEqual(SuggestionReasonFormatter.evidence(for: missing, locale: .de), "0 von 6 Sätzen")
    }

    func testButtonsAndEffortLabels() {
        XCTAssertEqual(SuggestionReasonFormatter.badge(locale: .de), "Vorschlag")
        XCTAssertEqual(SuggestionReasonFormatter.addButton(locale: .de), "Hinzufügen")
        XCTAssertEqual(SuggestionReasonFormatter.replaceButton("Shoulder Press", locale: .de), "Shoulder Press ersetzen")
        XCTAssertEqual(SuggestionReasonFormatter.replaceButton("Shoulder Press", locale: .en), "Replace Shoulder Press")

        XCTAssertEqual(LukiI18n.effortLabel(rpe: nil, locale: .de), "Intensität")
        XCTAssertEqual(LukiI18n.effortLabel(rpe: 7, locale: .de), "Leicht")
        XCTAssertEqual(LukiI18n.effortLabel(rpe: 8, locale: .de), "Genau richtig")
        XCTAssertEqual(LukiI18n.effortLabel(rpe: 9.5, locale: .de), "Max")
        XCTAssertEqual(LukiI18n.effortLabel(rpe: 7, locale: .en), "Easy")
        XCTAssertEqual(LukiI18n.effortLabel(rpe: 8, locale: .en), "Just right")
        XCTAssertEqual(LukiI18n.effortLabel(rpe: 9.5, locale: .en), "Max")
    }
}
