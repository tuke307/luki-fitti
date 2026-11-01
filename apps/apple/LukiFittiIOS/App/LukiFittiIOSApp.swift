import SwiftUI
import Observation
import UserNotifications
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiAPI
import LukiFittiStore
import LukiFittiHealth
import LukiFittiWatchSync
import LukiFittiLiveActivity

public enum LukiMainTab: String, CaseIterable, Sendable {
    case home
    case workouts
    case session
    case nutrition
    case diary
    case exercises
    case profile
}

@MainActor
@Observable
public final class LukiAppViewModel {
    public let store: OfflineStore
    public let nutrition: NutritionStore
    public let bodyWeight: BodyWeightStore
    public let bodyMassSync: BodyMassHealthSync
    /// Apple Health activity (daily active energy + workouts from other apps) for the Food tab.
    public let activity: HealthActivityStore
    public let activitySync: ActivityHealthSync
    public let workoutExport: WorkoutHealthExport
    public let healthCoordinator: HealthKitWorkoutCoordinator
    public let watchSyncCoordinator: WatchSyncCoordinator
    private let watchAuthHandoff = WatchAuthHandoffProvider()
    private let liveActivity = WorkoutLiveActivityController()

    public var selectedTab: LukiMainTab = .home
    public var completedSummarySession: WorkoutSessionDto?
    public var showSyncConflictDialog: Bool = false
    public var deepLinkTokenType: String?
    public var deepLinkToken: String?
    /// Pushes the weight screen on the Today tab (card, deep link, reminder tap).
    public var isWeightPresented = false
    /// Serializes weigh-in reminder rescheduling so overlapping calls can't interleave.
    var reminderTask: Task<Void, Never>?

    /// App language from the in-app preference (System / English / Deutsch).
    public var locale: SupportedLocale { SupportedLocale.resolve(store.preferences.language) }

    public init(
        store: OfflineStore = OfflineStore(),
        healthCoordinator: HealthKitWorkoutCoordinator = HealthKitWorkoutCoordinator(),
        watchSyncCoordinator: WatchSyncCoordinator = WatchSyncCoordinator(),
        bodyMassSync: BodyMassHealthSync = BodyMassHealthSync(),
        activitySync: ActivityHealthSync = ActivityHealthSync(),
        workoutExport: WorkoutHealthExport = WorkoutHealthExport()
    ) {
        self.store = store
        self.nutrition = NutritionStore(apiClient: store.apiClient, storageDirectory: store.storageDirectoryURL)
        self.bodyWeight = BodyWeightStore(apiClient: store.apiClient, storageDirectory: store.storageDirectoryURL)
        self.bodyMassSync = bodyMassSync
        self.activity = HealthActivityStore(apiClient: store.apiClient, storageDirectory: store.storageDirectoryURL)
        self.activitySync = activitySync
        self.workoutExport = workoutExport
        self.healthCoordinator = healthCoordinator
        self.watchSyncCoordinator = watchSyncCoordinator

        self.store.onOverviewOrAuthChanged = { [weak self] in
            self?.pushContextToWatch()
        }
        // Pushes before WatchConnectivity finishes activating are dropped; resend once it's ready.
        self.watchSyncCoordinator.onActivated = { [weak self] in
            self?.pushContextToWatch()
        }
        self.watchSyncCoordinator.onContextRequested = { [weak self] in
            self?.pushContextToWatch()
        }
        self.watchSyncCoordinator.onAuthRequested = { [weak self] in
            guard let self, self.store.currentUser != nil else { return }
            self.watchAuthHandoff.requestNewHandoff()
            self.pushContextToWatch()
        }
        self.watchSyncCoordinator.onCounterpartInstalled = { [weak self] in
            self?.pushContextToWatch()
        }
        self.watchSyncCoordinator.onSessionDiscarded = { [weak self] clientSessionId in
            self?.discardWatchSession(clientSessionId: clientSessionId)
        }
        self.watchSyncCoordinator.onMutationReceived = { [weak self] packet in
            guard let self, let active = self.store.activeSession else { return }
            let merged = WatchSyncMerger.applyMutation(
                packet,
                to: active,
                lastAppliedTimestamps: &self.watchSyncCoordinator.lastAppliedTimestamps
            )
            self.store.saveActiveSession(merged)
            self.store.enqueueSessionSync(merged)
            Task { await self.store.flushSyncQueue() }
        }
        self.watchSyncCoordinator.onActiveSessionReceived = { [weak self] incoming in
            self?.mergeIncomingWatchActiveSession(incoming)
        }
        self.watchSyncCoordinator.onCompletedSessionReceived = { [weak self] completed in
            self?.mergeIncomingWatchCompletedSession(completed)
        }
        WorkoutLiveActivityActions.addRest = { [weak self] in self?.adjustRestTimer(deltaSeconds: 15) }
        WorkoutLiveActivityActions.skipRest = { [weak self] in self?.skipRestTimer() }
        pushContextToWatch()
        LukiNotificationCenterDelegate.shared.attach(self)
        pullFromWatchAndServer()
    }

    /// Mirrors the active session onto the Lock Screen and Dynamic Island.
    public func syncLiveActivity() {
        liveActivity.sync(
            session: store.activeSession,
            heartRate: healthCoordinator.currentHeartRateBpm,
            locale: locale
        )
    }

