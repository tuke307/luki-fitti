import SwiftUI
import Observation
import UserNotifications
import AudioToolbox
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
    /// Library tab: kept as a stable raw value for widgets/shortcuts/deep links; the shell maps
    /// it onto the Workouts tab's Library segment (social took its tab slot in PR 1).
    case exercises
    case social
    case profile
}

@MainActor
@Observable
public final class LukiAppViewModel {
    public let store: OfflineStore
    public let nutrition: NutritionStore
    public let bodyWeight: BodyWeightStore
    public let progress: ProgressPhotoStore
    public let bodyMassSync: BodyMassHealthSync
    /// Apple Health activity (daily active energy + workouts from other apps) for the Food tab.
    public let activity: HealthActivityStore
    public let activitySync: ActivityHealthSync
    public let workoutExport: WorkoutHealthExport
    public let healthCoordinator: HealthKitWorkoutCoordinator
    public let watchSyncCoordinator: WatchSyncCoordinator
    /// Social tab state (friends, inbox, invites). Only used when `socialEnabled`.
    public let social: SocialStore
    /// Anonymous screen/event analytics; disabled in DEBUG and UI-test runs.
    public let analytics: AnalyticsClient
    private let watchAuthHandoff = WatchAuthHandoffProvider()
    private let liveActivity = WorkoutLiveActivityController()

    public var selectedTab: LukiMainTab = .home
    public var completedSummarySession: WorkoutSessionDto?
    /// Set by "View in History": the summary is cleared only after the session cover finished
    /// dismissing, so it doesn't animate out as a blank screen.
    public var clearsSummaryOnDismiss = false
    public var showSyncConflictDialog: Bool = false
    public var deepLinkTokenType: String?
    public var deepLinkToken: String?
    /// Set by lukifitti://workouts?template=<id>: the Workouts tab expands that template.
    public var pendingTemplateId: String?
    /// Pushes the weight screen on the Today tab (card, deep link, reminder tap).
    public var isWeightPresented = false
    /// Legacy `exercises` tab selections land here: the Workouts tab opens its Library segment.
    public var workoutsShowLibrary = false
    /// Invite token from an `/invite/<token>` universal link, consumed by InviteAcceptSheet.
    public var pendingInviteToken: String?
    /// Serializes weigh-in reminder rescheduling so overlapping calls can't interleave.
    var reminderTask: Task<Void, Never>?

    /// App language from the in-app preference (System / English / Deutsch).
    public var locale: SupportedLocale { SupportedLocale.resolve(store.preferences.language) }

    /// Server-side rollout gate for the Social tab (beta list / global switch).
    public var socialEnabled: Bool { SocialStore.isEnabled(for: store.currentUser) }

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
        self.progress = ProgressPhotoStore(apiClient: store.apiClient, storageDirectory: store.storageDirectoryURL)
        self.progress.cloudBackupEnabled = store.preferences.progressPhotoCloudBackup
        self.bodyMassSync = bodyMassSync
        self.activity = HealthActivityStore(apiClient: store.apiClient, storageDirectory: store.storageDirectoryURL)
        self.activitySync = activitySync
        self.workoutExport = workoutExport
        self.healthCoordinator = healthCoordinator
        self.watchSyncCoordinator = watchSyncCoordinator
        self.social = SocialStore(apiClient: store.apiClient)

        #if DEBUG
        let analyticsEnabled = false
        #else
        let analyticsEnabled = !ProcessInfo.processInfo.arguments.contains("--uitesting")
        #endif
        self.analytics = AnalyticsClient(
            baseURL: store.apiClient.baseURL,
            enabled: analyticsEnabled,
            userAgent: Self.analyticsUserAgent(),
            language: { Locale.preferredLanguages.first }
        )

