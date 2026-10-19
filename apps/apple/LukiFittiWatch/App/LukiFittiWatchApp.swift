import SwiftUI
import Observation
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiStore
import LukiFittiHealth
import LukiFittiWatchSync

@MainActor
@Observable
public final class WatchWorkoutViewModel {
    public let store: OfflineStore
    public let healthCoordinator: HealthKitWorkoutCoordinator
    public let watchSyncCoordinator: WatchSyncCoordinator

    public var currentExerciseIndex: Int = 0
    public var activePageTab: Int = 2 // Defaults to Page 2 (Center) when a workout starts
    public var completedSummarySession: WorkoutSessionDto?
    public var showingChangeExerciseSheet: Bool = false
    public var showingEditSetSheet: Bool = false

    public init(
        store: OfflineStore = OfflineStore(),
        healthCoordinator: HealthKitWorkoutCoordinator = HealthKitWorkoutCoordinator(),
        watchSyncCoordinator: WatchSyncCoordinator = WatchSyncCoordinator()
    ) {
        self.store = store
        self.healthCoordinator = healthCoordinator
        self.watchSyncCoordinator = watchSyncCoordinator

        self.watchSyncCoordinator.onContextReceived = { [weak self] payload in
            self?.applyWatchContext(payload)
        }
        self.watchSyncCoordinator.onActiveSessionReceived = { [weak self] incoming in
            self?.mergeIncomingActiveSession(incoming)
        }
        self.watchSyncCoordinator.onMutationReceived = { [weak self] packet in
            guard let self, let active = self.store.activeSession else { return }
            let merged = WatchSyncMerger.applyMutation(
                packet,
                to: active,
                lastAppliedTimestamps: &self.watchSyncCoordinator.lastAppliedTimestamps
            )
            self.store.saveActiveSession(merged)
        }
        syncWithCompanionAndServer()
    }

    public func syncWithCompanionAndServer() {
        if let payload = watchSyncCoordinator.pullLatestContextIfAvailable() {
            applyWatchContext(payload)
        }
        if let sharedActive = watchSyncCoordinator.pullSharedActiveSessionIfAvailable() {
            mergeIncomingActiveSession(sharedActive)
        }
        Task {
            await store.refreshFromServerAfterAuth()
        }
    }

    private func mergeIncomingActiveSession(_ incoming: WorkoutSessionDto?) {
        guard let incoming else { return }
        if let current = store.activeSession,
           current.clientSessionId == incoming.clientSessionId,
           current.version > incoming.version {
            return
        }
        store.saveActiveSession(incoming)
    }

    private func applyWatchContext(_ payload: WatchContextPayload) {
        if !payload.catalog.isEmpty {
            store.saveCatalog(payload.catalog)
        }
        store.saveWorkoutsOverview(folders: payload.folders, unfiledTemplates: payload.unfiledTemplates)
        store.saveStretchingRoutines(payload.stretchingRoutines)
        if !payload.historySessions.isEmpty {
            store.saveHistorySessionsList(payload.historySessions)
        }
        store.preferences = payload.preferences
        if let user = payload.currentUser {
            store.saveAuthenticatedUser(user)
        }
        if let tokens = payload.authTokens {
            try? store.apiClient.tokenStore.saveTokens(tokens, userId: payload.currentUser?.id)
        }
    }

    public func startWorkout(from template: WorkoutTemplateDto) {
        let session = SessionCalculator.createOfflineSessionFromTemplate(
            template: template,
            catalog: store.catalog,
            userId: store.currentUser?.id ?? "local-user",
            weightUnit: store.preferences.weightUnit,
            sourceDevice: .APPLE_WATCH,
            historySessions: store.historySessions
        )
        completedSummarySession = nil
        currentExerciseIndex = 0
        activePageTab = 2
        store.saveActiveSession(session)
        store.enqueueSessionSync(session)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
        Task {
            _ = await healthCoordinator.requestAuthorization()
            await healthCoordinator.startWorkout(sessionType: .STRENGTH)
            await store.flushSyncQueue()
        }
    }