    public func pullFromWatchAndServer() {
        if let sharedActive = watchSyncCoordinator.pullSharedActiveSessionIfAvailable() {
            mergeIncomingWatchActiveSession(sharedActive)
        }
        if let sharedCompleted = watchSyncCoordinator.pullSharedCompletedSessionIfAvailable() {
            mergeIncomingWatchCompletedSession(sharedCompleted)
        }
        Task {
            if store.currentUser != nil {
                await store.refreshFromServerAfterAuth()
            } else {
                await store.flushSyncQueue()
            }
            await syncBodyWeight()
            await syncHealthActivity()
        }
    }

    private func mergeIncomingWatchActiveSession(_ incoming: WorkoutSessionDto?) {
        guard let incoming else { return }
        if let current = store.activeSession,
           current.clientSessionId == incoming.clientSessionId,
           current.version > incoming.version {
            return
        }
        store.saveActiveSession(incoming)
        store.enqueueSessionSync(incoming)
        Task { await store.flushSyncQueue() }
    }

    private func mergeIncomingWatchCompletedSession(_ incoming: WorkoutSessionDto) {
        // Deleted here (or discarded on the Watch) already: a late or re-sent copy must not return.
        guard !store.isDeleted(clientSessionId: incoming.clientSessionId) else { return }
        var completed = incoming
        // The watch doesn't know the Apple Health workout this iPhone saved; keep it.
        if completed.healthKitWorkoutUuid == nil {
            completed.healthKitWorkoutUuid = store.historySessions
                .first { $0.clientSessionId == completed.clientSessionId }?.healthKitWorkoutUuid
        }
        if store.activeSession?.clientSessionId == completed.clientSessionId {
            store.saveActiveSession(nil)
        }
        store.saveHistorySession(completed)
        store.enqueueSessionSync(completed)
        let needsHealthExport = completed.healthKitWorkoutUuid == nil
        let clientSessionId = completed.clientSessionId
        Task {
            await store.flushSyncQueue()
            if needsHealthExport {
                await exportWorkoutToHealth(clientSessionId: clientSessionId)
            }
        }
    }

    /// Sends workouts and sign-in to the Watch. The Watch gets its own session (minted via
    /// `createDeviceSession`), never this iPhone's tokens, so both can rotate independently.
    public func pushContextToWatch() {
        guard let userId = store.currentUser?.id else {
            watchAuthHandoff.clear()
            sendContextToWatch(handoff: nil)
            return
        }
        let handoff = watchAuthHandoff.handoff(for: userId)
        sendContextToWatch(handoff: handoff)
        guard store.apiClient.isAuthenticated(),
              watchSyncCoordinator.canDeliverToWatch,
              !watchAuthHandoff.isMinting,
              watchAuthHandoff.needsMint(for: userId) else { return }
        let apiClient = store.apiClient
        let mint = watchAuthHandoff.mint(
            userId: userId,
            isStillSignedIn: { [weak self] id in
                guard let self else { return false }
                return self.store.currentUser?.id == id && self.store.apiClient.isAuthenticated()
            },
            using: { try await apiClient.createDeviceSession(deviceLabel: "watch") }
        )
        Task { [weak self] in
            if await mint.value != nil { self?.pushContextToWatch() }
        }
    }

    private func sendContextToWatch(handoff: WatchAuthHandoff?) {
        watchSyncCoordinator.pushApplicationContextToWatch(
            catalog: store.catalog,
            folders: store.folders,
            unfiledTemplates: store.unfiledTemplates,
            stretchingRoutines: store.stretchingRoutines,
            historySessions: store.historySessions,
            preferences: store.preferences,
            currentUser: store.currentUser,
            authTokens: handoff?.tokens,
            authHandoffId: handoff?.id,
            activeSession: store.activeSession,
            deletedSessionIds: store.deletedSessionIds
        )
    }