        self.social.onLeagueDataChanged = { [weak self] in
            self?.pushContextToWatch()
        }
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
            self.syncRestAlerts(session: merged)
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
        healthCoordinator.startObservingMirroredSessions()
        healthCoordinator.onLiveMetricsReceived = { [weak self] in
            self?.syncLiveActivityThrottled()
        }
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

    /// Live metrics arrive every ~2 s; the Dynamic Island only needs an update every 5 s.
    @ObservationIgnored private var lastLiveActivitySyncAt = Date.distantPast

    private func syncLiveActivityThrottled() {
        let now = Date()
        guard now.timeIntervalSince(lastLiveActivitySyncAt) >= 5 else { return }
        lastLiveActivitySyncAt = now
        syncLiveActivity()
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
            if socialEnabled {
                await social.refreshAll()
                await registerApnsIfAuthorized()
            }
            await syncBodyWeight()
            await syncHealthActivity()
            await progress.refresh(isSignedIn: isSignedIn)
        }
    }

    /// Turns progress-photo cloud backup on/off. `deleteRemote` also removes the stored copies.
    public func setProgressCloudBackup(_ enabled: Bool, deleteRemote: Bool = false) async {
        var prefs = store.preferences
        prefs.progressPhotoCloudBackup = enabled
        var dto = UpdatePreferencesDto()
        dto.progressPhotoCloudBackup = enabled
        _ = await savePreferences(prefs, server: dto)
        await progress.setCloudBackup(enabled, deleteRemote: deleteRemote, isSignedIn: isSignedIn)
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
        syncRestAlerts(session: incoming)
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
            deletedSessionIds: store.deletedSessionIds,
            social: social.watchSnapshot
        )
    }

#if DEBUG
    /// --uitesting only: polls Mailpit (`LUKIFITTI_MAILPIT_URL`, default localhost:8025)
    /// for a message to `to` whose body contains a `<route>?token=…` link (newest
    /// first — locale-independent, no subject matching) and follows it.
    /// --uitesting-review only: kick off a poll after the action that sends
    /// the mail (register / delete-email); the runner never leaves the app.
    func pollMailpitForReview(to: String, route: String) {
        guard ProcessInfo.processInfo.arguments.contains("--uitesting-review") else { return }
        Task { await self.pollMailpitAndFollow(to: to, route: route) }
    }

    private func pollMailpitAndFollow(to: String, route: String) async {
        guard let mailpit = URL(string: ProcessInfo.processInfo.environment["LUKIFITTI_MAILPIT_URL"]
                ?? "http://localhost:8025"),
              let regex = try? NSRegularExpression(
                  pattern: "\(NSRegularExpression.escapedPattern(for: route))\\?token=([a-fA-F0-9]+)",
                  options: [.caseInsensitive])
        else { return }
        struct Summary: Decodable { let ID: String }
        struct Result: Decodable { let messages: [Summary]? }
        struct Detail: Decodable { let HTML: String; let Text: String }

        var search = URLComponents(url: mailpit.appendingPathComponent("/api/v1/search"), resolvingAgainstBaseURL: false)!
        search.queryItems = [URLQueryItem(name: "query", value: "to:\(to)")]
        let deadline = Date().addingTimeInterval(30)
        while Date() < deadline, !Task.isCancelled {
            if let (data, _) = try? await URLSession.shared.data(from: search.url!),
               let result = try? JSONDecoder().decode(Result.self, from: data) {
                for message in (result.messages ?? []).reversed() {
                    guard let (detailData, _) = try? await URLSession.shared.data(
                            from: mailpit.appendingPathComponent("/api/v1/message/\(message.ID)")),
                          let detail = try? JSONDecoder().decode(Detail.self, from: detailData)
                    else { continue }
                    let combined = "\(detail.HTML)\n\(detail.Text)"
                    if let tokenMatch = regex.firstMatch(
                        in: combined, range: NSRange(combined.startIndex..<combined.endIndex, in: combined)),
                       let tokenRange = Range(tokenMatch.range(at: 1), in: combined) {
                        handleUniversalLink(URL(string: "lukifitti://\(route)?token=\(combined[tokenRange])")!)
                        return
                    }
                }
            }
            try? await Task.sleep(nanoseconds: 400_000_000)
        }
    }
