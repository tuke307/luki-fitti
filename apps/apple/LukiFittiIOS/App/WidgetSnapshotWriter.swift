import Foundation
import UIKit
import WidgetKit
import LukiFittiModels
import LukiFittiDesign
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

        // Active community raid + a rendered boss still into the group container.
        var raid: HomeWidgetSnapshot.Raid?
        if let active = viewModel.social.raids?.community, active.status == .ACTIVE {
            let boss = RaidBossCatalog.boss(slug: active.bossSlug)
            raid = HomeWidgetSnapshot.Raid(
                bossSlug: active.bossSlug,
                bossName: boss.map { viewModel.locale == .de ? $0.name.de : $0.name.en }
                    ?? active.bossSlug,
                hpFraction: active.hpFraction,
                phase: active.effectivePhase,
                endsAt: active.endsAt
            )
            if let boss, let directory = SharedSnapshotStore.containerURL(),
               let image = BossSceneView.renderImage(boss: boss, phase: active.effectivePhase),
               let data = image.pngData() {
                try? data.write(
                    to: directory.appendingPathComponent(SharedSnapshotStore.raidImageFileName),
                    options: .atomic)
            }
        }

        let snapshot = HomeWidgetSnapshot(
            generatedAt: iso.string(from: Date()),
            locale: viewModel.locale,
            nextWorkout: next.map {
                .init(templateId: $0.template.id, name: $0.template.name, exerciseCount: $0.template.exercises.count)
            },
            weekSessionsDone: week.done,
            weeklyGoal: store.preferences.weeklyGoalSessions,
            weekStartISO: iso.string(from: week.weekStart),
            nutrition: nutrition,
            raid: raid
        )
        if SharedSnapshotStore.write(snapshot) {
            WidgetCenter.shared.reloadAllTimelines()
        }
    }
}
