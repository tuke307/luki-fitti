import Foundation
import Observation
import os
import LukiFittiModels
import LukiFittiDomain

#if canImport(WatchConnectivity)
import WatchConnectivity
#endif

public struct SessionMutationPacket: Codable, Sendable, Equatable {
    public var mutationId: String
    public var clientSessionId: String
    public var clientExerciseId: String
    public var clientSetId: String
    public var weight: Double?
    public var reps: Int?
    public var rpe: Double?
    public var completed: Bool
    public var avgHeartRateBpm: Int?
    public var peakHeartRateBpm: Int?
    public var restEndHeartRateBpm: Int?
    public var restTimerEndsAt: String?
    public var restTimerDurationSec: Int?
    public var timestampMs: Int64
    public var newVersion: Int

    public init(
        mutationId: String = UUID().uuidString,
        clientSessionId: String,
        clientExerciseId: String,
        clientSetId: String,
        weight: Double? = nil,
        reps: Int? = nil,
        rpe: Double? = nil,
        completed: Bool,
        avgHeartRateBpm: Int? = nil,
        peakHeartRateBpm: Int? = nil,
        restEndHeartRateBpm: Int? = nil,
        restTimerEndsAt: String? = nil,
        restTimerDurationSec: Int? = nil,
        timestampMs: Int64 = Int64(Date().timeIntervalSince1970 * 1000),
        newVersion: Int
    ) {
        self.mutationId = mutationId
        self.clientSessionId = clientSessionId
        self.clientExerciseId = clientExerciseId
        self.clientSetId = clientSetId
        self.weight = weight
        self.reps = reps
        self.rpe = rpe
        self.completed = completed
        self.avgHeartRateBpm = avgHeartRateBpm
        self.peakHeartRateBpm = peakHeartRateBpm
        self.restEndHeartRateBpm = restEndHeartRateBpm
        self.restTimerEndsAt = restTimerEndsAt
        self.restTimerDurationSec = restTimerDurationSec
        self.timestampMs = timestampMs
        self.newVersion = newVersion
    }
}

public struct WatchContextPayload: Codable, Sendable, Equatable {
    public var catalog: [ExerciseDto]
    public var folders: [WorkoutFolderDto]
    public var unfiledTemplates: [WorkoutTemplateDto]
    public var stretchingRoutines: [StretchingRoutineDto]
    public var historySessions: [WorkoutSessionDto]
    public var preferences: UserPreferencesDto
    public var currentUser: UserDto?
    public var authTokens: AuthTokensDto?
    /// Identifies the Watch session in `authTokens`; re-sends with the same id must not overwrite
    /// tokens the Watch has rotated since. Optional so payloads from older app versions decode.
    public var authHandoffId: String?
    public var activeSession: WorkoutSessionDto?
    public var latestCompletedSession: WorkoutSessionDto?
    /// Workouts deleted on the iPhone, so a Watch that missed the delete message still drops them.
    /// Optional so payloads from older app versions still decode.
    public var deletedSessionIds: [String]?

    public init(
        catalog: [ExerciseDto] = [],
        folders: [WorkoutFolderDto],
        unfiledTemplates: [WorkoutTemplateDto],
        stretchingRoutines: [StretchingRoutineDto],
        historySessions: [WorkoutSessionDto] = [],
        preferences: UserPreferencesDto,
        currentUser: UserDto? = nil,
        authTokens: AuthTokensDto? = nil,
        authHandoffId: String? = nil,
        activeSession: WorkoutSessionDto? = nil,
        latestCompletedSession: WorkoutSessionDto? = nil,
        deletedSessionIds: [String] = []
    ) {
        self.catalog = catalog
        self.folders = folders
        self.unfiledTemplates = unfiledTemplates
        self.stretchingRoutines = stretchingRoutines
        self.historySessions = historySessions
        self.preferences = preferences
        self.currentUser = currentUser
        self.authTokens = authTokens
        self.authHandoffId = authHandoffId
        self.activeSession = activeSession
        self.latestCompletedSession = latestCompletedSession
        self.deletedSessionIds = deletedSessionIds
    }
}

