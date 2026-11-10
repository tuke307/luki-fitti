import Foundation
import WidgetKit
import LukiFittiModels
import LukiFittiDomain

/// Builds the widget snapshot from the app's stores and publishes it into the shared app group.
/// WidgetCenter reloads only when the payload actually changed.
enum WidgetSnapshotWriter {
    @MainActor
    static func publish(from viewModel: LukiAppViewModel) {
        let store = viewModel.store
        let iso = ISO8601DateFormatter()
        let next = WorkoutRotation.nextUp(
            folders: store.folders,
            unfiledTemplates: store.unfiledTemplates,
            historySessions: store.historySessions
        )
        let week = WorkoutRotation.sessionsDoneThisWeek(historySessions: store.historySessions)

        let dayFormatter = DateFormatter()
        dayFormatter.calendar = Calendar(identifier: .gregorian)
        dayFormatter.dateFormat = "yyyy-MM-dd"
        let totals = viewModel.nutrition.totals(on: Date())
        let nutrition = HomeWidgetSnapshot.Nutrition(
            day: dayFormatter.string(from: Date()),
            kcalEaten: Int(totals.kcal.rounded()),
            kcalGoal: store.preferences.dailyKcalGoal,
            proteinG: Int(totals.proteinG.rounded()),
            proteinGoalG: store.preferences.proteinGoalG
        )

        let snapshot = HomeWidgetSnapshot(
            generatedAt: iso.string(from: Date()),
            locale: viewModel.locale,
            nextWorkout: next.map {
                .init(templateId: $0.template.id, name: $0.template.name, exerciseCount: $0.template.exercises.count)
            },
            weekSessionsDone: week.done,
            weeklyGoal: store.preferences.weeklyGoalSessions,
            weekStartISO: iso.string(from: week.weekStart),
            nutrition: nutrition
        )
        if SharedSnapshotStore.write(snapshot) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
