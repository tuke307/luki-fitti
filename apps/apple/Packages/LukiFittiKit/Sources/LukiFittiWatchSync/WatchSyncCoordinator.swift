import Foundation
import Observation
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
    public var activeSession: WorkoutSessionDto?
    public var latestCompletedSession: WorkoutSessionDto?

    public init(
        catalog: [ExerciseDto] = [],
        folders: [WorkoutFolderDto],
        unfiledTemplates: [WorkoutTemplateDto],
        stretchingRoutines: [StretchingRoutineDto],
        historySessions: [WorkoutSessionDto] = [],
        preferences: UserPreferencesDto,
        currentUser: UserDto? = nil,
        authTokens: AuthTokensDto? = nil,
        activeSession: WorkoutSessionDto? = nil,
        latestCompletedSession: WorkoutSessionDto? = nil
    ) {
        self.catalog = catalog
        self.folders = folders
        self.unfiledTemplates = unfiledTemplates
        self.stretchingRoutines = stretchingRoutines
        self.historySessions = historySessions
        self.preferences = preferences
        self.currentUser = currentUser
        self.authTokens = authTokens
        self.activeSession = activeSession
        self.latestCompletedSession = latestCompletedSession
    }
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

    #if canImport(WatchConnectivity)
    private var sessionDelegateProxy: WCSessionDelegateProxy?
    #endif

    private static var simulatorBridgeURL: URL? {
        #if targetEnvironment(simulator)
        return URL(fileURLWithPath: "/tmp/lukifitti_watch_bridge_v1.json")
        #else
        return nil
        #endif
    }

    private static var simulatorActiveSessionBridgeURL: URL? {
        #if targetEnvironment(simulator)
        return URL(fileURLWithPath: "/tmp/lukifitti_active_session_bridge_v1.json")
        #else
        return nil
        #endif
    }

    private static var simulatorCompletedSessionBridgeURL: URL? {
        #if targetEnvironment(simulator)
        return URL(fileURLWithPath: "/tmp/lukifitti_completed_session_bridge_v1.json")
        #else
        return nil
        #endif
    }

    public override init() {
        super.init()
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
                }
            )
            self.sessionDelegateProxy = proxy
            let session = WCSession.default
            session.delegate = proxy
            session.activate()
            isCompanionReachable = session.isReachable
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
        activeSession: WorkoutSessionDto? = nil
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
            activeSession: activeSession
        )

        if let bridgeURL = Self.simulatorBridgeURL,
           let encoded = try? JSONEncoder().encode(payload) {
            try? encoded.write(to: bridgeURL, options: .atomic)
        }

        #if canImport(WatchConnectivity)
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        if let payloadData = try? JSONEncoder().encode(payload) {
            try? WCSession.default.updateApplicationContext(["watch_context_payload": payloadData])
        }
        #endif
    }

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
        if let data = dict["watch_context_payload"] as? Data,
           let decoded = try? JSONDecoder().decode(WatchContextPayload.self, from: data) {
            onContextReceived?(decoded)
        }
        if let data = dict["active_session"] as? Data,
           let session = try? JSONDecoder().decode(WorkoutSessionDto.self, from: data) {
            onActiveSessionReceived?(session)
        }
        if dict["active_session_cleared"] != nil {
            onActiveSessionReceived?(nil)
        }
        if let data = dict["completed_session"] as? Data,
           let session = try? JSONDecoder().decode(WorkoutSessionDto.self, from: data) {
            onCompletedSessionReceived?(session)
        }
    }

    private func handleIncomingData(_ data: Data) {
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

    init(
        onReceiveContext: @escaping ([String: Any]) -> Void,
        onReceiveMessageData: @escaping (Data) -> Void
    ) {
        self.onReceiveContext = onReceiveContext
        self.onReceiveMessageData = onReceiveMessageData
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

    #if os(iOS)
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
    #endif
}
#endif
