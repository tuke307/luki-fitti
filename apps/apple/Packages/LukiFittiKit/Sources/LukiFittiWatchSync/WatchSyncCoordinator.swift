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
    public var onCompletedSessionReceived: ((WorkoutSessionDto) -> Void)?

    public override init() {
        super.init()
        activateWatchConnectivityIfNeeded()
    }

    public func activateWatchConnectivityIfNeeded() {
        #if canImport(WatchConnectivity)
        if WCSession.isSupported() {
            let session = WCSession.default
            session.activate()
            isCompanionReachable = session.isReachable
        }
        #endif
    }

    public func pushApplicationContextToWatch(
        folders: [WorkoutFolderDto],
        unfiledTemplates: [WorkoutTemplateDto],
        stretchingRoutines: [StretchingRoutineDto],
        preferences: UserPreferencesDto
    ) {
        lastSyncedContextAt = Date()
        #if canImport(WatchConnectivity)
        guard WCSession.isSupported(), WCSession.default.activationState == .activated else { return }
        let overview = WorkoutsOverviewDto(folders: folders, unfiledTemplates: unfiledTemplates)
        guard let overviewData = try? JSONEncoder().encode(overview),
              let routinesData = try? JSONEncoder().encode(stretchingRoutines),
              let prefsData = try? JSONEncoder().encode(preferences) else { return }
        try? WCSession.default.updateApplicationContext([
            "workouts_overview": overviewData,
            "stretching_routines": routinesData,
            "user_preferences": prefsData,
        ])
        #endif
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
        #if canImport(WatchConnectivity)
        guard WCSession.isSupported(),
              let data = try? JSONEncoder().encode(session) else { return }
        WCSession.default.transferUserInfo(["completed_session": data])
        #endif
    }
}
