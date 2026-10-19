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
    }

    public func handleUniversalLink(_ url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: true),
              let token = components.queryItems?.first(where: { $0.name == "token" })?.value else {
            return
        }
        let path = components.path
        if path.contains("verify-email") {
            deepLinkTokenType = "verify-email"
            deepLinkToken = token
            selectedTab = .profile
            Task {
                if let user = try? await store.apiClient.verifyEmail(token: token) {
                    store.currentUser = user
                }
            }
        } else if path.contains("reset-password") {
            deepLinkTokenType = "reset-password"
            deepLinkToken = token
            selectedTab = .profile
        } else if path.contains("delete-account") {
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
        selectedTab = .workouts
    }
}

@main
public struct LukiFittiIOSApp: App {
    @State private var viewModel = LukiAppViewModel()

    public init() {}

    public var body: some Scene {
        WindowGroup {
            AppShellView(viewModel: viewModel)
                .preferredColorScheme(.dark)
                .onOpenURL { url in
                    viewModel.handleUniversalLink(url)
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