    public func handleUniversalLink(_ url: URL) {
        // lukifitti://weight opens the weigh-in screen.
        if url.scheme?.lowercased() == "lukifitti", url.host?.lowercased() == "weight" {
            openWeight()
            return
        }
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true),
              let token = components.queryItems?.first(where: { $0.name == "token" })?.value else {
            return
        }
        let routeTarget = [components.host, components.path].compactMap { $0 }.joined(separator: "/")
        if routeTarget.contains("verify-email") {
            deepLinkTokenType = "verify-email"
            deepLinkToken = token
            selectedTab = .profile
            Task {
                if let user = try? await store.apiClient.verifyEmail(token: token) {
                    store.saveAuthenticatedUser(user)
                    await store.refreshFromServerAfterAuth()
                    deepLinkTokenType = nil
                    deepLinkToken = nil
                }
            }
        } else if routeTarget.contains("reset-password") {
            deepLinkTokenType = "reset-password"
            deepLinkToken = token
            selectedTab = .profile
        } else if routeTarget.contains("delete-account") {
            deepLinkTokenType = "delete-account"
            deepLinkToken = token
            selectedTab = .profile
        }
    }

    public func startSession(from template: WorkoutTemplateDto, sourceDevice: SessionSourceDevice = .IPHONE) {
        let session = SessionCalculator.createOfflineSessionFromTemplate(
            template: template,
            catalog: store.catalog,
            userId: store.currentUser?.id ?? "local-user",
            weightUnit: store.preferences.weightUnit,
            sourceDevice: sourceDevice,
            historySessions: store.historySessions
        )
        completedSummarySession = nil
        store.saveActiveSession(session)
        store.enqueueSessionSync(session)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
        selectedTab = .session
        Task {
            await healthCoordinator.startWorkout(sessionType: .STRENGTH)
            await store.flushSyncQueue()
        }
    }

    public func startStretchingSession(from routine: StretchingRoutineDto, sourceDevice: SessionSourceDevice = .IPHONE) {
        let session = SessionCalculator.createOfflineSessionFromStretchingRoutine(
            routine: routine,
            catalog: store.catalog,
            userId: store.currentUser?.id ?? "local-user",
            weightUnit: store.preferences.weightUnit,
            sourceDevice: sourceDevice
        )
        completedSummarySession = nil
        store.saveActiveSession(session)
        store.enqueueSessionSync(session)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
        selectedTab = .session
        Task {
            await healthCoordinator.startWorkout(sessionType: .STRETCHING)
            await store.flushSyncQueue()
        }
    }

    public func toggleCompleteSet(clientExerciseId: String, clientSetId: String) {
        guard var session = store.activeSession else { return }
        guard let exIdx = session.exercises.firstIndex(where: { $0.clientExerciseId == clientExerciseId }),
              let setIdx = session.exercises[exIdx].sets.firstIndex(where: { $0.clientSetId == clientSetId }) else {
            return
        }

        var set = session.exercises[exIdx].sets[setIdx]
        set.completed.toggle()
        if set.completed {
            set.completedAt = ISO8601DateFormatter().string(from: Date())
            let (avgHr, peakHr) = healthCoordinator.snapshotCompletedSetTelemetry()
            if let avgHr { set.avgHeartRateBpm = avgHr }
            if let peakHr { set.peakHeartRateBpm = peakHr }

            let restSec = session.exercises[exIdx].restSeconds
            if restSec > 0 {
                session.restTimerDurationSec = restSec
                session.restTimerEndsAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(TimeInterval(restSec)))
                session.restTimerPausedRemSec = nil
                scheduleRestTimerNotification(
                    seconds: restSec,
                    exerciseName: session.exercises[exIdx].exerciseNameSnapshot
                )
            } else {
                // Superset (0s rest): clear rest timer
                session.restTimerEndsAt = nil
                session.restTimerDurationSec = nil
                session.restTimerPausedRemSec = nil
                cancelRestTimerNotification()
            }
        } else {
            set.completedAt = nil
        }

        session.exercises[exIdx].sets[setIdx] = set
        let allDone = session.exercises[exIdx].sets.allSatisfy(\.completed)
        session.exercises[exIdx].status = allDone ? .COMPLETED : .IN_PROGRESS
        session.version += 1

        let recalculated = SessionCalculator.recalculateSessionTotals(session)
        store.saveActiveSession(recalculated)
        store.enqueueSessionSync(recalculated)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(recalculated)

        let packet = SessionMutationPacket(
            clientSessionId: recalculated.clientSessionId,
            clientExerciseId: clientExerciseId,
            clientSetId: clientSetId,
            weight: set.weight,
            reps: set.reps,
            rpe: set.rpe,
            completed: set.completed,
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

    public func updateSet(
        clientExerciseId: String,
        clientSetId: String,
        weight: Double? = nil,
        reps: Int? = nil,
        durationSeconds: Int? = nil,
        rpe: Double?? = nil,
        setType: SetType? = nil
    ) {
        guard var session = store.activeSession else { return }
        guard let exIdx = session.exercises.firstIndex(where: { $0.clientExerciseId == clientExerciseId }),
              let setIdx = session.exercises[exIdx].sets.firstIndex(where: { $0.clientSetId == clientSetId }) else {
            return
        }

        var set = session.exercises[exIdx].sets[setIdx]
        if let weight { set.weight = max(0, weight) }
        if let reps { set.reps = max(0, reps) }
        if let durationSeconds { set.durationSeconds = max(0, durationSeconds) }
        if let rpe { set.rpe = rpe }
        session.exercises[exIdx].sets[setIdx] = set
        if let setType {
            session.exercises[exIdx].sets = SessionCalculator.changingSetType(
                session.exercises[exIdx].sets,
                clientSetId: clientSetId,
                to: setType
            )
        }
        session.version += 1

        let recalculated = SessionCalculator.recalculateSessionTotals(session)
        store.saveActiveSession(recalculated)
        store.enqueueSessionSync(recalculated)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(recalculated)

        let packet = SessionMutationPacket(
            clientSessionId: recalculated.clientSessionId,
            clientExerciseId: clientExerciseId,
            clientSetId: clientSetId,
            weight: set.weight,
            reps: set.reps,
            rpe: set.rpe,
            completed: set.completed,
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

    public func addSetToExercise(clientExerciseId: String, setType: SetType) {
        guard var session = store.activeSession,
              let exIdx = session.exercises.firstIndex(where: { $0.clientExerciseId == clientExerciseId }) else {
            return
        }
        let existingSets = session.exercises[exIdx].sets
        let lastSet = existingSets.last
        let newSet = SessionSetDto(
            sessionExerciseId: clientExerciseId,
            setNumber: existingSets.count + 1,
            setType: setType,
            weight: lastSet?.weight ?? session.exercises[exIdx].targetWeight ?? 40,
            weightUnit: session.weightUnit,
            reps: lastSet?.reps ?? session.exercises[exIdx].targetRepsMin ?? 10,
            durationSeconds: session.exercises[exIdx].targetDurationSeconds
        )
        session.exercises[exIdx].sets.append(newSet)
        session.version += 1
        let recalculated = SessionCalculator.recalculateSessionTotals(session)
        store.saveActiveSession(recalculated)
        store.enqueueSessionSync(recalculated)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(recalculated)
        Task { await store.flushSyncQueue() }
    }

    public func removeSetFromExercise(clientExerciseId: String, clientSetId: String) {
        guard var session = store.activeSession,
              let exIdx = session.exercises.firstIndex(where: { $0.clientExerciseId == clientExerciseId }) else {
            return
        }
        session.exercises[exIdx].sets.removeAll { $0.clientSetId == clientSetId }
        for idx in session.exercises[exIdx].sets.indices {
            session.exercises[exIdx].sets[idx].setNumber = idx + 1
        }
        session.version += 1
        let recalculated = SessionCalculator.recalculateSessionTotals(session)
        store.saveActiveSession(recalculated)
        store.enqueueSessionSync(recalculated)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(recalculated)
        Task { await store.flushSyncQueue() }
    }

    public func startRestTimer(durationSeconds: Int) {
        guard var session = store.activeSession else { return }
        session.restTimerDurationSec = durationSeconds
        session.restTimerEndsAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(TimeInterval(durationSeconds)))
        session.restTimerPausedRemSec = nil
        session.version += 1
        store.saveActiveSession(session)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
        scheduleRestTimerNotification(
            seconds: durationSeconds,
            exerciseName: session.exercises.first?.exerciseNameSnapshot ?? session.workoutNameSnapshot
        )
    }

    public func adjustRestTimer(deltaSeconds: Int) {
        guard var session = store.activeSession else { return }
        let current = SessionCalculator.computeRemainingRestSeconds(session: session)
        let newRem = max(0, current.remainingSeconds + deltaSeconds)
        if newRem == 0 {
            skipRestTimer()
            return
        }
        session.restTimerDurationSec = max(current.totalSeconds, newRem)
        if current.isPaused {
            session.restTimerPausedRemSec = newRem
            session.restTimerEndsAt = nil
            cancelRestTimerNotification()
        } else {
            session.restTimerEndsAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(TimeInterval(newRem)))
            session.restTimerPausedRemSec = nil
            scheduleRestTimerNotification(
                seconds: newRem,
                exerciseName: session.exercises.first?.exerciseNameSnapshot ?? session.workoutNameSnapshot
            )
        }
        session.version += 1
        store.saveActiveSession(session)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
    }

    public func togglePauseRestTimer() {
        guard var session = store.activeSession else { return }
        let current = SessionCalculator.computeRemainingRestSeconds(session: session)
        if current.isPaused {
            session.restTimerEndsAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(TimeInterval(current.remainingSeconds)))
            session.restTimerPausedRemSec = nil
            scheduleRestTimerNotification(
                seconds: current.remainingSeconds,
                exerciseName: session.exercises.first?.exerciseNameSnapshot ?? session.workoutNameSnapshot
            )
        } else if current.isRunning {
            session.restTimerPausedRemSec = current.remainingSeconds
            session.restTimerEndsAt = nil
            cancelRestTimerNotification()
        }
        session.version += 1
        store.saveActiveSession(session)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
    }

    public func skipRestTimer() {
        guard var session = store.activeSession else { return }
        session.restTimerEndsAt = nil
        session.restTimerDurationSec = nil
        session.restTimerPausedRemSec = nil
        session.version += 1
        store.saveActiveSession(session)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
        cancelRestTimerNotification()
    }

    public func scheduleRestTimerNotification(seconds: Int, exerciseName: String) {
        guard store.preferences.notificationsEnabled, seconds > 0 else { return }
        scheduleNotification(
            identifier: "lukifitti.rest.timer",
            title: locale("Rest is over"),
            body: locale("Time for your next set of %@.", exerciseName),
            after: TimeInterval(max(1, seconds))
        )
    }

    public func cancelRestTimerNotification() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(
            withIdentifiers: ["lukifitti.rest.timer"]
        )
    }

    public func sendTestNotification() async -> Bool {
        let center = UNUserNotificationCenter.current()
        guard (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) == true else { return false }
        let content = UNMutableNotificationContent()
        content.title = locale("Rest is over")
        content.body = locale("This is how rest timer alerts will look.")
        if store.preferences.restTimerSound {
            content.sound = .default
        }
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 1, repeats: false)
        try? await center.add(UNNotificationRequest(
            identifier: LukiNotificationCenterDelegate.testNotificationIdentifier,
            content: content,
            trigger: trigger
        ))
        return true
    }

    /// Strings and preferences are resolved on the main actor before the authorization callback.
    private func scheduleNotification(identifier: String, title: String, body: String, after interval: TimeInterval) {
        let playSound = store.preferences.restTimerSound
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            if playSound {
                content.sound = .default
            }
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: interval, repeats: false)
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: identifier, content: content, trigger: trigger))
        }
    }

    public func reorderExerciseInSession(clientExerciseId: String, moveUp: Bool) {
        guard var session = store.activeSession,
              let idx = session.exercises.firstIndex(where: { $0.clientExerciseId == clientExerciseId }) else {
            return
        }
        let targetIdx = moveUp ? idx - 1 : idx + 1
        guard session.exercises.indices.contains(targetIdx) else { return }
        session.exercises.swapAt(idx, targetIdx)
        for i in session.exercises.indices {
            session.exercises[i].orderIndex = i
        }
        session.version += 1
        store.saveActiveSession(session)
        store.enqueueSessionSync(session)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
    }

    public func removeExerciseFromSession(clientExerciseId: String) {
        guard var session = store.activeSession else { return }
        session.exercises.removeAll { $0.clientExerciseId == clientExerciseId }
        for i in session.exercises.indices {
            session.exercises[i].orderIndex = i
        }
        session.version += 1
        let recalculated = SessionCalculator.recalculateSessionTotals(session)
        store.saveActiveSession(recalculated)
        store.enqueueSessionSync(recalculated)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(recalculated)
        Task { await store.flushSyncQueue() }
    }

    public func addUnplannedExerciseToSession(_ exercise: ExerciseDto) {
        guard var session = store.activeSession else { return }
        let clientExId = "sex-\(UUID().uuidString.lowercased())"
        let sets = (1...3).map { num in
            SessionSetDto(
                sessionExerciseId: clientExId,
                setNumber: num,
                setType: .WORKING,
                weight: 40,
                weightUnit: session.weightUnit,
                reps: 10
            )
        }
        var newEx = SessionExerciseDto(
            id: clientExId,
            clientExerciseId: clientExId,
            sessionId: session.clientSessionId,
            exerciseId: exercise.id,
            exerciseNameSnapshot: exercise.name,
            primaryMuscleSnapshot: exercise.primaryMuscleGroup,
            exerciseTypeSnapshot: exercise.exerciseType,
            origin: .ADDED,
            status: .IN_PROGRESS,
            orderIndex: session.exercises.count,
            plannedSets: 3,
            targetRepsMin: 8,
            targetRepsMax: 12,
            restSeconds: store.preferences.defaultRestSeconds,
            alternativeExerciseIds: exercise.alternativeExerciseIds,
            sets: sets
        )
        newEx = ProgressionEngine.applyExerciseHistoryToSessionExercise(
            newEx,
            historySessions: store.historySessions,
            catalogExercise: exercise,
            weightUnit: session.weightUnit
        )
        session.exercises.append(newEx)
        session.version += 1
        store.saveActiveSession(session)
        store.enqueueSessionSync(session)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
        focusExercise(clientExerciseId: clientExId)
    }

    /// Index of the exercise the active workout shows; survives tab switches and relaunches.
    public var focusedExerciseIndex: Int {
        guard let session = store.activeSession else { return 0 }
        return SessionCalculator.resolveFocusedExerciseIndex(
            session.exercises,
            rememberedClientExerciseId: store.focusedExerciseIds[session.clientSessionId]
        )
    }

    public func focusExercise(clientExerciseId: String) {
        guard let session = store.activeSession else { return }
        store.setFocusedExerciseId(clientExerciseId, clientSessionId: session.clientSessionId)
    }

    public func focusExercise(at index: Int) {
        guard let exercises = store.activeSession?.exercises, exercises.indices.contains(index) else { return }
        focusExercise(clientExerciseId: exercises[index].clientExerciseId)
    }

    /// Pins the exercise shown on open, so finishing its last set doesn't jump to the next one.
    public func pinFocusedExercise() {
        guard let session = store.activeSession, !session.exercises.isEmpty else { return }
        let remembered = store.focusedExerciseIds[session.clientSessionId]
        guard !session.exercises.contains(where: { $0.clientExerciseId == remembered }) else { return }
        focusExercise(at: focusedExerciseIndex)
    }

    /// Replaces an exercise in the active session, keeping its slot and pre-filling the
    /// replacement's sets from global history.
    public func substituteExerciseInSession(clientExerciseId: String, with replacement: ExerciseDto) {
        guard let session = store.activeSession else { return }
        let updated = SessionCalculator.substituteExerciseInSession(
            session: session,
            clientExerciseId: clientExerciseId,
            replacementExercise: replacement,
            historySessions: store.historySessions
        )
        store.saveActiveSession(updated)
        store.enqueueSessionSync(updated)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(updated)
    }

    public func togglePauseActiveSession() {
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
    }

    public func finishActiveSession() async {
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

        let finalized = SessionCalculator.recalculateSessionTotals(SessionCalculator.finalizeExerciseStatuses(session))
        applyFinishedSessionToTemplate(finalized)
        store.setDismissedSuggestions(nil, clientSessionId: finalized.clientSessionId)
        store.setFocusedExerciseId(nil, clientSessionId: finalized.clientSessionId)
        completedSummarySession = finalized
        store.saveActiveSession(nil)
        store.saveHistorySession(finalized)
        store.enqueueSessionSync(finalized)
        watchSyncCoordinator.transferCompletedStandaloneSession(finalized)
        await store.flushSyncQueue()
        await exportWorkoutToHealth(clientSessionId: finalized.clientSessionId)
    }

    /// The template follows what was actually done, so the next session starts from it. Signed-in
    /// users also get this from the server when the completed session syncs.
    private func applyFinishedSessionToTemplate(_ session: WorkoutSessionDto) {
        guard let templateId = session.templateId else { return }
        var folders = store.folders
        var unfiled = store.unfiledTemplates
        func update(_ template: inout WorkoutTemplateDto) -> Bool {
            guard template.id == templateId,
                  let exercises = TemplateSets.buildTemplateExercises(template: template, session: session)
            else { return false }
            template.exercises = exercises.map { ex in
                var copy = ex
                if copy.exercise == nil {
                    copy.exercise = store.catalog.first { $0.id == copy.exerciseId }
                }
                return copy
            }
            template.updatedAt = ISO8601DateFormatter().string(from: Date())
            return true
        }
        var changed = false
        for f in folders.indices {
            for t in folders[f].templates.indices where update(&folders[f].templates[t]) {
                changed = true
            }
        }
        for t in unfiled.indices where update(&unfiled[t]) {
            changed = true
        }
        if changed {
            store.saveWorkoutsOverview(folders: folders, unfiledTemplates: unfiled)
        }
    }

    /// Saves corrections to a finished workout and syncs them over the server copy, like web.
    public func updateHistoricalSession(_ session: WorkoutSessionDto) {
        var updated = session
        updated.version += 1
        let recalculated = SessionCalculator.recalculateSessionTotals(updated)
        store.saveHistorySession(recalculated)
        store.enqueueSessionSync(recalculated, forceOverwrite: true)
        pushContextToWatch()
        Task {
            await store.flushSyncQueue()
            if recalculated.healthKitWorkoutUuid != nil {
                await exportWorkoutToHealth(clientSessionId: recalculated.clientSessionId)
            }
        }
    }

    /// The Watch discarded a workout on its summary screen: drop every copy of it.
    private func discardWatchSession(clientSessionId: String) {
        if store.activeSession?.clientSessionId == clientSessionId {
            abandonActiveSession()
        }
        if let session = store.historySessions.first(where: { $0.clientSessionId == clientSessionId }) {
            deleteHistorySession(session, notifyWatch: false)
        } else {
            // Remembered as deleted so the completed copy can't arrive later; the store deletes
            // the server copy.
            store.deleteHistorySession(clientSessionId: clientSessionId)
            Task { await store.flushSyncQueue() }
        }
    }

    public func abandonActiveSession() {
        guard let session = store.activeSession else { return }
        store.saveActiveSession(nil)
        store.setDismissedSuggestions(nil, clientSessionId: session.clientSessionId)
        store.setFocusedExerciseId(nil, clientSessionId: session.clientSessionId)
        store.removeFromSyncQueue(clientSessionId: session.clientSessionId)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(nil)
        selectedTab = .workouts
    }
    public static func makeConfigured() -> LukiAppViewModel {
        let args = ProcessInfo.processInfo.arguments
        guard args.contains("--uitesting") else {
            return LukiAppViewModel()
        }
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("LukiFittiIOSUITest-\(UUID().uuidString)", isDirectory: true)
        let store = OfflineStore(storageDirectory: tempDir)
        let vm = LukiAppViewModel(store: store)

        if args.contains("--uitesting-seed-active-session"),
           let firstTemplate = store.folders.first?.templates.first {
            vm.startSession(from: firstTemplate, sourceDevice: .IPHONE)
        }

        if args.contains("--uitesting-seed-history"),
           let firstTemplate = store.folders.first?.templates.first {
            var completed = SessionCalculator.createOfflineSessionFromTemplate(
                template: firstTemplate,
                catalog: store.catalog,
                userId: "local-user",
                weightUnit: .KG,
                sourceDevice: .IPHONE
            )
            for exIdx in completed.exercises.indices {
                for sIdx in completed.exercises[exIdx].sets.indices {
                    completed.exercises[exIdx].sets[sIdx].completed = true
                }
                completed.exercises[exIdx].status = .COMPLETED
            }
            completed.status = .COMPLETED
            completed.completedAt = ISO8601DateFormatter().string(from: Date())
            completed.activeDurationSeconds = 2700
            completed = SessionCalculator.recalculateSessionTotals(completed)
            store.saveHistorySession(completed)
        }

        if args.contains("--uitesting-seed-conflict"),
           let firstTemplate = store.folders.first?.templates.first {
            let localSession = SessionCalculator.createOfflineSessionFromTemplate(
                template: firstTemplate,
                catalog: store.catalog,
                userId: "user-conflict-1",
                weightUnit: .KG,
                sourceDevice: .IPHONE
            )
            var serverConflict = localSession
            serverConflict.version = 5
            serverConflict.workoutNameSnapshot = firstTemplate.name
            store.enqueueSessionSync(localSession)
            if !store.syncQueue.isEmpty {
                store.syncQueue[0].serverConflictSession = serverConflict
                store.conflictItem = store.syncQueue[0]
                store.syncState = .CONFLICT
            }
        }

        return vm
    }
}

