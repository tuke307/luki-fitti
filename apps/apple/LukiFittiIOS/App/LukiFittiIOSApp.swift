import SwiftUI
import Observation
import LukiFittiModels
import LukiFittiDesign
import LukiFittiDomain
import LukiFittiAPI
import LukiFittiStore
import LukiFittiHealth
import LukiFittiWatchSync

public enum LukiMainTab: String, CaseIterable, Sendable {
    case home
    case workouts
    case session
    case diary
    case exercises
    case profile
}

@MainActor
@Observable
public final class LukiAppViewModel {
    public let store: OfflineStore
    public let healthCoordinator: HealthKitWorkoutCoordinator
    public let watchSyncCoordinator: WatchSyncCoordinator

    public var selectedTab: LukiMainTab = .home
    public var completedSummarySession: WorkoutSessionDto?
    public var showSyncConflictDialog: Bool = false
    public var deepLinkTokenType: String?
    public var deepLinkToken: String?

    public init(
        store: OfflineStore = OfflineStore(),
        healthCoordinator: HealthKitWorkoutCoordinator = HealthKitWorkoutCoordinator(),
        watchSyncCoordinator: WatchSyncCoordinator = WatchSyncCoordinator()
    ) {
        self.store = store
        self.healthCoordinator = healthCoordinator
        self.watchSyncCoordinator = watchSyncCoordinator

        self.store.onOverviewOrAuthChanged = { [weak self] in
            self?.pushContextToWatch()
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
        pushContextToWatch()
        pullFromWatchAndServer()
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

    private func mergeIncomingWatchCompletedSession(_ completed: WorkoutSessionDto) {
        if store.activeSession?.clientSessionId == completed.clientSessionId {
            store.saveActiveSession(nil)
        }
        store.saveHistorySession(completed)
        store.enqueueSessionSync(completed)
        Task { await store.flushSyncQueue() }
    }

    public func pushContextToWatch() {
        watchSyncCoordinator.pushApplicationContextToWatch(
            catalog: store.catalog,
            folders: store.folders,
            unfiledTemplates: store.unfiledTemplates,
            stretchingRoutines: store.stretchingRoutines,
            historySessions: store.historySessions,
            preferences: store.preferences,
            currentUser: store.currentUser,
            authTokens: store.apiClient.tokenStore.loadTokens(),
            activeSession: store.activeSession
        )
    }

    public func handleUniversalLink(_ url: URL) {
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
            } else {
                // Superset (0s rest): clear rest timer
                session.restTimerEndsAt = nil
                session.restTimerDurationSec = nil
                session.restTimerPausedRemSec = nil
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
        if let setType { set.setType = setType }
        session.exercises[exIdx].sets[setIdx] = set
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
        } else {
            session.restTimerEndsAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(TimeInterval(newRem)))
            session.restTimerPausedRemSec = nil
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
        } else if current.isRunning {
            session.restTimerPausedRemSec = current.remainingSeconds
            session.restTimerEndsAt = nil
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
    }

    public func toggleSkipExercise(clientExerciseId: String) {
        guard var session = store.activeSession,
              let exIdx = session.exercises.firstIndex(where: { $0.clientExerciseId == clientExerciseId }) else {
            return
        }
        session.exercises[exIdx].status = session.exercises[exIdx].status == .SKIPPED ? .IN_PROGRESS : .SKIPPED
        session.version += 1
        store.saveActiveSession(session)
        store.enqueueSessionSync(session)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
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

        let finalized = SessionCalculator.recalculateSessionTotals(session)
        completedSummarySession = finalized
        store.saveActiveSession(nil)
        store.saveHistorySession(finalized)
        store.enqueueSessionSync(finalized)
        watchSyncCoordinator.transferCompletedStandaloneSession(finalized)
        await store.flushSyncQueue()
    }

    public func abandonActiveSession() {
        guard let session = store.activeSession else { return }
        store.saveActiveSession(nil)
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
                .preferredColorScheme(.dark)
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

    public init(viewModel: LukiAppViewModel) {
        self.viewModel = viewModel
    }

    public var body: some View {
        VStack(spacing: 0) {
            topHeaderBar
            TabView(selection: $viewModel.selectedTab) {
                HomeDashboardView(viewModel: viewModel)
                    .tabItem { Label("Home", systemImage: "house.fill") }
                    .tag(LukiMainTab.home)

                WorkoutsView(viewModel: viewModel)
                    .tabItem { Label("Workouts", systemImage: "folder.fill") }
                    .tag(LukiMainTab.workouts)

                if viewModel.store.activeSession != nil || viewModel.completedSummarySession != nil {
                    ActiveSessionView(viewModel: viewModel)
                        .tabItem { Label("Live Gym", systemImage: "bolt.heart.fill") }
                        .tag(LukiMainTab.session)
                }

                DiaryAnalyticsView(viewModel: viewModel)
                    .tabItem { Label("Diary", systemImage: "chart.xyaxis.line") }
                    .tag(LukiMainTab.diary)

                ExercisesAndStretchingView(viewModel: viewModel)
                    .tabItem { Label("Exercises", systemImage: "dumbbell.fill") }
                    .tag(LukiMainTab.exercises)

                ProfileAndAuthView(viewModel: viewModel)
                    .tabItem { Label("Profile", systemImage: "person.crop.circle") }
                    .tag(LukiMainTab.profile)
            }
            .tint(LukiColors.neonLime)
        }
        .background(LukiColors.darkBackground)
        .alert(
            "Workout Sync Conflict Detected",
            isPresented: Binding(
                get: { viewModel.store.conflictItem != nil },
                set: { if !$0 { viewModel.store.conflictItem = nil } }
            )
        ) {
            if let conflict = viewModel.store.conflictItem {
                Button("Use Server Version") {
                    Task { await viewModel.store.resolveConflict(clientSessionId: conflict.clientSessionId, keepLocal: false) }
                }
                Button("Keep Local Workout Data") {
                    Task { await viewModel.store.resolveConflict(clientSessionId: conflict.clientSessionId, keepLocal: true) }
                }
            }
        } message: {
            Text("A newer version exists on the server. Choose which version to keep so no workout data is silently overwritten.")
        }
    }

    private var topHeaderBar: some View {
        HStack {
            Button {
                viewModel.selectedTab = .home
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "dumbbell.fill")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.black)
                        .padding(6)
                        .background(RoundedRectangle(cornerRadius: 8).fill(LukiColors.neonLime))
                    Text("LUKIFITTI")
                        .font(.system(size: 16, weight: .black, design: .rounded))
                        .foregroundStyle(.white)
                }
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ios.header.homeButton")

            Spacer()

            let restStatus = SessionCalculator.computeRemainingRestSeconds(session: viewModel.store.activeSession)
            if restStatus.isRunning || restStatus.isPaused {
                Button {
                    viewModel.selectedTab = .session
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "timer")
                        Text(String(format: "%d:%02d", restStatus.remainingSeconds / 60, restStatus.remainingSeconds % 60))
                            .monospacedDigit()
                    }
                    .font(.caption.bold())
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(LukiColors.neonLime.opacity(0.2)))
                    .foregroundStyle(LukiColors.neonLime)
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("ios.header.restTimerPill")
            }

            Button {
                if viewModel.store.currentUser == nil {
                    viewModel.selectedTab = .profile
                } else {
                    Task { await viewModel.store.flushSyncQueue() }
                }
            } label: {
                Text(syncBadgeTitle)
                    .font(.caption2.bold())
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Capsule().fill(Color.white.opacity(0.1)))
                    .foregroundStyle(.white)
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("ios.header.syncBadge")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(LukiColors.darkCard)
    }

    private var syncBadgeTitle: String {
        if viewModel.store.currentUser == nil {
            return "Guest (Local Only)"
        }
        switch viewModel.store.syncState {
        case .SYNCED: return "Synced"
        case .SYNCING: return "Syncing..."
        case .SAVED_LOCALLY: return "Saved Locally (\(viewModel.store.syncQueue.count))"
        case .CONFLICT: return "Sync Conflict"
        case .AUTH_EXPIRED: return "Sign In to Sync"
        case .OFFLINE: return "Offline (\(viewModel.store.syncQueue.count))"
        }
    }
}