/// Sign-in and preferences for the watch. Small enough for the WatchConnectivity application
/// context (about 64 KB); the full workout data goes as a file transfer instead.
public struct WatchAuthPayload: Codable, Sendable, Equatable {
    public var preferences: UserPreferencesDto
    public var currentUser: UserDto?
    public var authTokens: AuthTokensDto?
    public var authHandoffId: String?

    public init(
        preferences: UserPreferencesDto,
        currentUser: UserDto? = nil,
        authTokens: AuthTokensDto? = nil,
        authHandoffId: String? = nil
    ) {
        self.preferences = preferences
        self.currentUser = currentUser
        self.authTokens = authTokens
        self.authHandoffId = authHandoffId
    }
}

private let watchSyncLog = Logger(subsystem: "LukiFitti", category: "WatchSync")

/// What WatchConnectivity reports right now; shown in the iPhone and Watch settings to explain sync.
public struct WatchConnectionStatus: Equatable, Sendable {
    public var isSupported = false
    public var isActivated = false
    /// iPhone: a Watch is paired. Watch: always true.
    public var isPaired = false
    /// iPhone: the Watch app is installed. Watch: the iPhone app is installed.
    public var isCounterpartInstalled = false
    public var isReachable = false
    public var lastSentAt: Date?
    public var lastReceivedAt: Date?
    public var lastError: String?
    /// Watch: a sync request went to the iPhone and its answer hasn't arrived yet.
    public var isWaitingForCompanion = false

    public init() {}
}

/// English keys (translated by the UI via `tr`) for the WatchConnectivity errors a user can act on.
let watchAppNotInstalledMessage = "The Watch app isn’t installed as this app’s companion."

func watchSyncMessage(for error: any Error) -> String {
    #if canImport(WatchConnectivity)
    if let wcError = error as? WCError {
        switch wcError.code {
        case .watchAppNotInstalled: return watchAppNotInstalledMessage
        case .companionAppNotInstalled: return "LukiFitti isn’t installed on the iPhone."
        case .notReachable: return "No answer from the iPhone. Open LukiFitti on the iPhone and try again."
        case .deviceNotPaired: return "No Apple Watch is paired with this iPhone."
        case .sessionNotActivated, .sessionInactive: return "WatchConnectivity is not activated yet."
        case .payloadTooLarge: return "The data is too large to send to the Watch."
        default: break
        }
    }
    #endif
    return error.localizedDescription
}

/// Asks the other device to send its data again (e.g. the Watch's "Sync with iPhone" button).
struct WatchSyncRequest: Codable {
    var watchSyncRequest: String
    /// Lets the iPhone drop the second copy of a request sent both live and queued.
    var requestId: String?
}

public enum WatchSyncMerger {
    /// Deterministic set-level merge strategy preventing iPhone vs Apple Watch self-conflicts
    /// during a companion workout where both screens are open simultaneously.
    public static func applyMutation(
        _ packet: SessionMutationPacket,
        to session: WorkoutSessionDto,
        lastAppliedTimestamps: inout [String: Int64]
    ) -> WorkoutSessionDto {
        guard session.clientSessionId == packet.clientSessionId else { return session }
        let prevTs = lastAppliedTimestamps[packet.clientSetId] ?? 0
        guard packet.timestampMs >= prevTs else { return session }

        lastAppliedTimestamps[packet.clientSetId] = packet.timestampMs
        var copy = session

        for exIdx in copy.exercises.indices where copy.exercises[exIdx].clientExerciseId == packet.clientExerciseId {
            for setIdx in copy.exercises[exIdx].sets.indices where copy.exercises[exIdx].sets[setIdx].clientSetId == packet.clientSetId {
                var set = copy.exercises[exIdx].sets[setIdx]
                if let w = packet.weight { set.weight = w }
                if let r = packet.reps { set.reps = r }
                if let rpe = packet.rpe { set.rpe = rpe }
                set.completed = packet.completed
                if packet.completed && set.completedAt == nil {
                    set.completedAt = ISO8601DateFormatter().string(from: Date())
                }
                if let avgHr = packet.avgHeartRateBpm { set.avgHeartRateBpm = avgHr }
                if let peakHr = packet.peakHeartRateBpm { set.peakHeartRateBpm = peakHr }
                if let restEndHr = packet.restEndHeartRateBpm { set.restEndHeartRateBpm = restEndHr }
                copy.exercises[exIdx].sets[setIdx] = set
            }
            let allDone = copy.exercises[exIdx].sets.allSatisfy(\.completed)
            copy.exercises[exIdx].status = allDone ? .COMPLETED : .IN_PROGRESS
        }

        if let endsAt = packet.restTimerEndsAt {
            copy.restTimerEndsAt = endsAt
        }
        if let dur = packet.restTimerDurationSec {
            copy.restTimerDurationSec = dur
        }
        copy.version = max(copy.version, packet.newVersion)
        return SessionCalculator.recalculateSessionTotals(copy)
    }
}