@main
public struct LukiFittiIOSApp: App {
    @State private var viewModel = LukiAppViewModel.makeConfigured()
    @Environment(\.scenePhase) private var scenePhase

    public init() {}

    public var body: some Scene {
        WindowGroup {
            AppShellView(viewModel: viewModel)
                .environment(\.lukiLocale, viewModel.locale)
                .onChange(of: viewModel.store.activeSession, initial: true) {
                    viewModel.syncLiveActivity()
                }
                .onOpenURL { url in
                    viewModel.handleUniversalLink(url)
                }
                .onAppear {
                    viewModel.pullFromWatchAndServer()
                }
                .onChange(of: scenePhase) { _, newPhase in
                    if newPhase == .active {
                        viewModel.pullFromWatchAndServer()
                    }
                }
        }
    }
}

public struct AppShellView: View {
    @Bindable public var viewModel: LukiAppViewModel
    @State private var contentTab: LukiMainTab = .home
    @State private var isSessionPresented = false
    @State private var isProfilePresented = false
    @Environment(\.lukiLocale) private var tr

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    private var hasSession: Bool {
        viewModel.store.activeSession != nil || viewModel.completedSummarySession != nil
    }

    public var body: some View {
        TabView(selection: $contentTab) {
            Tab(tr("Today"), systemImage: "sun.max", value: LukiMainTab.home) {
                tabRoot(title: tr("Today")) { HomeDashboardView(viewModel: viewModel) }
            }
            Tab(tr("Workouts"), systemImage: "dumbbell", value: LukiMainTab.workouts) {
                tabRoot(title: tr("Workouts")) { WorkoutsView(viewModel: viewModel) }
            }
            Tab(tr("Food"), systemImage: "fork.knife", value: LukiMainTab.nutrition) {
                tabRoot(title: tr("Food")) { NutritionView(viewModel: viewModel) }
            }
            Tab(tr("History"), systemImage: "clock.arrow.circlepath", value: LukiMainTab.diary) {
                tabRoot(title: tr("History")) { DiaryAnalyticsView(viewModel: viewModel) }
            }
            Tab(tr("Library"), systemImage: "books.vertical", value: LukiMainTab.exercises) {
                tabRoot(title: tr("Library")) { ExercisesAndStretchingView(viewModel: viewModel) }
            }
        }
        .tint(LukiColors.accent)
        .tabBarMinimizeBehavior(.onScrollDown)
        .modifier(SessionAccessoryModifier(isEnabled: hasSession) {
            SessionAccessoryView(viewModel: viewModel) { isSessionPresented = true }
        })
        .fullScreenCover(isPresented: $isSessionPresented, onDismiss: syncSelectionFromContent) {
            NavigationStack {
                ActiveSessionView(viewModel: viewModel)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button {
                                isSessionPresented = false
                            } label: {
                                Label(tr("Minimize"), systemImage: "chevron.down")
                            }
                            .accessibilityLabel(tr("Minimize workout"))
                            .accessibilityIdentifier("ios.session.minimizeButton")
                        }
                    }
            }
            .tint(LukiColors.accent)
        }
        .sheet(isPresented: $isProfilePresented, onDismiss: syncSelectionFromContent) {
            NavigationStack {
                ProfileAndAuthView(viewModel: viewModel)
                    .navigationTitle(tr("Profile"))
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button(tr("Done")) { isProfilePresented = false }
                        }
                    }
            }
            .tint(LukiColors.accent)
        }
        .onChange(of: viewModel.selectedTab, initial: true) { _, newTab in
            route(to: newTab)
        }
        .onChange(of: contentTab) { _, newTab in
            if viewModel.selectedTab != newTab, !isSessionPresented, !isProfilePresented {
                viewModel.selectedTab = newTab
            }
        }
        .alert(
            tr("Workout changed on another device"),
            isPresented: Binding(
                get: { viewModel.store.conflictItem != nil },
                set: { if !$0 { viewModel.store.conflictItem = nil } }
            )
        ) {
            if let conflict = viewModel.store.conflictItem {
                Button(tr("Use other device")) {
                    Task { await viewModel.store.resolveConflict(clientSessionId: conflict.clientSessionId, keepLocal: false) }
                }
                Button(tr("Keep this device")) {
                    Task { await viewModel.store.resolveConflict(clientSessionId: conflict.clientSessionId, keepLocal: true) }
                }
            }
        } message: {
            Text(conflictMessage(viewModel.store.conflictItem))
        }
    }

    private func conflictMessage(_ item: QueuedSessionSyncItem?) -> String {
        guard let item else { return "" }
        let local = viewModel.store.activeSession?.clientSessionId == item.clientSessionId
            ? viewModel.store.activeSession
            : nil
        let summary: (WorkoutSessionDto?) -> String = { session in
            guard let session else { return "–" }
            return tr("%d sets done · changed %@", session.totalSetsCompleted, Self.conflictTime(session.lastSyncedAt))
        }
        return [
            tr("Both this device and another one changed %@. Pick the version you want to keep.", item.payload.workoutNameSnapshot),
            "",
            tr("This device: %@", summary(local)),
            tr("Other device: %@", summary(item.serverConflictSession)),
        ].joined(separator: "\n")
    }

    private static func conflictTime(_ iso: String?) -> String {
        guard let iso, let date = ISO8601DateFormatter.lukiParse(iso) else { return "–" }
        return date.formatted(date: .omitted, time: .shortened)
    }

    /// Bridges the view model's single `selectedTab` (still used by feature views) onto the
    /// iOS 26 structure: five content tabs, the live workout as a full-screen cover and the
    /// profile as a sheet.
    private func route(to tab: LukiMainTab) {
        switch tab {
        case .session:
            isProfilePresented = false
            isSessionPresented = hasSession
            if !hasSession { viewModel.selectedTab = contentTab }
        case .profile:
            isSessionPresented = false
            isProfilePresented = true
        case .home, .workouts, .nutrition, .diary, .exercises:
            isSessionPresented = false
            isProfilePresented = false
            contentTab = tab
        }
    }

    private func syncSelectionFromContent() {
        if viewModel.selectedTab == .session || viewModel.selectedTab == .profile {
            viewModel.selectedTab = contentTab
        }
    }

    private func tabRoot<Content: View>(title: String, @ViewBuilder content: () -> Content) -> some View {
        NavigationStack {
            content()
                .navigationTitle(title)
                .toolbar {
                    ToolbarItemGroup(placement: .topBarTrailing) {
                        restTimerPill
                        if showsSyncIndicator {
                            syncIndicator
                        }
                        Button {
                            viewModel.selectedTab = .profile
                        } label: {
                            Label(
                                tr("Profile and settings"),
                                systemImage: viewModel.store.currentUser == nil ? "person.crop.circle" : "person.crop.circle.fill"
                            )
                        }
                        // Sync status stays available to VoiceOver even while the icon is hidden.
                        .accessibilityLabel(profileAccessibilityLabel)
                        .accessibilityIdentifier("ios.header.profileButton")
                    }
                }
        }
    }

    @ViewBuilder
    private var restTimerPill: some View {
        let restStatus = SessionCalculator.computeRemainingRestSeconds(session: viewModel.store.activeSession)
        if restStatus.isRunning || restStatus.isPaused {
            Button {
                viewModel.selectedTab = .session
            } label: {
                Label(LukiFormat.clock(restStatus.remainingSeconds), systemImage: "timer")
                    .labelStyle(.titleAndIcon)
                    .monospacedDigit()
            }
            .accessibilityLabel(tr("Rest %@", LukiFormat.clock(restStatus.remainingSeconds)))
            .accessibilityIdentifier("ios.header.restTimerPill")
        }
    }

    /// Quiet until it matters: the icon only appears while syncing or when the person can act on
    /// it (offline with changes, sign-in needed, conflict). The profile button carries the status
    /// for VoiceOver the rest of the time.
    private var showsSyncIndicator: Bool {
        syncNeedsAttention || (viewModel.store.currentUser != nil && viewModel.store.syncState == .SYNCING)
    }

    /// Mentions the sync state only when it isn't the quiet "synced" default.
    private var profileAccessibilityLabel: String {
        let base = tr("Profile and settings")
        let isQuiet = viewModel.store.currentUser != nil && viewModel.store.syncState == .SYNCED
        return isQuiet ? base : "\(base). \(syncBadgeTitle)"
    }

    private var syncIndicator: some View {
        Button {
            if viewModel.store.currentUser == nil || viewModel.store.needsReauthentication {
                viewModel.selectedTab = .profile
            } else {
                Task { await viewModel.store.flushSyncQueue() }
            }
        } label: {
            Image(systemName: syncSymbol)
                .foregroundStyle(syncNeedsAttention ? LukiColors.warning : .secondary)
        }
        .accessibilityLabel(syncBadgeTitle)
        .accessibilityIdentifier("ios.header.syncBadge")
    }

    private var syncNeedsAttention: Bool {
        guard viewModel.store.currentUser != nil else { return false }
        switch viewModel.store.syncState {
        case .AUTH_EXPIRED, .CONFLICT, .OFFLINE: return true
        case .SAVED_LOCALLY: return !viewModel.store.syncQueue.isEmpty
        case .SYNCED, .SYNCING: return false
        }
    }

    private var syncSymbol: String {
        if viewModel.store.currentUser == nil { return "iphone" }
        switch viewModel.store.syncState {
        case .SYNCED: return "checkmark.icloud"
        case .SYNCING: return "arrow.triangle.2.circlepath.icloud"
        case .SAVED_LOCALLY: return "icloud.and.arrow.up"
        case .CONFLICT: return "exclamationmark.icloud"
        case .AUTH_EXPIRED: return "person.crop.circle.badge.exclamationmark"
        case .OFFLINE: return "icloud.slash"
        }
    }

    private var syncBadgeTitle: String {
        if viewModel.store.currentUser == nil {
            return tr("Guest – saved on this device only")
        }
        switch viewModel.store.syncState {
        case .SYNCED: return tr("Synced")
        case .SYNCING: return tr("Syncing")
        case .SAVED_LOCALLY: return tr("Not synced yet: %d changes", viewModel.store.syncQueue.count)
        case .CONFLICT: return tr("Changed on two devices")
        case .AUTH_EXPIRED: return tr("Sign in to sync")
        case .OFFLINE: return tr("Offline. %d changes saved on this device", viewModel.store.syncQueue.count)
        }
    }
}

