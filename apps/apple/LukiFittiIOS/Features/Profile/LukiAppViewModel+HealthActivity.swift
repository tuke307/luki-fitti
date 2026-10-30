import Foundation
import LukiFittiModels
import LukiFittiDomain
import LukiFittiStore
import LukiFittiHealth

/// Two-way Apple Health activity sync: finished gym sessions are saved as workouts, and daily
/// active energy plus workouts from other apps (Strava, Garmin, …) feed the Food tab's burn.
extension LukiAppViewModel {
    /// Whether Profile → Health details should offer the "Connect Apple Health" button.
    var isAppleHealthAvailable: Bool { activitySync.isAvailable }

    /// Asks for every Apple Health type LukiFitti uses in one sheet, then syncs right away.
    func connectAppleHealthActivity() async {
        await activitySync.requestAuthorization()
        if !bodyMassSync.hasRequestedAuthorization {
            // Body mass was part of the sheet above, so this only records that it was asked.
            await bodyMassSync.requestAuthorization()
        }
        await syncBodyWeight()
        await syncHealthActivity(force: true)
    }

    /// Imports Apple Health activity changes (throttled unless `force`) and refreshes the
    /// server view used by the Food tab.
    func syncHealthActivity(force: Bool = false) async {
        guard isSignedIn else { return }
        let activity = activity
        let imported = await activitySync.importChanges(force: force) { payload in
            await activity.importActivity(payload)
        }
        await activity.refresh(isSignedIn: true, force: imported || force)
    }

    /// Saves (or replaces) the Apple Health workout for a finished session and stores its UUID.
    func exportWorkoutToHealth(clientSessionId: String) async {
        guard workoutExport.canWrite,
              let session = store.historySessions.first(where: { $0.clientSessionId == clientSessionId })
        else { return }
        let weight = bodyWeightKg(for: session)
        guard let uuid = await workoutExport.export(session, bodyWeightKg: weight) else { return }
        // Re-read: the session may have changed while HealthKit was saving.
        guard var latest = store.historySessions.first(where: { $0.clientSessionId == clientSessionId }),
              latest.healthKitWorkoutUuid != uuid else { return }
        latest.healthKitWorkoutUuid = uuid
        latest.version += 1
        store.saveHistorySession(latest)
        store.enqueueSessionSync(latest)
        if completedSummarySession?.clientSessionId == clientSessionId {
            completedSummarySession = latest
        }
        await store.flushSyncQueue()
    }

    /// Removes a finished workout from history and the Apple Health workout LukiFitti saved for it.
    func deleteHistorySession(_ session: WorkoutSessionDto) {
        store.deleteHistorySession(clientSessionId: session.clientSessionId)
        let clientSessionId = session.clientSessionId
        Task { await workoutExport.deleteExported(clientSessionId: clientSessionId) }
    }

    /// Forgets imported activity on sign-out / account deletion.
    func clearHealthActivityData() {
        activity.clear()
        activitySync.resetAnchors()
    }
}