    public func startStretchingWorkout(from routine: StretchingRoutineDto) {
        let session = SessionCalculator.createOfflineSessionFromStretchingRoutine(
            routine: routine,
            catalog: store.catalog,
            userId: store.currentUser?.id ?? "local-user",
            weightUnit: store.preferences.weightUnit,
            sourceDevice: .APPLE_WATCH
        )
        completedSummarySession = nil
        currentExerciseIndex = 0
        activePageTab = 2
        store.saveActiveSession(session)
        store.enqueueSessionSync(session)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
        Task {
            _ = await healthCoordinator.requestAuthorization()
            await healthCoordinator.startWorkout(sessionType: .STRETCHING)
            await store.flushSyncQueue()
        }
    }

    public func tapCompleteCurrentSetOrSkipRest() {
        guard var session = store.activeSession else { return }

        // If rest timer is running, tapping the ring skips rest and records rest-end HR recovery
        let restStatus = SessionCalculator.computeRemainingRestSeconds(session: session)
        if restStatus.isRunning || restStatus.isPaused {
            let recoveryBpm = healthCoordinator.snapshotRestEndHeartRate()
            let exIdx = min(max(0, currentExerciseIndex), max(0, session.exercises.count - 1))
            if !session.exercises.isEmpty,
               let lastCompletedSetIdx = session.exercises[exIdx].sets.lastIndex(where: \.completed) {
                session.exercises[exIdx].sets[lastCompletedSetIdx].restEndHeartRateBpm = recoveryBpm
            }
            session.restTimerEndsAt = nil
            session.restTimerDurationSec = nil
            session.restTimerPausedRemSec = nil
            session.version += 1
            store.saveActiveSession(session)
            return
        }

        let exIdx = min(max(0, currentExerciseIndex), max(0, session.exercises.count - 1))
        guard !session.exercises.isEmpty else { return }
        guard let nextSetIdx = session.exercises[exIdx].sets.firstIndex(where: { !$0.completed }) else {
            // Advance to next exercise if all sets on current exercise are complete
            if currentExerciseIndex + 1 < session.exercises.count {
                currentExerciseIndex += 1
            }
            return
        }

        var set = session.exercises[exIdx].sets[nextSetIdx]
        set.completed = true
        set.completedAt = ISO8601DateFormatter().string(from: Date())
        let (avgHr, peakHr) = healthCoordinator.snapshotCompletedSetTelemetry()
        if let avgHr { set.avgHeartRateBpm = avgHr }
        if let peakHr { set.peakHeartRateBpm = peakHr }
        session.exercises[exIdx].sets[nextSetIdx] = set

        let allDone = session.exercises[exIdx].sets.allSatisfy(\.completed)
        session.exercises[exIdx].status = allDone ? .COMPLETED : .IN_PROGRESS

        let restSec = session.exercises[exIdx].restSeconds
        if restSec > 0 {
            session.restTimerDurationSec = restSec
            session.restTimerEndsAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(TimeInterval(restSec)))
            session.restTimerPausedRemSec = nil
        } else {
            // Superset (0s rest): immediately advance to paired superset exercise
            session.restTimerEndsAt = nil
            session.restTimerDurationSec = nil
            session.restTimerPausedRemSec = nil
            if currentExerciseIndex + 1 < session.exercises.count {
                currentExerciseIndex += 1
            }
        }

        if allDone && restSec > 0 && currentExerciseIndex + 1 < session.exercises.count {
            currentExerciseIndex += 1
        }

        session.version += 1
        let recalculated = SessionCalculator.recalculateSessionTotals(session)
        store.saveActiveSession(recalculated)
        store.enqueueSessionSync(recalculated)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(recalculated)