@MainActor
@Observable
public final class WatchSyncCoordinator: NSObject {
    public var isCompanionReachable: Bool = false
    public var lastSyncedContextAt: Date?
    public var lastAppliedTimestamps: [String: Int64] = [:]
    public var onMutationReceived: ((SessionMutationPacket) -> Void)?
    public var onActiveSessionReceived: ((WorkoutSessionDto?) -> Void)?
    public var onCompletedSessionReceived: ((WorkoutSessionDto) -> Void)?
    public var onContextReceived: ((WatchContextPayload) -> Void)?
    public var onAuthReceived: ((WatchAuthPayload) -> Void)?
    /// Called once WatchConnectivity is activated, so the iPhone can push what it skipped before.
    public var onActivated: (() -> Void)?
    /// iPhone: the Watch asked for a fresh copy of the sign-in and workouts.
    public var onContextRequested: (() -> Void)?
    /// iPhone: the Watch's session was rejected and it needs a newly minted one.
    public var onAuthRequested: (() -> Void)?
    /// iPhone: the Watch discarded a workout it had just finished.
    /// Watch: the iPhone deleted a finished workout from its history.
    public var onSessionDiscarded: ((String) -> Void)?
    /// iPhone: the Watch app was installed (or reinstalled) while this app was running.
    public var onCounterpartInstalled: (() -> Void)?
    public private(set) var status = WatchConnectionStatus()
    private static let lastReceivedKey = "watchSync.lastReceivedAt"

    static let authContextKey = "watch_auth_payload"
    static let authRequestKey = "watch_auth_request"
    private var handledAuthRequestIds: [String] = []
    static let contextFileKind = "watch_context_payload"

    #if canImport(WatchConnectivity)
    private var sessionDelegateProxy: WCSessionDelegateProxy?
    #endif

    private static var isIsolatedUITest: Bool {
        let args = ProcessInfo.processInfo.arguments
        return args.contains("--uitesting") && !args.contains("--uitesting-enable-watch-bridge")
    }

    private static var simulatorBridgeURL: URL? {
        #if targetEnvironment(simulator)
        if isIsolatedUITest { return nil }
        return URL(fileURLWithPath: "/tmp/lukifitti_watch_bridge_v1.json")
        #else
        return nil
        #endif
    }

    private static var simulatorActiveSessionBridgeURL: URL? {
        #if targetEnvironment(simulator)
        if isIsolatedUITest { return nil }
        return URL(fileURLWithPath: "/tmp/lukifitti_active_session_bridge_v1.json")
        #else
        return nil
        #endif
    }

    private static var simulatorCompletedSessionBridgeURL: URL? {
        #if targetEnvironment(simulator)
        if isIsolatedUITest { return nil }
        return URL(fileURLWithPath: "/tmp/lukifitti_completed_session_bridge_v1.json")
        #else
        return nil
        #endif
    }

    public override init() {
        super.init()
        let saved = UserDefaults.standard.double(forKey: Self.lastReceivedKey)
        if saved > 0 { status.lastReceivedAt = Date(timeIntervalSince1970: saved) }
        activateWatchConnectivityIfNeeded()
    }

