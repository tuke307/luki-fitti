import Foundation
import Observation
import LukiFittiModels
import LukiFittiDomain

#if os(iOS) || os(watchOS)
import HealthKit
#endif

public struct FinalizedHealthKitMetrics: Sendable, Equatable {
    public var healthKitWorkoutUuid: String?
    public var activeCaloriesKcal: Double
    public var totalCaloriesKcal: Double
    public var avgHeartRateBpm: Int?
    public var maxHeartRateBpm: Int?
    public var minHeartRateBpm: Int?
    public var heartRateSamples: [HeartRateSampleDto]

    public init(
        healthKitWorkoutUuid: String? = nil,
        activeCaloriesKcal: Double = 0,
        totalCaloriesKcal: Double = 0,
        avgHeartRateBpm: Int? = nil,
        maxHeartRateBpm: Int? = nil,
        minHeartRateBpm: Int? = nil,
        heartRateSamples: [HeartRateSampleDto] = []
    ) {
        self.healthKitWorkoutUuid = healthKitWorkoutUuid
        self.activeCaloriesKcal = activeCaloriesKcal
        self.totalCaloriesKcal = totalCaloriesKcal
        self.avgHeartRateBpm = avgHeartRateBpm
        self.maxHeartRateBpm = maxHeartRateBpm
        self.minHeartRateBpm = minHeartRateBpm
        self.heartRateSamples = heartRateSamples
    }
}

@MainActor
@Observable
public final class HealthKitWorkoutCoordinator: NSObject {
    public var isAuthorized: Bool = false
    public var currentHeartRateBpm: Int?
    public var avgHeartRateBpm: Int?
    public var maxHeartRateBpm: Int?
    public var minHeartRateBpm: Int?
    public var activeCaloriesKcal: Double = 0
    public var totalCaloriesKcal: Double = 0
    public var heartRateSamples: [HeartRateSampleDto] = []
    public var currentSetHrBuffer: [Int] = []
    public var workoutStartedAt: Date?
    public var isWorkoutRunning: Bool = false
    public var isWorkoutPaused: Bool = false
    /// iPhone: a Watch-owned workout session is mirrored to this device and streaming metrics.
    public private(set) var isWatchSessionActive: Bool = false
    /// Fired after live metrics were ingested (e.g. mirrored packets) so the UI can throttle refresh.
    public var onLiveMetricsReceived: (() -> Void)?
    public var isUITesting: Bool = ProcessInfo.processInfo.arguments.contains("--uitesting")

    private var lastSampleOffsetSec: Int = -5
    private var allRecordedBpms: [Int] = []

    #if os(iOS) || os(watchOS)
    private let healthStore: HKHealthStore? = HKHealthStore.isHealthDataAvailable() ? HKHealthStore() : nil
    @ObservationIgnored private var hkWorkoutSession: HKWorkoutSession?
    @ObservationIgnored private var isMirroredSession = false
    @ObservationIgnored private lazy var hkDelegateProxy = HealthKitSessionDelegateProxy(coordinator: self)
    #endif
    #if os(watchOS)
    @ObservationIgnored private var hkWorkoutBuilder: HKLiveWorkoutBuilder?
    @ObservationIgnored private var lastLivePacketSentAt = Date.distantPast
    @ObservationIgnored private var lastActiveKcal = 0.0
    @ObservationIgnored private var lastBasalKcal = 0.0
    /// The delegate the system talks to (`handle(_:)` / `handleActiveWorkoutRecovery`) resolves
    /// the app's coordinator through this; the newest instance wins.
    public private(set) static weak var current: HealthKitWorkoutCoordinator?
    #endif

    public override init() {
        super.init()
        #if os(watchOS)
        Self.current = self
        #endif
    }