        let packet = SessionMutationPacket(
            clientSessionId: recalculated.clientSessionId,
            clientExerciseId: session.exercises[exIdx].clientExerciseId,
            clientSetId: set.clientSetId,
            weight: set.weight,
            reps: set.reps,
            rpe: set.rpe,
            completed: true,
            avgHeartRateBpm: set.avgHeartRateBpm,
            peakHeartRateBpm: set.peakHeartRateBpm,
            restEndHeartRateBpm: set.restEndHeartRateBpm,
            restTimerEndsAt: recalculated.restTimerEndsAt,
            restTimerDurationSec: recalculated.restTimerDurationSec,
            newVersion: recalculated.version
        )
        watchSyncCoordinator.broadcastSetMutation(packet)

        Task { await store.flushSyncQueue() }
    }

    public func togglePause() {
        guard var session = store.activeSession else { return }
        if session.status == .PAUSED {
            session.status = .IN_PROGRESS
            session.pausedAt = nil
            healthCoordinator.resumeWorkout()
        } else {
            session.status = .PAUSED
            session.pausedAt = ISO8601DateFormatter().string(from: Date())
            healthCoordinator.pauseWorkout()
        }
        session.version += 1
        store.saveActiveSession(session)
        store.enqueueSessionSync(session)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
        activePageTab = 2
        Task { await store.flushSyncQueue() }
    }

    public func finishWorkout() async {
        guard var session = store.activeSession else { return }
        let nowIso = ISO8601DateFormatter().string(from: Date())
        session.status = .COMPLETED
        session.completedAt = nowIso
        session.restTimerEndsAt = nil
        session.restTimerDurationSec = nil
        session.restTimerPausedRemSec = nil

        let hkMetrics = await healthCoordinator.finishWorkout(clientSessionId: session.clientSessionId)
        session.healthKitWorkoutUuid = hkMetrics.healthKitWorkoutUuid
        if hkMetrics.activeCaloriesKcal > 0 {
            session.activeCaloriesKcal = hkMetrics.activeCaloriesKcal
            session.totalCaloriesKcal = hkMetrics.totalCaloriesKcal
        }
        if let avgHr = hkMetrics.avgHeartRateBpm { session.avgHeartRateBpm = avgHr }
        if let maxHr = hkMetrics.maxHeartRateBpm { session.maxHeartRateBpm = maxHr }
        if let minHr = hkMetrics.minHeartRateBpm { session.minHeartRateBpm = minHr }
        if !hkMetrics.heartRateSamples.isEmpty {
            session.heartRateSamples = hkMetrics.heartRateSamples
        }
        session.version += 1

        let finalized = SessionCalculator.recalculateSessionTotals(session)
        completedSummarySession = finalized
        store.saveActiveSession(nil)
        store.saveHistorySession(finalized)
        store.enqueueSessionSync(finalized)
        watchSyncCoordinator.transferCompletedStandaloneSession(finalized)
        await store.flushSyncQueue()
    }
}

@main
public struct LukiFittiWatchApp: App {
    @State private var viewModel = WatchWorkoutViewModel()

    public init() {}

    public var body: some Scene {
        WindowGroup {
            WatchRootContainerView(viewModel: viewModel)
                .preferredColorScheme(.dark)
        }
    }
}

public struct WatchRootContainerView: View {
    @Bindable public var viewModel: WatchWorkoutViewModel
    @Environment(\.scenePhase) private var scenePhase

    public init(viewModel: WatchWorkoutViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        Group {
            if let summary = viewModel.completedSummarySession {
                WatchWorkoutSummaryView(session: summary) {
                    viewModel.completedSummarySession = nil
                }
            } else if viewModel.store.activeSession != nil {
                WatchActiveWorkoutView(viewModel: viewModel)
            } else {
                WatchHomeView(viewModel: viewModel)
            }
        }
        .onAppear {
            viewModel.syncWithCompanionAndServer()
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                viewModel.syncWithCompanionAndServer()
            }
        }
    }
}
