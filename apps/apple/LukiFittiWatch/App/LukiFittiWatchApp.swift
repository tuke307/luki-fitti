import SwiftUI
import Observation
import WatchKit
import HealthKit
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
    /// Latest league snapshot pushed by the iPhone; nil while social is off or unloaded.
    public var socialSnapshot: SocialWatchSnapshot?
    public var showingChangeExerciseSheet: Bool = false
    public var showingEditSetSheet: Bool = false
    public var isRefreshingFromServer: Bool = false
    public var isSyncing: Bool { isRefreshingFromServer || watchSyncCoordinator.status.isWaitingForCompanion }

    public init(
        store: OfflineStore = OfflineStore(localDevice: .APPLE_WATCH),
        healthCoordinator: HealthKitWorkoutCoordinator = HealthKitWorkoutCoordinator(),
        watchSyncCoordinator: WatchSyncCoordinator = WatchSyncCoordinator()
    ) {
        self.store = store
        self.healthCoordinator = healthCoordinator
        self.watchSyncCoordinator = watchSyncCoordinator

        self.watchSyncCoordinator.onContextReceived = { [weak self] payload in
            self?.applyWatchContext(payload)
        }
        self.watchSyncCoordinator.onAuthReceived = { [weak self] auth in
            guard let self else { return }
            let wasSignedOut = self.store.currentUser == nil
            self.applyAuth(auth)
            if wasSignedOut, auth.currentUser != nil {
                Task { await self.refreshFromServer() }
            }
        }
        self.watchSyncCoordinator.onActiveSessionReceived = { [weak self] incoming in
            self?.mergeIncomingActiveSession(incoming)
        }
        self.watchSyncCoordinator.onSessionDiscarded = { [weak self] clientSessionId in
            self?.applyDeletedOnIPhone([clientSessionId])
        }
        self.watchSyncCoordinator.onMutationReceived = { [weak self] packet in
            guard let self, let active = self.store.activeSession else { return }
            let merged = WatchSyncMerger.applyMutation(
                packet,
                to: active,
                lastAppliedTimestamps: &self.watchSyncCoordinator.lastAppliedTimestamps
            )
            self.store.saveActiveSession(merged)
            let followed = SessionCalculator.followedExerciseIndex(
                previous: active,
                incoming: merged,
                currentIndex: self.currentExerciseIndex
            )
            if followed != self.currentExerciseIndex {
                self.currentExerciseIndex = followed
            }
            self.scheduleRestEndHaptic(endsAt: merged.restTimerEndsAt)
        }
        self.watchSyncCoordinator.onCompletedSessionReceived = { [weak self] completed in
            self?.mergeIncomingCompletedSession(completed)
        }
        syncWithCompanionAndServer()
    }

    public func syncWithCompanionAndServer() {
        if let payload = watchSyncCoordinator.pullLatestContextIfAvailable() {
            applyWatchContext(payload)
        }
        if let auth = watchSyncCoordinator.pullLatestAuthIfAvailable() {
            applyAuth(auth)
        }
        if let sharedActive = watchSyncCoordinator.pullSharedActiveSessionIfAvailable() {
            mergeIncomingActiveSession(sharedActive)
        }
        Task {
            await refreshFromServer()
        }
    }

    // MARK: - Set editing & rest

    /// Changes the next open set of the current exercise (weight via the Digital Crown, reps via
    /// buttons) and syncs it to the iPhone like a completed set.
    public func updateNextSet(weight: Double? = nil, repsDelta: Int = 0) {
        guard var session = store.activeSession, !session.exercises.isEmpty else { return }
        let exIdx = min(max(0, currentExerciseIndex), session.exercises.count - 1)
        guard let setIdx = session.exercises[exIdx].sets.firstIndex(where: { !$0.completed }) else { return }
        var set = session.exercises[exIdx].sets[setIdx]
        if let weight { set.weight = max(0, weight) }
        if repsDelta != 0 { set.reps = max(1, (set.reps ?? 10) + repsDelta) }
        guard set != session.exercises[exIdx].sets[setIdx] else { return }
        session.exercises[exIdx].sets[setIdx] = set
        session.version += 1

        let recalculated = SessionCalculator.recalculateSessionTotals(session)
        store.saveActiveSession(recalculated)
        store.enqueueSessionSync(recalculated)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(recalculated)
        let saved = recalculated.exercises[exIdx].sets[setIdx]
        watchSyncCoordinator.broadcastSetMutation(
            SessionMutationPacket(
                clientSessionId: recalculated.clientSessionId,
                clientExerciseId: recalculated.exercises[exIdx].clientExerciseId,
                clientSetId: saved.clientSetId,
                weight: saved.weight,
                reps: saved.reps,
                rpe: saved.rpe,
                completed: saved.completed,
                avgHeartRateBpm: saved.avgHeartRateBpm,
                peakHeartRateBpm: saved.peakHeartRateBpm,
                restEndHeartRateBpm: saved.restEndHeartRateBpm,
                restTimerEndsAt: recalculated.restTimerEndsAt,
                restTimerDurationSec: recalculated.restTimerDurationSec,
                newVersion: recalculated.version
            )
        )
        Task { await flushSyncQueue() }
    }

    /// Adds or removes rest time; at zero the rest ends.
    public func adjustRest(by deltaSeconds: Int) {
        guard var session = store.activeSession else { return }
        let current = SessionCalculator.computeRemainingRestSeconds(session: session)
        let remaining = max(0, current.remainingSeconds + deltaSeconds)
        guard remaining > 0 else { return skipRest() }
        session.restTimerDurationSec = max(current.totalSeconds, remaining)
        if current.isPaused {
            session.restTimerPausedRemSec = remaining
            session.restTimerEndsAt = nil
        } else {
            let endsAt = Date().addingTimeInterval(TimeInterval(remaining))
            session.restTimerEndsAt = ISO8601DateFormatter().string(from: endsAt)
            session.restTimerPausedRemSec = nil
            scheduleRestEndHaptic(endsAt: session.restTimerEndsAt)
        }
        session.version += 1
        store.saveActiveSession(session)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
        WKInterfaceDevice.current().play(.click)
    }

    public func skipRest() {
        guard SessionCalculator.computeRemainingRestSeconds(session: store.activeSession).isRunning
            || SessionCalculator.computeRemainingRestSeconds(session: store.activeSession).isPaused else { return }
        tapCompleteCurrentSetOrSkipRest()
    }

    /// Buzzes when the rest is over, unless the rest was changed or skipped in the meantime.
    /// Deduped by `endsAt` so re-broadcasts of the same rest don't double the haptic.
    @ObservationIgnored private var restAlertGate = RestEndAlertGate()

    private func scheduleRestEndHaptic(endsAt: String?) {
        guard let endsAt, restAlertGate.take(endsAt: endsAt),
              let date = LukiDate.parseISO(endsAt) else { return }
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(max(0, date.timeIntervalSinceNow)))
            guard let self, self.store.activeSession?.restTimerEndsAt == endsAt else { return }
            WKInterfaceDevice.current().play(.notification)
        }
    }

    // MARK: - Home

    /// The workout to suggest on the home screen — the same rule as the iOS Home tab
    /// (least recently trained, via WorkoutRotation).
    public var nextUpTemplate: WorkoutTemplateDto? {
        WorkoutRotation.nextUp(
            folders: store.folders,
            unfiledTemplates: store.unfiledTemplates,
            historySessions: store.historySessions
        )?.template
    }

    // MARK: - Summary

    /// Removes the workout that was just finished: locally, on the server and on the iPhone
    /// (including its Apple Health workout there).
    public func discardCompletedWorkout() {
        guard let session = completedSummarySession else { return }
        let clientSessionId = session.clientSessionId
        // Queues the server delete, retried on every sync until it goes through.
        store.deleteHistorySession(clientSessionId: clientSessionId)
        watchSyncCoordinator.broadcastDiscardedSession(clientSessionId: clientSessionId)
        completedSummarySession = nil
        WKInterfaceDevice.current().play(.stop)
        Task { await flushSyncQueue() }
    }

    /// The iPhone deleted finished workouts: drop them here too. The iPhone deletes the server copy.
    private func applyDeletedOnIPhone(_ clientSessionIds: [String]) {
        let ids = clientSessionIds.filter { !store.isDeleted(clientSessionId: $0) }
        guard !ids.isEmpty else { return }
        if let summaryId = completedSummarySession?.clientSessionId, ids.contains(summaryId) {
            completedSummarySession = nil
        }
        store.deleteHistorySessions(clientSessionIds: ids, deleteOnServer: false)
    }

    /// "Sync now": asks the iPhone for fresh data and reloads from the server when signed in.
    /// `silent` skips the "no answer" error for the automatic sync when the app opens.
    public func syncNow(silent: Bool = false) {
        let tr = SupportedLocale.resolve(store.preferences.language)
        watchSyncCoordinator.requestContextFromCompanion(
            silent: silent,
            notReachableMessage: tr("No answer from the iPhone. Open LukiFitti on the iPhone and try again.")
        )
        syncWithCompanionAndServer()
    }

    private func refreshFromServer() async {
        guard store.currentUser != nil, !isRefreshingFromServer else { return }
        isRefreshingFromServer = true
        defer { isRefreshingFromServer = false }
        await store.refreshFromServerAfterAuth()
        requestAuthIfNeeded()
    }

    private func mergeIncomingActiveSession(_ incoming: WorkoutSessionDto?) {
        guard let incoming else {
            // The iPhone cleared/finished/discarded its session: drop the mirror — but never let an
            // iPhone with no session wipe a workout that was started on the Watch itself.
            if store.activeSession?.sourceDevice != .APPLE_WATCH {
                store.saveActiveSession(nil)
                endHealthSessionIfIdle()
            }
            return
        }
        if let current = store.activeSession,
           current.clientSessionId == incoming.clientSessionId,
           current.version > incoming.version {
            return
        }
        let previous = store.activeSession?.clientSessionId == incoming.clientSessionId
            ? store.activeSession
            : nil
        store.saveActiveSession(incoming)
        let followed = SessionCalculator.followedExerciseIndex(
            previous: previous,
            incoming: incoming,
            currentIndex: currentExerciseIndex
        )
        if followed != currentExerciseIndex {
            currentExerciseIndex = followed
        }
        syncHealthSession(with: incoming, previousStatus: previous?.status)
        scheduleRestEndHaptic(endsAt: incoming.restTimerEndsAt)
    }

    /// The iPhone finished the shared workout: drop the mirror (which lands the UI back on Home,
    /// no summary — the user already saw it end on the iPhone) and keep the completed copy
    /// (`saveHistorySession` upserts by clientSessionId, so a later context payload can't double it).
    private func mergeIncomingCompletedSession(_ completed: WorkoutSessionDto) {
        let endedMirror = store.activeSession?.clientSessionId == completed.clientSessionId
        if endedMirror {
            store.saveActiveSession(nil)
            // A queued in-progress copy of a mirrored workout must not upload after completion.
            store.removeFromSyncQueue(clientSessionId: completed.clientSessionId)
        }
        if !store.isDeleted(clientSessionId: completed.clientSessionId) {
            store.saveHistorySession(completed)
        }
        if endedMirror, healthCoordinator.isWorkoutRunning {
            // The mirrored HealthKit session belongs to this workout — end it under its id so
            // any Watch metrics land on the completed copy (the builder is discarded, iPhone
            // stays the single Health exporter).
            Task { _ = await healthCoordinator.finishWorkout(clientSessionId: completed.clientSessionId) }
        } else {
            endHealthSessionIfIdle()
        }
    }

    /// Every path that can clear the active session funnels here so the HealthKit workout session
    /// can't leak across relaunches. `finishWorkout` is a no-op when it already ran.
    private func endHealthSessionIfIdle() {
        guard store.activeSession == nil, healthCoordinator.isWorkoutRunning else { return }
        Task { _ = await healthCoordinator.finishWorkout(clientSessionId: "idle-cleanup") }
    }

    /// Keeps the Watch's HealthKit workout session aligned with the mirrored session: started when
    /// the iPhone's session arrives, paused/resumed with its status changes.
    private func syncHealthSession(with incoming: WorkoutSessionDto, previousStatus: SessionStatus?) {
        Task {
            if !healthCoordinator.isWorkoutRunning {
                await healthCoordinator.startWorkout(
                    sessionType: incoming.sessionType,
                    startedAt: LukiDate.parseISO(incoming.startedAt) ?? Date()
                )
            }
            guard incoming.status != previousStatus else { return }
            if incoming.status == .PAUSED {
                healthCoordinator.pauseWorkout()
            } else if incoming.status == .IN_PROGRESS {
                healthCoordinator.resumeWorkout()
            }
        }
    }

    private func applyWatchContext(_ payload: WatchContextPayload) {
        if !payload.catalog.isEmpty {
            store.saveCatalog(payload.catalog)
        }
        store.saveWorkoutsOverview(folders: payload.folders, unfiledTemplates: payload.unfiledTemplates)
        store.saveStretchingRoutines(payload.stretchingRoutines)
        applyDeletedOnIPhone(payload.deletedSessionIds ?? [])
        // A signed-in iPhone sends its whole history, so an empty list means its last workout was
        // deleted. Workouts recorded here that haven't synced yet are kept.
        if payload.currentUser != nil || !payload.historySessions.isEmpty {
            store.replaceHistoryKeepingUnsynced(with: payload.historySessions)
        }
        applyAuth(WatchAuthPayload(
            preferences: payload.preferences,
            currentUser: payload.currentUser,
            authTokens: payload.authTokens,
            authHandoffId: payload.authHandoffId,
            social: payload.social
        ))
    }

    /// Tokens are saved before the user so the server refresh triggered by sign-in can use them.
    /// Only a new handoff (or a first sign-in / other account) replaces the stored tokens; re-sends
    /// of an applied one would roll back tokens this Watch has rotated since.
    private func applyAuth(_ auth: WatchAuthPayload) {
        store.preferences = auth.preferences
        if !ProcessInfo.processInfo.arguments.contains("--uitesting-seed-social") {
            socialSnapshot = auth.social
        }
        let tokenStore = store.apiClient.tokenStore
        let storedTokens = tokenStore.loadTokens()
        let decision = WatchAuthHandoffPolicy.decide(
            incomingTokens: auth.authTokens,
            incomingUserId: auth.currentUser?.id,
            incomingHandoffId: auth.authHandoffId,
            storedTokens: storedTokens,
            storedUserId: tokenStore.loadUserId() ?? store.currentUser?.id,
            lastAppliedHandoffId: UserDefaults.standard.string(forKey: Self.lastAppliedHandoffIdKey)
        )
        switch decision {
        case .apply:
            if let tokens = auth.authTokens {
                try? tokenStore.saveTokens(tokens, userId: auth.currentUser?.id)
            }
            if let id = auth.authHandoffId {
                UserDefaults.standard.set(id, forKey: Self.lastAppliedHandoffIdKey)
            }
        case .discardStored:
            tokenStore.clearTokens()
        case .keep:
            break
        }
        if let user = auth.currentUser, user != store.currentUser {
            store.saveAuthenticatedUser(user)
        }
        // A new session after a rejected one: upload what was queued meanwhile.
        if decision == .apply, storedTokens == nil, store.currentUser != nil {
            Task { await refreshFromServer() }
        }
    }

    private static let lastAppliedHandoffIdKey = "watchAuth.lastAppliedHandoffId"
    private static let authRequestInterval: TimeInterval = 60
    @ObservationIgnored private var lastAuthRequestAt: Date?

    /// Signed in but the session was rejected: ask the iPhone for a new Watch session (at most
    /// once a minute).
    private func requestAuthIfNeeded() {
        guard store.needsReauthentication else { return }
        if let last = lastAuthRequestAt, Date().timeIntervalSince(last) < Self.authRequestInterval { return }
        lastAuthRequestAt = Date()
        watchSyncCoordinator.requestAuthFromCompanion()
    }

    private func flushSyncQueue() async {
        await store.flushSyncQueue()
        requestAuthIfNeeded()
    }

    public func startWorkout(from template: WorkoutTemplateDto) {
        let session = SessionCalculator.createOfflineSessionFromTemplate(
            template: template,
            catalog: store.catalog,
            userId: store.currentUser?.id ?? "local-user",
            weightUnit: store.preferences.weightUnit,
            sourceDevice: .APPLE_WATCH,
            historySessions: store.historySessions,
            profileGoal: store.preferences.trainingGoal
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
            await flushSyncQueue()
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
            await flushSyncQueue()
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
            watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
            WKInterfaceDevice.current().play(.click)
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
        WKInterfaceDevice.current().play(.success)
        if restSec > 0 {
            session.restTimerDurationSec = restSec
            session.restTimerEndsAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(TimeInterval(restSec)))
            session.restTimerPausedRemSec = nil
            scheduleRestEndHaptic(endsAt: session.restTimerEndsAt)
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

        Task { await flushSyncQueue() }
    }

    public func togglePause() {
        guard var session = store.activeSession else { return }
        if session.status == .PAUSED {
            session.status = .IN_PROGRESS
            session.pausedAt = nil
            healthCoordinator.resumeWorkout()
            WKInterfaceDevice.current().play(.start)
        } else {
            session.status = .PAUSED
            session.pausedAt = ISO8601DateFormatter().string(from: Date())
            let started = LukiDate.parseISO(session.startedAt) ?? Date()
            session.activeDurationSeconds = max(
                session.activeDurationSeconds,
                Int(Date().timeIntervalSince(started))
            )
            healthCoordinator.pauseWorkout()
            WKInterfaceDevice.current().play(.stop)
        }
        session.version += 1
        store.saveActiveSession(session)
        store.enqueueSessionSync(session)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
        activePageTab = 2
        Task { await flushSyncQueue() }
    }

    public func finishWorkout() async {
        guard var session = store.activeSession else { return }
        let nowIso = ISO8601DateFormatter().string(from: Date())
        session.status = .COMPLETED
        session.completedAt = nowIso
        session.restTimerEndsAt = nil
        session.restTimerDurationSec = nil
        session.restTimerPausedRemSec = nil
        restAlertGate.reset()
        let started = LukiDate.parseISO(session.startedAt) ?? Date()
        session.activeDurationSeconds = max(
            60,
            session.activeDurationSeconds > 0
                ? session.activeDurationSeconds
                : Int(Date().timeIntervalSince(started))
        )

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

        let finalized = SessionCalculator.recalculateSessionTotals(SessionCalculator.finalizeExerciseStatuses(session))
        completedSummarySession = finalized
        store.saveActiveSession(nil)
        store.saveHistorySession(finalized)
        store.enqueueSessionSync(finalized)
        watchSyncCoordinator.transferCompletedStandaloneSession(finalized)
        await flushSyncQueue()
    }
    public static func makeConfigured() -> WatchWorkoutViewModel {
        let args = ProcessInfo.processInfo.arguments
        guard args.contains("--uitesting") else {
            return WatchWorkoutViewModel()
        }
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("LukiFittiWatchUITest-\(UUID().uuidString)", isDirectory: true)
        let store = OfflineStore(storageDirectory: tempDir, localDevice: .APPLE_WATCH)
        let vm = WatchWorkoutViewModel(store: store)

        if args.contains("--uitesting-seed-active-session") || args.contains("--uitesting-marketing"),
           let firstTemplate = store.folders.first?.templates.first {
            vm.startWorkout(from: firstTemplate)
        }

        if args.contains("--uitesting-seed-social") {
            vm.socialSnapshot = SocialWatchSnapshot(
                weekPoints: 340,
                arena: .GOLD,
                rank: 4,
                cohortSize: 20,
                stage: .GLOBAL,
                duel: DuelWatchSnapshot(opponentHandle: "anna", you: 340, them: 280, daysLeft: 3)
            )
        }

        // Marketing shot: fake live vitals so bpm shows without HealthKit.
        if args.contains("--uitesting-marketing"),
           let coordinator = HealthKitWorkoutCoordinator.current {
            coordinator.isWorkoutRunning = true
            coordinator.currentHeartRateBpm = 128
            coordinator.activeCaloriesKcal = 214
        }

        return vm
    }
}