    public func requestAuthorization() async -> Bool {
        if isUITesting {
            isAuthorized = true
            return true
        }
        #if os(iOS) || os(watchOS)
        guard let healthStore else { return false }
        let typesToShare: Set<HKSampleType> = [
            HKObjectType.workoutType(),
            HKQuantityType(.heartRate),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.basalEnergyBurned),
        ]
        let typesToRead: Set<HKObjectType> = [
            HKQuantityType(.heartRate),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.basalEnergyBurned),
            HKQuantityType(.distanceWalkingRunning),
            HKQuantityType(.distanceCycling),
            HKQuantityType(.distanceSwimming),
            HKObjectType.workoutType(),
        ]
        do {
            try await healthStore.requestAuthorization(toShare: typesToShare, read: typesToRead)
            isAuthorized = true
            return true
        } catch {
            isAuthorized = false
            return false
        }
        #else
        return false
        #endif
    }

    private func resetWorkoutStats(startedAt: Date) {
        workoutStartedAt = startedAt
        currentHeartRateBpm = nil
        avgHeartRateBpm = nil
        maxHeartRateBpm = nil
        minHeartRateBpm = nil
        activeCaloriesKcal = 0
        totalCaloriesKcal = 0
        heartRateSamples = []
        currentSetHrBuffer = []
        allRecordedBpms = []
        lastSampleOffsetSec = -5
        #if os(watchOS)
        lastActiveKcal = 0
        lastBasalKcal = 0
        lastLivePacketSentAt = .distantPast
        #endif
    }

    public func startWorkout(sessionType: SessionType, startedAt: Date = Date()) async {
        #if os(iOS)
        // A mirrored Watch session may already be streaming for this workout — keep its metrics.
        if isWatchSessionActive {
            workoutStartedAt = workoutStartedAt ?? startedAt
            isWorkoutRunning = true
            isWorkoutPaused = false
        } else {
            resetWorkoutStats(startedAt: startedAt)
            isWorkoutRunning = true
            isWorkoutPaused = false
        }
        if !isUITesting, let healthStore {
            let config = HKWorkoutConfiguration()
            config.activityType = sessionType == .STRETCHING ? .flexibility : .traditionalStrengthTraining
            config.locationType = .indoor
            try? await healthStore.startWatchApp(toHandle: config)
        }
        #elseif os(watchOS)
        // Idempotent: a second start for the same workout keeps stats and the running session.
        if !isWorkoutRunning {
            resetWorkoutStats(startedAt: startedAt)
        }
        isWorkoutRunning = true
        isWorkoutPaused = false
        if !isUITesting, let healthStore, hkWorkoutSession == nil {
            let config = HKWorkoutConfiguration()
            config.activityType = sessionType == .STRETCHING ? .flexibility : .traditionalStrengthTraining
            config.locationType = .indoor
            do {
                let session = try HKWorkoutSession(healthStore: healthStore, configuration: config)
                let builder = session.associatedWorkoutBuilder()
                builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: config)
                session.delegate = hkDelegateProxy
                builder.delegate = hkDelegateProxy
                hkWorkoutSession = session
                hkWorkoutBuilder = builder
                session.startActivity(with: startedAt)
                try await builder.beginCollection(at: startedAt)
                try? await session.startMirroringToCompanionDevice()
            } catch {
                hkWorkoutSession = nil
                hkWorkoutBuilder = nil
            }
        }
        #else
        resetWorkoutStats(startedAt: startedAt)
        isWorkoutRunning = true
        isWorkoutPaused = false
        #endif
    }

    /// Processes a 1 Hz optical Heart Rate reading from Apple Watch (`HKLiveWorkoutBuilder`),
    /// updates live stats, buffers for the active set, and downsamples to 1 sample every 5 seconds.
    public func ingestHeartRateSample(bpm: Int, at timestamp: Date = Date()) {
        guard (20...260).contains(bpm) else { return }
        currentHeartRateBpm = bpm
        currentSetHrBuffer.append(bpm)
        allRecordedBpms.append(bpm)

        avgHeartRateBpm = Int((Double(allRecordedBpms.reduce(0, +)) / Double(allRecordedBpms.count)).rounded())
        maxHeartRateBpm = allRecordedBpms.max()
        minHeartRateBpm = allRecordedBpms.min()

        let start = workoutStartedAt ?? timestamp
        let offsetSec = max(0, Int(timestamp.timeIntervalSince(start).rounded()))
        if offsetSec - lastSampleOffsetSec >= 5 || heartRateSamples.isEmpty {
            heartRateSamples.append(HeartRateSampleDto(offsetSec: offsetSec, bpm: bpm))
            lastSampleOffsetSec = offsetSec
        }
        onLiveMetricsReceived?()
    }

    public func ingestEnergyBurned(activeKcal: Double, basalKcal: Double = 0) {
        activeCaloriesKcal = max(0, (activeKcal * 10.0).rounded() / 10.0)
        totalCaloriesKcal = max(activeCaloriesKcal, ((activeKcal + basalKcal) * 10.0).rounded() / 10.0)
    }

    /// Snapshots `avgHeartRateBpm` and `peakHeartRateBpm` when the athlete taps "Done" on a set.
    public func snapshotCompletedSetTelemetry() -> (avgBpm: Int?, peakBpm: Int?) {
        let buffer = !currentSetHrBuffer.isEmpty ? currentSetHrBuffer : (currentHeartRateBpm.map { [$0] } ?? [])
        currentSetHrBuffer.removeAll()
        guard !buffer.isEmpty else { return (nil, nil) }
        let avg = Int((Double(buffer.reduce(0, +)) / Double(buffer.count)).rounded())
        let peak = buffer.max()
        return (avg, peak)
    }

    /// Snapshots `restEndHeartRateBpm` when the rest timer finishes to capture Heart Rate Recovery.
    public func snapshotRestEndHeartRate() -> Int? {
        currentSetHrBuffer.removeAll()
        return currentHeartRateBpm
    }

    public func pauseWorkout() {
        isWorkoutPaused = true
        #if os(watchOS)
        hkWorkoutSession?.pause()
        #endif
    }

    public func resumeWorkout() {
        isWorkoutPaused = false
        #if os(watchOS)
        hkWorkoutSession?.resume()
        #endif
    }

    public func finishWorkout(clientSessionId: String) async -> FinalizedHealthKitMetrics {
        isWorkoutRunning = false
        isWorkoutPaused = false
        #if os(watchOS)
        // Deliberately NOT saved as an HKWorkout: the iPhone's `WorkoutHealthExport` stays the
        // single Apple Health exporter (keyed by sync identifier).
        if let session = hkWorkoutSession {
            session.end()
            if let builder = hkWorkoutBuilder {
                try? await builder.endCollection(at: Date())
                builder.discardWorkout()
            }
            hkWorkoutSession = nil
            hkWorkoutBuilder = nil
        }
        #endif
        #if os(iOS)
        // The mirrored session is owned by the Watch; it ends itself when the Watch finishes.
        if isMirroredSession {
            hkWorkoutSession = nil
            isMirroredSession = false
        }
        isWatchSessionActive = false
        #endif
        // The Apple Health workout is saved afterwards by `WorkoutHealthExport` (iPhone), which
        // sets the real UUID; no workout exists yet at this point.
        return FinalizedHealthKitMetrics(
            healthKitWorkoutUuid: nil,
            activeCaloriesKcal: activeCaloriesKcal,
            totalCaloriesKcal: totalCaloriesKcal,
            avgHeartRateBpm: avgHeartRateBpm,
            maxHeartRateBpm: maxHeartRateBpm,
            minHeartRateBpm: minHeartRateBpm,
            heartRateSamples: heartRateSamples
        )
    }

    // MARK: - HealthKit session plumbing (watchOS owns the session, iOS mirrors it)

    #if os(iOS) || os(watchOS)
    func handleSessionStateChange(to state: HKWorkoutSessionState) {
        switch state {
        case .running:
            isWorkoutRunning = true
            isWorkoutPaused = false
        case .paused:
            isWorkoutPaused = true
        case .ended, .stopped:
            isWorkoutRunning = false
            #if os(iOS)
            isWatchSessionActive = false
            if isMirroredSession {
                hkWorkoutSession = nil
                isMirroredSession = false
            }
            #endif
        case .notStarted, .prepared:
            break
        @unknown default:
            break
        }
    }

    func handleSessionFailure() {
        isWorkoutRunning = false
        #if os(iOS)
        isWatchSessionActive = false
        if isMirroredSession {
            hkWorkoutSession = nil
            isMirroredSession = false
        }
        #endif
        #if os(watchOS)
        hkWorkoutSession = nil
        hkWorkoutBuilder = nil
        #endif
    }
    #endif

    #if os(iOS)
    /// Installs the handler for Watch-owned workout sessions mirrored to this iPhone: live heart
    /// rate and energy stream in via `sendToRemoteWorkoutSession` until the session ends.
    public func startObservingMirroredSessions() {
        guard !isUITesting, let healthStore else { return }
        healthStore.workoutSessionMirroringStartHandler = { [weak self] session in
            Task { @MainActor in
                self?.attachMirroredSession(session)
            }
        }
    }

    private func attachMirroredSession(_ session: HKWorkoutSession) {
        hkWorkoutSession = session
        isMirroredSession = true
        session.delegate = hkDelegateProxy
        isWatchSessionActive = true
        isWorkoutRunning = true
        workoutStartedAt = workoutStartedAt ?? session.startDate ?? Date()
    }

    func handleRemoteWorkoutData(_ data: [Data]) {
        for chunk in data {
            guard let packet = try? JSONDecoder().decode(WorkoutLiveMetricsPacket.self, from: chunk) else { continue }
            if let bpm = packet.bpm {
                ingestHeartRateSample(bpm: bpm, at: packet.sentAt)
            } else {
                onLiveMetricsReceived?()
            }
            ingestEnergyBurned(activeKcal: packet.activeKcal, basalKcal: packet.basalKcal)
        }
    }
    #endif

    #if os(watchOS)
    /// Re-attaches delegates to the workout session the system recovered after an app relaunch
    /// (`handleActiveWorkoutRecovery` on the app delegate).
    public func recoverActiveWorkoutSession() {
        guard let healthStore else { return }
        healthStore.recoverActiveWorkoutSession { [weak self] session, _ in
            Task { @MainActor in
                guard let self, let session else { return }
                let builder = session.associatedWorkoutBuilder()
                builder.dataSource = HKLiveWorkoutDataSource(
                    healthStore: healthStore,
                    workoutConfiguration: session.workoutConfiguration
                )
                session.delegate = self.hkDelegateProxy
                builder.delegate = self.hkDelegateProxy
                self.hkWorkoutSession = session
                self.hkWorkoutBuilder = builder
                self.isWorkoutRunning = true
                self.isWorkoutPaused = session.state == .paused
                self.workoutStartedAt = self.workoutStartedAt ?? session.startDate
                try? await session.startMirroringToCompanionDevice()
            }
        }
    }

    func handleCollectedStatistics(_ statistics: HKStatistics?, for quantityType: HKQuantityType) {
        guard let statistics else { return }
        switch quantityType {
        case HKQuantityType(.heartRate):
            if let bpm = statistics.mostRecentQuantity()?.doubleValue(
                for: .count().unitDivided(by: .minute())
            ) {
                ingestHeartRateSample(bpm: Int(bpm.rounded()))
            }
        case HKQuantityType(.activeEnergyBurned):
            if let kcal = statistics.sumQuantity()?.doubleValue(for: .kilocalorie()) {
                lastActiveKcal = kcal
                ingestEnergyBurned(activeKcal: lastActiveKcal, basalKcal: lastBasalKcal)
            }
        case HKQuantityType(.basalEnergyBurned):
            if let kcal = statistics.sumQuantity()?.doubleValue(for: .kilocalorie()) {
                lastBasalKcal = kcal
                ingestEnergyBurned(activeKcal: lastActiveKcal, basalKcal: lastBasalKcal)
            }
        default:
            break
        }
        sendLiveMetricsIfDue()
    }

    private func sendLiveMetricsIfDue() {
        let now = Date()
        guard let session = hkWorkoutSession,
              now.timeIntervalSince(lastLivePacketSentAt) >= 2 else { return }
        lastLivePacketSentAt = now
        let packet = WorkoutLiveMetricsPacket(
            bpm: currentHeartRateBpm,
            activeKcal: activeCaloriesKcal,
            basalKcal: lastBasalKcal,
            sentAt: now
        )
        guard let data = try? JSONEncoder().encode(packet) else { return }
        Task { try? await session.sendToRemoteWorkoutSession(data: data) }
    }
    #endif
}