    public func activateWatchConnectivityIfNeeded() {
        #if canImport(WatchConnectivity)
        if WCSession.isSupported() {
            let proxy = WCSessionDelegateProxy(
                onReceiveContext: { [weak self] contextDict in
                    Task { @MainActor in
                        self?.handleIncomingDictionary(contextDict)
                    }
                },
                onReceiveMessageData: { [weak self] data in
                    Task { @MainActor in
                        self?.handleIncomingData(data)
                    }
                },
                onReceiveFile: { [weak self] data, metadata in
                    Task { @MainActor in
                        self?.handleIncomingFile(data, metadata: metadata)
                    }
                },
                onActivated: { [weak self] error in
                    Task { @MainActor in
                        self?.refreshStatus()
                        if let error { self?.status.lastError = error }
                        self?.onActivated?()
                    }
                },
                onStateChanged: { [weak self] in
                    Task { @MainActor in
                        self?.refreshStatus()
                    }
                }
            )
            self.sessionDelegateProxy = proxy
            let session = WCSession.default
            session.delegate = proxy
            session.activate()
            refreshStatus()
            let existingCtx = session.receivedApplicationContext
            if !existingCtx.isEmpty {
                handleIncomingDictionary(existingCtx)
            }
        }
        #endif
    }

    public func pushApplicationContextToWatch(
        catalog: [ExerciseDto] = [],
        folders: [WorkoutFolderDto],
        unfiledTemplates: [WorkoutTemplateDto],
        stretchingRoutines: [StretchingRoutineDto],
        historySessions: [WorkoutSessionDto] = [],
        preferences: UserPreferencesDto,
        currentUser: UserDto? = nil,
        authTokens: AuthTokensDto? = nil,
        authHandoffId: String? = nil,
        activeSession: WorkoutSessionDto? = nil,
        deletedSessionIds: [String] = []
    ) {
        lastSyncedContextAt = Date()
        let payload = WatchContextPayload(
            catalog: catalog,
            folders: folders,
            unfiledTemplates: unfiledTemplates,
            stretchingRoutines: stretchingRoutines,
            historySessions: Array(historySessions.prefix(200)),
            preferences: preferences,
            currentUser: currentUser,
            authTokens: authTokens,
            authHandoffId: authHandoffId,
            activeSession: activeSession,
            deletedSessionIds: deletedSessionIds
        )

        if let bridgeURL = Self.simulatorBridgeURL,
           let encoded = try? JSONEncoder().encode(payload) {
            try? encoded.write(to: bridgeURL, options: .atomic)
        }

        #if canImport(WatchConnectivity)
        refreshStatus()
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else {
            status.lastError = "WatchConnectivity is not activated yet."
            return
        }
        #if os(iOS)
        guard WCSession.default.isPaired else {
            status.lastError = "No Apple Watch is paired with this iPhone."
            return
        }
        #endif
        let auth = WatchAuthPayload(
            preferences: preferences,
            currentUser: currentUser,
            authTokens: authTokens,
            authHandoffId: authHandoffId
        )
        if let authData = try? JSONEncoder().encode(auth) {
            do {
                try WCSession.default.updateApplicationContext([
                    Self.authContextKey: authData,
                    "sentAt": Date().timeIntervalSince1970,
                ])
                status.lastSentAt = Date()
                status.lastError = nil
            } catch {
                status.lastError = watchSyncMessage(for: error)
                watchSyncLog.error("Application context update failed: \(error.localizedDescription, privacy: .public)")
            }
            if WCSession.default.isReachable {
                WCSession.default.sendMessage([Self.authContextKey: authData], replyHandler: nil) { error in
                    watchSyncLog.error("Live sign-in message failed: \(error.localizedDescription, privacy: .public)")
                }
            }
        }
        if let payloadData = try? JSONEncoder().encode(payload) {
            transferContextFile(payloadData)
        }
        #endif
    }

