import Foundation
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore

/// The replace sheet's suggestions: the user's own alternatives, one-sided versions of a two-sided
/// exercise, then the best matches by movement (the same ranking as the web replace dialog,
/// `ExerciseAlternatives`).
enum ReplacementSuggestions {
    static let bestMatchLimit = 8
    static let oneSidedLimit = 3

    @MainActor
    static func sections(
        for target: SessionExerciseDto,
        store: OfflineStore,
        locale tr: SupportedLocale
    ) -> [ExercisePickerSection] {
        let catalog = store.catalog
        let own = target.alternativeExerciseIds.compactMap { id in catalog.first { $0.id == id } }
        let sessionIds = Set(store.activeSession?.exercises.compactMap(\.exerciseId) ?? [])
        let targetExercise = target.exerciseId.flatMap { id in catalog.first { $0.id == id } }
        let exclude = sessionIds.union(own.map(\.id))
        let popular = Set(ExerciseSearchData.bundled.coreExerciseIds)
        // A two-sided exercise gets its one-sided versions first; they are left out of the best matches.
        let oneSided = targetExercise.map { exercise in
            exercise.laterality == .BILATERAL
                ? ExerciseAlternatives.rank(
                    target: exercise,
                    catalog: catalog,
                    historySessions: store.historySessions,
                    excludeIds: exclude,
                    popularIds: popular,
                    preferLaterality: .UNILATERAL,
                    limit: oneSidedLimit
                ).filter { $0.reasons.contains(.UNILATERAL_VARIANT) }
                : []
        } ?? []
        let best = targetExercise.map { exercise in
            ExerciseAlternatives.rank(
                target: exercise,
                catalog: catalog,
                historySessions: store.historySessions,
                excludeIds: exclude.union(oneSided.map(\.exercise.id)),
                popularIds: popular,
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
                id: "oneSided",
                title: tr("One side at a time"),
                items: oneSided.map {
                    .init(exercise: $0.exercise, detail: AlternativeReasonFormatter.line(for: $0, locale: tr))
                }
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