#endif

    public func handleUniversalLink(_ url: URL) {
        // `https://app.luki-fitti.tony-luke.de/invite/<token>` universal link.
        if url.scheme?.lowercased() == "https",
           url.pathComponents.count == 3,
           url.pathComponents[1] == "invite" {
            let token = url.pathComponents[2]
            if InviteTokenValidator.isValid(token) {
                pendingInviteToken = token
                // Signed out → sign in first; AppShellView picks the token up after auth.
                if store.currentUser == nil { selectedTab = .profile }
            }
            return
        }
        if url.scheme?.lowercased() == "lukifitti" {
            switch url.host?.lowercased() {
            case "weight":
                openWeight()
                return
            case "nutrition":
                selectedTab = .nutrition
                return
            case "workouts":
                selectedTab = .workouts
                if let templateId = URLComponents(url: url, resolvingAgainstBaseURL: true)?
                    .queryItems?.first(where: { $0.name == "template" })?.value,
                    store.folders.flatMap(\.templates).contains(where: { $0.id == templateId })
                        || store.unfiledTemplates.contains(where: { $0.id == templateId }) {
                    pendingTemplateId = templateId
                }
                return
            default:
                break
            }
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
                    #if DEBUG
                    if ProcessInfo.processInfo.arguments.contains("--uitesting-review") {
                        LukiAppViewModel.seedDemoMeal(vm: self, store: store)
                    }
                    #endif
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

    /// Safari-shaped UA so Umami classifies OS/device instead of dropping the hit as a bot.
    private static func analyticsUserAgent() -> String {
        let device = UIDevice.current.userInterfaceIdiom == .pad ? "iPad" : "iPhone"
        let osName = UIDevice.current.userInterfaceIdiom == .pad ? "OS" : "iPhone OS"
        let version = UIDevice.current.systemVersion.replacingOccurrences(of: ".", with: "_")
        let shortVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
        return "Mozilla/5.0 (\(device); CPU \(osName) \(version) like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LukiFitti/\(shortVersion)"
    }

    /// "View in History" on the summary card: switches to the diary and lets the cover's
    /// onDismiss clear the summary once it has finished animating out.
    public func showSummaryInHistory() {
        clearsSummaryOnDismiss = true
        selectedTab = .diary
    }

    public func startSession(from template: WorkoutTemplateDto, sourceDevice: SessionSourceDevice = .IPHONE) {
        analytics.event(.workoutStart, ["source": .string("template")])
        let session = SessionCalculator.createOfflineSessionFromTemplate(
            template: template,
            catalog: store.catalog,
            userId: store.currentUser?.id ?? "local-user",
            weightUnit: store.preferences.weightUnit,
            sourceDevice: sourceDevice,
            historySessions: store.historySessions,
            profileGoal: store.preferences.trainingGoal
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
        analytics.event(.workoutStart, ["source": .string("stretching")])
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
                restAlertGate.reset()
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
        syncRestAlerts(session: recalculated, exerciseName: recalculated.exercises[exIdx].exerciseNameSnapshot)
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
        syncRestAlerts(session: session)
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
            restAlertGate.reset()
            cancelRestTimerNotification()
        } else {
            session.restTimerEndsAt = ISO8601DateFormatter().string(from: Date().addingTimeInterval(TimeInterval(newRem)))
            session.restTimerPausedRemSec = nil
            syncRestAlerts(session: session)
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
            syncRestAlerts(session: session)
        } else if current.isRunning {
            session.restTimerPausedRemSec = current.remainingSeconds
            session.restTimerEndsAt = nil
            restAlertGate.reset()
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
        restAlertGate.reset()
        cancelRestTimerNotification()
    }

    /// Schedules the rest-over alert pair for a new `restTimerEndsAt` — local notification for the
    /// background (skipped while the Watch buzzes itself) and a foreground haptic — deduped by the
    /// endsAt string so re-broadcasts and mutations of the same rest don't double it.
    @ObservationIgnored private var restAlertGate = RestEndAlertGate()

    private func syncRestAlerts(session: WorkoutSessionDto, exerciseName: String? = nil) {
        guard let endsAt = session.restTimerEndsAt, let date = LukiDate.parseISO(endsAt) else {
            restAlertGate.reset()
            cancelRestTimerNotification()
            return
        }
        guard restAlertGate.take(endsAt: endsAt) else { return }
        if !healthCoordinator.isWatchSessionActive {
            scheduleRestTimerNotification(
                seconds: max(1, Int(date.timeIntervalSinceNow.rounded())),
                exerciseName: exerciseName
                    ?? session.exercises.first?.exerciseNameSnapshot
                    ?? session.workoutNameSnapshot
            )
        }
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(max(0, date.timeIntervalSinceNow)))
            guard let self, self.store.activeSession?.restTimerEndsAt == endsAt else { return }
            UINotificationFeedbackGenerator().notificationOccurred(.success)
            if self.store.preferences.restTimerSound {
                AudioServicesPlaySystemSound(1054)
            }
            try? await Task.sleep(for: .milliseconds(500))
            self.syncLiveActivity()
        }
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

    /// Asks once on launch so the prompt doesn't interrupt the first rest timer mid-workout.
    public func requestNotificationPermissionIfNeeded() async {
        guard store.preferences.notificationsEnabled else { return }
        guard !ProcessInfo.processInfo.arguments.contains("--uitesting") else { return }
        let center = UNUserNotificationCenter.current()
        guard await center.notificationSettings().authorizationStatus == .notDetermined else { return }
        _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        rescheduleWeighInReminders()
    }

    /// Opens the Social tab on a specific section (push tap / deep link), like the web
    /// `parseOpenParam` — unknown targets fall back to home.
    public func openSocial(section: SocialSectionTarget?) {
        guard socialEnabled else { selectedTab = .home; return }
        social.requestedSection = section
        selectedTab = .social
    }

    /// Re-registers for APNs when permission is already granted (app launch, sign-in).
    /// Never asks for permission itself — that only happens in `requestPushPermissionAndRegister`.
    public func registerApnsIfAuthorized() async {
        guard socialEnabled, store.apiClient.isAuthenticated() else { return }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--uitesting") { return }
        #endif
        let status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
        guard status == .authorized || status == .provisional || status == .ephemeral else { return }
        await UIApplication.shared.registerForRemoteNotifications()
    }

    /// The only place that asks for push permission (onboarding button / settings toggle).
    @discardableResult
    public func requestPushPermissionAndRegister() async -> Bool {
        let center = UNUserNotificationCenter.current()
        guard (try? await center.requestAuthorization(options: [.alert, .sound, .badge])) == true else {
            return false
        }
        rescheduleWeighInReminders()
        await UIApplication.shared.registerForRemoteNotifications()
        return true
    }

    /// Removes this device's APNs registration server-side (called before sign-out).
    public func unregisterPushDevice() async {
        await ApnsPushManager.shared.unregister(apiClient: store.apiClient)
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
        // The launch-time ask is skipped under --uitesting; don't let the first
        // rest timer pop the permission alert mid-test on a fresh install.
        guard !ProcessInfo.processInfo.arguments.contains("--uitesting") else { return }
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
        // Exercises added mid-session follow the snapshot goal's band and rest.
        let goal = exercise.exerciseType == .STRETCHING ? nil : session.trainingGoalSnapshot
        let band = goal.map { TrainingGoalProfiles.repRange(for: $0, exercise: exercise) }
        let reps = band?.min ?? 10
        let sets = (1...3).map { num in
            SessionSetDto(
                sessionExerciseId: clientExId,
                setNumber: num,
                setType: .WORKING,
                weight: 40,
                weightUnit: session.weightUnit,
                reps: reps
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
            targetRepsMin: band?.min ?? 8,
            targetRepsMax: band?.max ?? 12,
            restSeconds: goal != nil
                ? TrainingGoalProfiles.resolveRestSeconds(store.preferences.defaultRestSeconds, goal: goal)
                : store.preferences.defaultRestSeconds,
            alternativeExerciseIds: exercise.alternativeExerciseIds,
            sets: sets
        )
        newEx = ProgressionEngine.applyExerciseHistoryToSessionExercise(
            newEx,
            historySessions: store.historySessions,
            catalogExercise: exercise,
            weightUnit: session.weightUnit,
            trainingGoal: goal
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
        analytics.event(.exerciseSwap)
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
            let started = LukiDate.parseISO(session.startedAt) ?? Date()
            session.activeDurationSeconds = max(
                session.activeDurationSeconds,
                Int(Date().timeIntervalSince(started))
            )
            healthCoordinator.pauseWorkout()
        }
        session.version += 1
        store.saveActiveSession(session)
        store.enqueueSessionSync(session)
        watchSyncCoordinator.broadcastActiveSessionSnapshot(session)
    }

    public func finishActiveSession() async {
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

        // Tell the Watch right away that the workout ended — the HealthKit finish below can take
        // a moment, and transferUserInfo alone queues in the background. The finalized copy with
        // metrics is sent again after; the Watch upserts by clientSessionId.
        watchSyncCoordinator.transferCompletedStandaloneSession(
            SessionCalculator.recalculateSessionTotals(SessionCalculator.finalizeExerciseStatuses(session))
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
        analytics.event(.workoutComplete, [
            "type": .string(finalized.sessionType.rawValue.lowercased()),
            "duration_bucket": .string(AnalyticsClient.durationBucket(seconds: finalized.activeDurationSeconds)),
            "sets_bucket": .string(AnalyticsClient.countBucket(finalized.totalSetsCompleted)),
        ])
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
        analytics.event(.workoutAbandon, ["type": .string(session.sessionType.rawValue.lowercased())])
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

        if args.contains("--uitesting-marketing") || args.contains("--uitesting-marketing-session") {
            // Marketing shots run in the app's own locale, not just AppleLanguages.
            if ProcessInfo.processInfo.environment["LUKIFITTI_MARKETING_LANG"] == "de" {
                store.preferences.language = .de
            }
            seedMarketingContent(vm: vm, store: store, args: args)
        }

        // App Review walkthrough: same language override, but only the AI demo meal —
        // everything else is produced live on camera.
        if args.contains("--uitesting-review") {
            if ProcessInfo.processInfo.environment["LUKIFITTI_MARKETING_LANG"] == "de" {
                store.preferences.language = .de
            }
            // The App Review video is recorded in dark mode only.
            store.preferences.theme = "dark"
            seedDemoMeal(vm: vm, store: store)
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

        if args.contains("--uitesting-seed-league-celebration") {
            seedLeagueCelebration(vm: vm, store: store)
        }

        return vm
    }

    /// `--uitesting-seed-league-celebration`: a signed-in social user whose current week
    /// carries an unseen PROMOTED result, so the celebration cover presents on open.
    /// `refreshAll` stays a no-op (apiClient is unauthenticated) so the seed survives.
    private static func seedLeagueCelebration(vm: LukiAppViewModel, store: OfflineStore) {
        store.currentUser = UserDto(
            id: "uitest-social",
            email: "uitest@lukifitti.test",
            name: "UI Tester",
            social: UserSocialDto(enabled: true, handle: "uitester", arena: .SILVER)
        )
        vm.social.profile = SocialProfileDto(handle: "uitester", name: "UI Tester")
        vm.social.league = LeagueCurrentDto(
            weekKey: "2026-W45",
            stage: .GLOBAL,
            endsAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(172_800)),
            arena: .BRONZE,
            cohort: nil,
            pendingResult: LeaguePendingResultDto(
                weekKey: "2026-W45",
                outcome: .PROMOTED,
                fromArena: .BRONZE,
                toArena: .SILVER,
                rank: 2,
                points: 1_240
            )
        )
    }

    /// Seeds believable content for `--uitesting-marketing` screenshot runs: ~8 weeks of
    /// history, an active session mid-workout (next set carries a +2.5 kg suggestion), fake
    /// live vitals and a meal entry with AI-tagged items — all local, no network.
    private static func seedMarketingContent(vm: LukiAppViewModel, store: OfflineStore, args: [String]) {
        let iso = ISO8601DateFormatter()
        guard let template = store.folders.first?.templates.first else { return }

        // ~8 weeks of history so progression insights and the progress view look real.
        for week in stride(from: 8, through: 1, by: -1) {
            for sessionIdx in 0..<2 {
                var completed = SessionCalculator.createOfflineSessionFromTemplate(
                    template: template,
                    catalog: store.catalog,
                    userId: "local-user",
                    weightUnit: .KG,
                    sourceDevice: .IPHONE
                )
                for exIdx in completed.exercises.indices {
                    for sIdx in completed.exercises[exIdx].sets.indices {
                        completed.exercises[exIdx].sets[sIdx].completed = true
                        // Slowly trending weights, so suggestions look earned.
                        if let w = completed.exercises[exIdx].sets[sIdx].weight {
                            completed.exercises[exIdx].sets[sIdx].weight = w + Double(8 - week) * 2.5
                        }
                        // The first exercise dropped over the last two weeks → a regression
                        // stall, so the suggestion card offers a replacement in the session.
                        if exIdx == 0, week <= 2, let w = completed.exercises[exIdx].sets[sIdx].weight {
                            completed.exercises[exIdx].sets[sIdx].weight = max(0, w - Double(3 - week) * 5 - 10)
                        }
                        // The last week tops the rep range → the next open set gets +2.5 kg.
                        if week == 1 {
                            completed.exercises[exIdx].sets[sIdx].reps = 12
                        }
                    }
                    completed.exercises[exIdx].status = .COMPLETED
                }
                completed.status = .COMPLETED
                let daysAgo = week * 7 + sessionIdx * 3
                completed.completedAt = iso.string(
                    from: Date().addingTimeInterval(-TimeInterval(daysAgo * 86400))
                )
                completed.startedAt = iso.string(
                    from: Date().addingTimeInterval(-TimeInterval(daysAgo * 86400 + 3600))
                )
                completed.activeDurationSeconds = 2700
                completed = SessionCalculator.recalculateSessionTotals(completed)
                store.saveHistorySession(completed)
            }
        }

        // Active session mid-workout only when the shot needs it — otherwise it covers the tabs.
        if args.contains("--uitesting-marketing-session") {
            vm.startSession(from: template, sourceDevice: .IPHONE)
        }
        if args.contains("--uitesting-marketing-session"), var active = store.activeSession {
            for exIdx in active.exercises.indices {
                if !active.exercises[exIdx].sets.isEmpty {
                    active.exercises[exIdx].sets[0].completed = true
                }
            }
            active.startedAt = iso.string(from: Date().addingTimeInterval(-1500))
            active.restTimerEndsAt = iso.string(from: Date().addingTimeInterval(45))
            store.saveActiveSession(active)
            // Present the full-screen workout cover for the shot.
            vm.selectedTab = .session
        }

        // Fake live vitals for the bpm / kcal rows and the Live Activity.
        vm.healthCoordinator.isWorkoutRunning = true
        vm.healthCoordinator.currentHeartRateBpm = 128
        vm.healthCoordinator.activeCaloriesKcal = 214

        seedDemoMeal(vm: vm, store: store)
    }

    /// Demo meal with AI-tagged items (no OpenRouter call happens). Shared by the marketing
    /// and App Review seeds. The photo is primed into `MealPhotoCache` so it shows without
    /// any server round-trip — on the simulator the UI test passes the absolute host path
    /// (`LUKIFITTI_MARKETING_MEAL_PHOTO`); on a physical device that path is unreadable, so
    /// the test sends the JPEG base64-encoded (`LUKIFITTI_REVIEW_MEAL_PHOTO_B64`).
    static func seedDemoMeal(vm: LukiAppViewModel, store: OfflineStore) {
        let iso = ISO8601DateFormatter()
        let mealItems = [
            MealItemDto(name: "Chicken breast", grams: 150, kcal: 248, proteinG: 46.5, carbsG: 0, fatG: 5.4, source: .AI, confidence: 0.92),
            MealItemDto(name: "Rice", grams: 200, kcal: 260, proteinG: 5.4, carbsG: 56, fatG: 0.6, source: .AI, confidence: 0.88),
            MealItemDto(name: "Broccoli", grams: 120, kcal: 41, proteinG: 3.4, carbsG: 8, fatG: 0.4, source: .AI, confidence: 0.85),
        ]
        let env = ProcessInfo.processInfo.environment
        var photoData: Data?
        if let photoPath = env["LUKIFITTI_MARKETING_MEAL_PHOTO"] {
            photoData = try? Data(contentsOf: URL(fileURLWithPath: photoPath))
        } else if let b64 = env["LUKIFITTI_REVIEW_MEAL_PHOTO_B64"] {
            photoData = Data(base64Encoded: b64, options: .ignoreUnknownCharacters)
        }
        var photos: [MealPhotoDto] = []
        if let photoData {
            photos = [MealPhotoDto(id: "marketing-photo", mimeType: "image/jpeg")]
            MealPhotoCache.shared.store(photoData, for: "marketing-photo")
        }

        var meal = MealEntryDto(
            id: "marketing-meal",
            clientEntryId: "marketing-meal",
            eatenAt: iso.string(from: Date()),
            mealType: .LUNCH,
            label: "Lunch",
            items: mealItems,
            photos: photos
        )
        meal.totals = NutritionMath.sum(mealItems)
        vm.nutrition.upsertLocal(meal)
    }
}

@main
public struct LukiFittiIOSApp: App {
    @UIApplicationDelegateAdaptor(LukiAppDelegate.self) private var appDelegate
    @State private var viewModel = LukiAppViewModel.makeConfigured()
    @Environment(\.scenePhase) private var scenePhase

    public init() {}

    public var body: some Scene {
        WindowGroup {
            AppShellView(viewModel: viewModel)
                .environment(\.lukiLocale, viewModel.locale)
                // The App Review video is recorded in dark mode — the verify flow
                // pulls the server's preferences over the seed, so pin it here too.
                .lukiAppearance(ProcessInfo.processInfo.arguments.contains("--uitesting-review")
                    ? "dark" : viewModel.store.preferences.theme)
                .onChange(of: viewModel.store.activeSession, initial: true) {
                    viewModel.syncLiveActivity()
                }
                .onOpenURL { url in
                    viewModel.handleUniversalLink(url)
                }
                .onAppear {
                    Task { await ApnsPushManager.shared.attach(viewModel.store.apiClient) }
                    viewModel.pullFromWatchAndServer()
                }
                .task { await viewModel.requestNotificationPermissionIfNeeded() }
                .onChange(of: scenePhase) { _, newPhase in
                    if newPhase == .active {
                        viewModel.pullFromWatchAndServer()
                    }
                    if newPhase == .background {
                        WidgetSnapshotWriter.publish(from: viewModel)
                    }
                }
                // Publish the home-widget snapshot whenever a source of it changes.
                .onChange(of: viewModel.store.historySessions) { WidgetSnapshotWriter.publish(from: viewModel) }
                .onChange(of: viewModel.store.folders) { WidgetSnapshotWriter.publish(from: viewModel) }
                .onChange(of: viewModel.store.unfiledTemplates) { WidgetSnapshotWriter.publish(from: viewModel) }
                .onChange(of: viewModel.store.preferences) { WidgetSnapshotWriter.publish(from: viewModel) }
                .onChange(of: viewModel.nutrition.entries) { WidgetSnapshotWriter.publish(from: viewModel) }
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
            if viewModel.socialEnabled {
                Tab(tr("Social"), systemImage: "person.2", value: LukiMainTab.social) {
                    tabRoot(title: tr("Social")) { SocialView(viewModel: viewModel) }
                }
            }
        }
        .tint(LukiColors.accent)
        .tabBarMinimizeBehavior(.onScrollDown)
        .modifier(SessionAccessoryModifier(isEnabled: hasSession) {
            SessionAccessoryView(viewModel: viewModel) { isSessionPresented = true }
        })
        .fullScreenCover(isPresented: $isSessionPresented) {
            syncSelectionFromContent()
            if viewModel.clearsSummaryOnDismiss {
                viewModel.clearsSummaryOnDismiss = false
                viewModel.completedSummarySession = nil
            }
        } content: {
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
        // `/invite/<token>` universal link: shows once a user is signed in and social is on
        // (the token survives the sign-in detour in `pendingInviteToken`).
        .sheet(isPresented: Binding(
            get: {
                viewModel.pendingInviteToken != nil
                    && viewModel.store.currentUser != nil
                    && viewModel.socialEnabled
            },
            set: { if !$0 { viewModel.pendingInviteToken = nil } }
        )) {
            SocialInviteSheet(viewModel: viewModel)
        }
        .onChange(of: viewModel.selectedTab, initial: true) { _, newTab in
            route(to: newTab)
        }
        .onChange(of: contentTab) { _, newTab in
            if viewModel.selectedTab != newTab, !isSessionPresented, !isProfilePresented {
                viewModel.selectedTab = newTab
            }
        }
        .onChange(of: contentTab, initial: true) { _, newTab in
            viewModel.analytics.screen(Self.screenPath(for: newTab))
        }
        .onChange(of: isSessionPresented) { _, presented in
            if presented { viewModel.analytics.screen("/session") }
        }
        .onChange(of: isProfilePresented) { _, presented in
            if presented { viewModel.analytics.screen("/profile") }
        }
        .onChange(of: viewModel.isWeightPresented) { _, presented in
            if presented { viewModel.analytics.screen("/weight") }
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

    /// Stable analytics screen paths per tab (kept separate from route() so a .session or
    /// .profile selection is reported by its own presented-state onChange instead).
    private static func screenPath(for tab: LukiMainTab) -> String {
        switch tab {
        case .home: return "/"
        case .workouts: return "/workouts"
        case .nutrition: return "/nutrition"
        case .diary: return "/history"
        case .exercises: return "/library"
        case .social: return "/social"
        case .session: return "/session"
        case .profile: return "/profile"
        }
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
        case .exercises:
            // The Library tab became the Workouts tab's Library segment.
            isSessionPresented = false
            isProfilePresented = false
            viewModel.workoutsShowLibrary = true
            contentTab = .workouts
            viewModel.selectedTab = .workouts
        case .home, .workouts, .nutrition, .diary, .social:
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
        case .SAVED_LOCALLY: return viewModel.store.pendingChangesCount > 0
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
        case .SAVED_LOCALLY: return tr("Not synced yet: %d changes", viewModel.store.pendingChangesCount)
        case .CONFLICT: return tr("Changed on two devices")
        case .AUTH_EXPIRED: return tr("Sign in to sync")
        case .OFFLINE: return tr("Offline. %d changes saved on this device", viewModel.store.pendingChangesCount)
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