#if os(iOS) || os(watchOS)
/// HealthKit session/builder delegates fire off-actor; this proxy hops them onto the coordinator's
/// MainActor.
private final class HealthKitSessionDelegateProxy: NSObject, HKWorkoutSessionDelegate, @unchecked Sendable {
    weak var coordinator: HealthKitWorkoutCoordinator?

    init(coordinator: HealthKitWorkoutCoordinator) {
        self.coordinator = coordinator
    }

    func workoutSession(
        _ workoutSession: HKWorkoutSession,
        didChangeTo toState: HKWorkoutSessionState,
        from fromState: HKWorkoutSessionState,
        date: Date
    ) {
        Task { @MainActor [weak coordinator] in
            coordinator?.handleSessionStateChange(to: toState)
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: any Error) {
        Task { @MainActor [weak coordinator] in
            coordinator?.handleSessionFailure()
        }
    }

    #if os(iOS)
    func workoutSession(_ workoutSession: HKWorkoutSession, didReceiveDataFromRemoteWorkoutSession data: [Data]) {
        Task { @MainActor [weak coordinator] in
            coordinator?.handleRemoteWorkoutData(data)
        }
    }

    func workoutSession(_ workoutSession: HKWorkoutSession, didDisconnectFromRemoteDeviceWithError error: (any Error)?) {
        Task { @MainActor [weak coordinator] in
            coordinator?.handleSessionFailure()
        }
    }
    #endif
}

#if os(watchOS)
extension HealthKitSessionDelegateProxy: HKLiveWorkoutBuilderDelegate {
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {
        for sampleType in collectedTypes {
            guard let quantityType = sampleType as? HKQuantityType else { continue }
            let statistics = workoutBuilder.statistics(for: quantityType)
            Task { @MainActor [weak coordinator] in
                coordinator?.handleCollectedStatistics(statistics, for: quantityType)
            }
        }
    }

    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
#endif
#endif
