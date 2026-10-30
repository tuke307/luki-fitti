import Foundation
import Observation
import LukiFittiModels
import LukiFittiDomain

#if canImport(HealthKit)
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
    public var isUITesting: Bool = ProcessInfo.processInfo.arguments.contains("--uitesting")

    private var lastSampleOffsetSec: Int = -5
    private var allRecordedBpms: [Int] = []

    #if canImport(HealthKit)
    private let healthStore: HKHealthStore? = HKHealthStore.isHealthDataAvailable() ? HKHealthStore() : nil
    #endif

    public override init() {
        super.init()
    }

    public func requestAuthorization() async -> Bool {
        if isUITesting {
            isAuthorized = true
            return true
        }
        #if canImport(HealthKit)
        guard let healthStore else { return false }
        let typesToShare: Set<HKSampleType> = [
            HKObjectType.workoutType(),
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

    public func startWorkout(sessionType: SessionType, startedAt: Date = Date()) async {
        workoutStartedAt = startedAt
        isWorkoutRunning = true
        isWorkoutPaused = false
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

        #if canImport(HealthKit) && os(iOS)
        if !isUITesting, let healthStore {
            let config = HKWorkoutConfiguration()
            config.activityType = sessionType == .STRETCHING ? .flexibility : .traditionalStrengthTraining
            config.locationType = .indoor
            try? await healthStore.startWatchApp(toHandle: config)
        }
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
    }

    public func resumeWorkout() {
        isWorkoutPaused = false
    }

    public func finishWorkout(clientSessionId: String) async -> FinalizedHealthKitMetrics {
        isWorkoutRunning = false
        isWorkoutPaused = false
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
}