    /// Watch: asks the iPhone to send its sign-in and workouts again. With `silent`, an unreachable
    /// iPhone is not reported as an error (used for the automatic request when the app opens).
    /// Returns false when the iPhone app isn't reachable (it has to be open or in the background).
    @discardableResult
    public func requestContextFromCompanion(silent: Bool = false, notReachableMessage: String) -> Bool {
        #if canImport(WatchConnectivity)
        refreshStatus()
        guard WCSession.isSupported(), WCSession.default.activationState == .activated,
              WCSession.default.isReachable,
              let data = try? JSONEncoder().encode(WatchSyncRequest(watchSyncRequest: "context")) else {
            if !silent { status.lastError = notReachableMessage }
            return false
        }
        status.isWaitingForCompanion = true
        status.lastSentAt = Date()
        status.lastError = nil
        WCSession.default.sendMessageData(data, replyHandler: nil) { error in
            Task { @MainActor in
                self.status.isWaitingForCompanion = false
                self.status.lastError = watchSyncMessage(for: error)
            }
        }
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(15))
            guard let self, self.status.isWaitingForCompanion else { return }
            self.status.isWaitingForCompanion = false
            if !silent { self.status.lastError = notReachableMessage }
        }
        return true
        #else
        return false
        #endif
    }

    /// iPhone: whether a Watch app can receive what is pushed (paired and installed, or the
    /// simulator bridge). Used to avoid minting Watch sessions for users without a Watch.
    public var canDeliverToWatch: Bool {
        if Self.simulatorBridgeURL != nil { return true }
        return status.isPaired && status.isCounterpartInstalled
    }

    /// Watch: asks the iPhone to mint a new Watch session because this one was rejected. Sent live
    /// when the iPhone is reachable, otherwise queued until it is.
    public func requestAuthFromCompanion() {
        #if canImport(WatchConnectivity)
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        let requestId = UUID().uuidString
        let key = Self.authRequestKey
        let queue: @Sendable () -> Void = {
            WCSession.default.transferUserInfo([key: requestId])
        }
        guard WCSession.default.isReachable,
              let data = try? JSONEncoder().encode(WatchSyncRequest(watchSyncRequest: "auth", requestId: requestId)) else {
            queue()
            return
        }
        WCSession.default.sendMessageData(data, replyHandler: nil) { error in
            watchSyncLog.error("Sign-in request failed: \(error.localizedDescription, privacy: .public)")
            queue()
        }
        #endif
    }

    private func handleAuthRequest(id: String?) {
        if let id {
            guard !handledAuthRequestIds.contains(id) else { return }
            handledAuthRequestIds = Array((handledAuthRequestIds + [id]).suffix(20))
        }
        markReceived()
        onAuthRequested?()
    }

    /// Persisted so "last synced" survives app restarts.
    private func markReceived() {
        let now = Date()
        status.lastReceivedAt = now
        status.isWaitingForCompanion = false
        status.lastError = nil
        UserDefaults.standard.set(now.timeIntervalSince1970, forKey: Self.lastReceivedKey)
    }

    public func refreshStatus() {
        #if canImport(WatchConnectivity)
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        let wasActivated = status.isActivated
        let wasInstalled = status.isCounterpartInstalled
        status.isSupported = true
        status.isActivated = session.activationState == .activated
        status.isReachable = session.isReachable
        #if os(iOS)
        status.isPaired = session.isPaired
        status.isCounterpartInstalled = session.isWatchAppInstalled
        #else
        status.isPaired = true
        status.isCounterpartInstalled = session.isCompanionAppInstalled
        #endif
        isCompanionReachable = session.isReachable
        if status.isCounterpartInstalled, status.lastError == watchAppNotInstalledMessage {
            status.lastError = nil
        }
        if wasActivated, !wasInstalled, status.isCounterpartInstalled {
            onCounterpartInstalled?()
        }
        #endif
    }

    #if canImport(WatchConnectivity)
    /// Sends the full payload as a file (no size limit, delivered even when the watch app is closed);
    /// older queued payload files are cancelled so only the newest is delivered.
    private func transferContextFile(_ data: Data) {
        for transfer in WCSession.default.outstandingFileTransfers
        where transfer.file.metadata?["kind"] as? String == Self.contextFileKind {
            transfer.cancel()
        }
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("lukifitti-watch-context-\(UUID().uuidString).json")
        do {
            try data.write(to: url, options: .atomic)
            WCSession.default.transferFile(url, metadata: ["kind": Self.contextFileKind])
        } catch {
            watchSyncLog.error("Context file write failed: \(error.localizedDescription, privacy: .public)")
        }
    }
    #endif

    /// Broadcasts the current active workout session (`IN_PROGRESS` or `PAUSED` or `nil`)
    /// bi-directionally between Apple Watch and iPhone so both devices stay in lockstep.
    public func broadcastActiveSessionSnapshot(_ session: WorkoutSessionDto?) {
        if let activeBridgeURL = Self.simulatorActiveSessionBridgeURL {
            if let session, let encoded = try? JSONEncoder().encode(session) {
                try? encoded.write(to: activeBridgeURL, options: .atomic)
            } else {
                try? FileManager.default.removeItem(at: activeBridgeURL)
            }
        }

        #if canImport(WatchConnectivity)
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        if let session, let data = try? JSONEncoder().encode(session) {
            if WCSession.default.isReachable {
                WCSession.default.sendMessageData(data, replyHandler: nil, errorHandler: nil)
            }
            WCSession.default.transferUserInfo(["active_session": data])
        } else {
            WCSession.default.transferUserInfo(["active_session_cleared": true])
        }
        #endif
    }

    public func pullLatestContextIfAvailable() -> WatchContextPayload? {
        if let bridgeURL = Self.simulatorBridgeURL,
           let data = try? Data(contentsOf: bridgeURL),
           let decoded = try? JSONDecoder().decode(WatchContextPayload.self, from: data) {
            return decoded
        }
        #if canImport(WatchConnectivity)
        if WCSession.isSupported() {
            let ctx = WCSession.default.receivedApplicationContext
            if let data = ctx["watch_context_payload"] as? Data,
               let decoded = try? JSONDecoder().decode(WatchContextPayload.self, from: data) {
                return decoded
            }
        }
        #endif
        return nil
    }

    public func pullLatestAuthIfAvailable() -> WatchAuthPayload? {
        #if canImport(WatchConnectivity)
        if WCSession.isSupported(),
           let data = WCSession.default.receivedApplicationContext[Self.authContextKey] as? Data {
            return try? JSONDecoder().decode(WatchAuthPayload.self, from: data)
        }
        #endif
        return nil
    }

    public func pullSharedActiveSessionIfAvailable() -> WorkoutSessionDto? {
        if let activeBridgeURL = Self.simulatorActiveSessionBridgeURL,
           let data = try? Data(contentsOf: activeBridgeURL),
           let decoded = try? JSONDecoder().decode(WorkoutSessionDto.self, from: data) {
            return decoded
        }
        return nil
    }

    public func pullSharedCompletedSessionIfAvailable() -> WorkoutSessionDto? {
        if let completedBridgeURL = Self.simulatorCompletedSessionBridgeURL,
           let data = try? Data(contentsOf: completedBridgeURL),
           let decoded = try? JSONDecoder().decode(WorkoutSessionDto.self, from: data) {
            return decoded
        }
        return nil
    }

    private func handleIncomingDictionary(_ dict: [String: Any]) {
        if let data = dict[Self.authContextKey] as? Data,
           let auth = try? JSONDecoder().decode(WatchAuthPayload.self, from: data) {
            markReceived()
            onAuthReceived?(auth)
        }
        if let data = dict["watch_context_payload"] as? Data,
           let decoded = try? JSONDecoder().decode(WatchContextPayload.self, from: data) {
            onContextReceived?(decoded)
        }
        if let requestId = dict[Self.authRequestKey] as? String {
            handleAuthRequest(id: requestId)
        }
        if let data = dict["active_session"] as? Data,
           let session = try? JSONDecoder().decode(WorkoutSessionDto.self, from: data) {
            onActiveSessionReceived?(session)
        }
        if dict["active_session_cleared"] != nil {
            onActiveSessionReceived?(nil)
        }
        if let discarded = dict["discarded_session"] as? String {
            onSessionDiscarded?(discarded)
        }
        if let data = dict["completed_session"] as? Data,
           let session = try? JSONDecoder().decode(WorkoutSessionDto.self, from: data) {
            onCompletedSessionReceived?(session)
        }
    }

    private func handleIncomingFile(_ data: Data, metadata: [String: Any]?) {
        guard metadata?["kind"] as? String == Self.contextFileKind,
              let decoded = try? JSONDecoder().decode(WatchContextPayload.self, from: data) else { return }
        markReceived()
        onContextReceived?(decoded)
    }

    private func handleIncomingData(_ data: Data) {
        if let request = try? JSONDecoder().decode(WatchSyncRequest.self, from: data),
           request.watchSyncRequest == "context" {
            markReceived()
            onContextRequested?()
            return
        }
        if let request = try? JSONDecoder().decode(WatchSyncRequest.self, from: data),
           request.watchSyncRequest == "auth" {
            handleAuthRequest(id: request.requestId)
            return
        }
        if let packet = try? JSONDecoder().decode(SessionMutationPacket.self, from: data) {
            onMutationReceived?(packet)
            return
        }
        if let session = try? JSONDecoder().decode(WorkoutSessionDto.self, from: data) {
            if session.status == .COMPLETED {
                onCompletedSessionReceived?(session)
            } else {
                onActiveSessionReceived?(session)
            }
        }
    }

    public func broadcastSetMutation(_ packet: SessionMutationPacket) {
        #if canImport(WatchConnectivity)
        guard WCSession.isSupported(),
              WCSession.default.isReachable,
              let data = try? JSONEncoder().encode(packet) else { return }
        WCSession.default.sendMessageData(data, replyHandler: nil, errorHandler: nil)
        #endif
    }

    /// Tells the other device a finished workout was deleted (Watch: discarded on its summary,
    /// iPhone: deleted from the history). Queued behind the completed session, so both arrive in order.
    public func broadcastDiscardedSession(clientSessionId: String) {
        if let completedBridgeURL = Self.simulatorCompletedSessionBridgeURL,
           pullSharedCompletedSessionIfAvailable()?.clientSessionId == clientSessionId {
            try? FileManager.default.removeItem(at: completedBridgeURL)
        }
        #if canImport(WatchConnectivity)
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        WCSession.default.transferUserInfo(["discarded_session": clientSessionId])
        #endif
    }

    public func transferCompletedStandaloneSession(_ session: WorkoutSessionDto) {
        if let activeBridgeURL = Self.simulatorActiveSessionBridgeURL {
            try? FileManager.default.removeItem(at: activeBridgeURL)
        }
        if let completedBridgeURL = Self.simulatorCompletedSessionBridgeURL,
           let encoded = try? JSONEncoder().encode(session) {
            try? encoded.write(to: completedBridgeURL, options: .atomic)
        }

        #if canImport(WatchConnectivity)
        guard WCSession.isSupported(),
              WCSession.default.activationState == .activated,
              let data = try? JSONEncoder().encode(session) else { return }
        WCSession.default.transferUserInfo(["completed_session": data])
        #endif
    }
}