/// Live workout mini player shown in the tab bar's bottom accessory (iOS 26 Music-style).
struct SessionAccessoryView: View {
    @Bindable var viewModel: LukiAppViewModel
    let onOpen: () -> Void
    @Environment(\.lukiLocale) private var tr

    var body: some View {
        TimelineView(.periodic(from: .now, by: 1)) { context in
            let session = viewModel.store.activeSession
            let rest = SessionCalculator.computeRemainingRestSeconds(session: session, now: context.date)
            Button(action: onOpen) {
                HStack(spacing: 12) {
                    Circle()
                        .fill(LukiColors.accent)
                        .frame(width: 8, height: 8)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(session?.workoutNameSnapshot ?? viewModel.completedSummarySession?.workoutNameSnapshot ?? tr("Workout"))
                            .font(.subheadline.weight(.semibold))
                            .lineLimit(1)
                        Text(subtitle(session: session, rest: rest, now: context.date))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .monospacedDigit()
                    }
                    Spacer(minLength: 8)
                    Image(systemName: "chevron.up")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                }
                .padding(.horizontal, 16)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(tr("Return to workout"))
            .accessibilityValue(subtitle(session: session, rest: rest, now: context.date))
            .accessibilityIdentifier("ios.shell.sessionAccessory")
        }
    }

    private func subtitle(session: WorkoutSessionDto?, rest: RestTimerStatus, now: Date) -> String {
        guard let session else { return tr("Done") }
        let started = ISO8601DateFormatter.lukiParse(session.startedAt) ?? now
        let elapsed = session.status == .PAUSED ? session.activeDurationSeconds : max(0, Int(now.timeIntervalSince(started)))
        var text = LukiFormat.clock(elapsed)
        if rest.isRunning || rest.isPaused {
            text += " · " + tr("Rest %@", LukiFormat.clock(rest.remainingSeconds))
        }
        return text
    }
}

private struct SessionAccessoryModifier<Accessory: View>: ViewModifier {
    let isEnabled: Bool
    @ViewBuilder let accessory: () -> Accessory

    func body(content: Content) -> some View {
        if #available(iOS 26.1, *) {
            content.tabViewBottomAccessory(isEnabled: isEnabled) { accessory() }
        } else if isEnabled {
            content.tabViewBottomAccessory { accessory() }
        } else {
            content
        }
    }
}

private extension ISO8601DateFormatter {
    static func lukiParse(_ iso: String) -> Date? {
        LukiDate.parseISO(iso)
    }
}
