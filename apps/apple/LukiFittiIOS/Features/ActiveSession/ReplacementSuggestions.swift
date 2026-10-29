import Foundation
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// The replace sheet's suggestions: the user's own alternatives, then the best matches by movement
/// (the same ranking as the web replace dialog, `ExerciseAlternatives`).
enum ReplacementSuggestions {
    static let bestMatchLimit = 8

    @MainActor
    static func sections(
        for target: SessionExerciseDto,
        store: OfflineStore,
        locale tr: SupportedLocale
    ) -> [ExercisePickerSection] {
        let catalog = store.catalog
        let own = target.alternativeExerciseIds.compactMap { id in catalog.first { $0.id == id } }
        let sessionIds = Set(store.activeSession?.exercises.compactMap(\.exerciseId) ?? [])
        let best = target.exerciseId
            .flatMap { id in catalog.first { $0.id == id } }
            .map { exercise in
                ExerciseAlternatives.rank(
                    target: exercise,
                    catalog: catalog,
                    historySessions: store.historySessions,
                    excludeIds: sessionIds.union(own.map(\.id)),
                    popularIds: Set(ExerciseSearchData.bundled.coreExerciseIds),
                    limit: bestMatchLimit
                )
            } ?? []
        return [
            ExercisePickerSection(
                id: "yourAlternatives",
                title: tr("Your alternatives"),
                items: own.map { .init(exercise: $0, detail: LukiI18n.equipmentLabel($0.equipment, locale: tr)) },
                highlighted: true
            ),
            ExercisePickerSection(
                id: "bestMatches",
                title: tr("Best matches"),
                items: best.map {
                    .init(exercise: $0.exercise, detail: AlternativeReasonFormatter.line(for: $0, locale: tr))
                }
            ),
        ]
    }
}