#if canImport(WatchConnectivity)
private final class WCSessionDelegateProxy: NSObject, WCSessionDelegate, @unchecked Sendable {
    let onReceiveContext: ([String: Any]) -> Void
    let onReceiveMessageData: (Data) -> Void
    let onReceiveFile: (Data, [String: Any]?) -> Void
    let onActivated: (String?) -> Void
    let onStateChanged: () -> Void

    init(
        onReceiveContext: @escaping ([String: Any]) -> Void,
        onReceiveMessageData: @escaping (Data) -> Void,
        onReceiveFile: @escaping (Data, [String: Any]?) -> Void,
        onActivated: @escaping (String?) -> Void,
        onStateChanged: @escaping () -> Void
    ) {
        self.onReceiveContext = onReceiveContext
        self.onReceiveMessageData = onReceiveMessageData
        self.onReceiveFile = onReceiveFile
        self.onActivated = onActivated
        self.onStateChanged = onStateChanged
    }

    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: (any Error)?
    ) {
        if activationState == .activated {
            let received = session.receivedApplicationContext
            if !received.isEmpty {
                onReceiveContext(received)
            }
        }
        if let error {
            watchSyncLog.error("Activation failed: \(error.localizedDescription, privacy: .public)")
        }
        onActivated(error.map(watchSyncMessage(for:)))
    }

    func sessionReachabilityDidChange(_ session: WCSession) {
        onStateChanged()
    }

    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        onReceiveContext(message)
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        onReceiveContext(applicationContext)
    }

    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        onReceiveContext(userInfo)
    }

    func session(_ session: WCSession, didReceiveMessageData messageData: Data) {
        onReceiveMessageData(messageData)
    }

    /// The system deletes the file when this returns, so read it synchronously.
    func session(_ session: WCSession, didReceive file: WCSessionFile) {
        guard let data = try? Data(contentsOf: file.fileURL) else { return }
        onReceiveFile(data, file.metadata)
    }

    func session(_ session: WCSession, didFinish fileTransfer: WCSessionFileTransfer, error: (any Error)?) {
        try? FileManager.default.removeItem(at: fileTransfer.file.fileURL)
    }

    #if os(iOS)
    func sessionWatchStateDidChange(_ session: WCSession) {
        onStateChanged()
    }

    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
    #endif
}
#endif