/// System entry points for the Watch-owned HealthKit workout session: an iPhone launching the app
/// mid-workout (`startWatchApp`) arrives as `handle(_:)`; a relaunch during an active session
/// arrives as `handleActiveWorkoutRecovery`.
final class WatchAppDelegate: NSObject, WKApplicationDelegate {
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        let type: SessionType = workoutConfiguration.activityType == .flexibility ? .STRETCHING : .STRENGTH
        Task { @MainActor in
            guard let coordinator = HealthKitWorkoutCoordinator.current else { return }
            _ = await coordinator.requestAuthorization()
            // Start even if the active-session snapshot hasn't arrived yet — it fills in later.
            await coordinator.startWorkout(sessionType: type)
        }
    }

    func handleActiveWorkoutRecovery() {
        Task { @MainActor in
            HealthKitWorkoutCoordinator.current?.recoverActiveWorkoutSession()
        }
    }
}

@main
public struct LukiFittiWatchApp: App {
    @WKApplicationDelegateAdaptor(WatchAppDelegate.self) private var appDelegate
    @State private var viewModel = WatchWorkoutViewModel.makeConfigured()

    public init() {}

    public var body: some Scene {
        WindowGroup {
            WatchRootContainerView(viewModel: viewModel)
                .environment(\.lukiLocale, SupportedLocale.resolve(viewModel.store.preferences.language))
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
                WatchWorkoutSummaryView(
                    session: summary,
                    onDismiss: { viewModel.completedSummarySession = nil },
                    onDiscard: { viewModel.discardCompletedWorkout() }
                )
            } else if viewModel.store.activeSession != nil {
                WatchActiveWorkoutView(viewModel: viewModel)
            } else {
                WatchHomeView(viewModel: viewModel)
            }
        }
        .onAppear {
            viewModel.syncNow(silent: true)
        }
        .onChange(of: scenePhase) { _, newPhase in
            if newPhase == .active {
                viewModel.syncNow(silent: true)
            }
        }
    }
}
