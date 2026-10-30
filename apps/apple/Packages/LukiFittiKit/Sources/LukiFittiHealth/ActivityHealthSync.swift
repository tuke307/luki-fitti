import Foundation
import Observation
import LukiFittiModels

#if canImport(HealthKit)
import HealthKit
#endif

/// Imports activity from Apple Health for the Food tab's burned calories:
///
/// - Daily active energy (all sources, deduplicated by HealthKit) for the recent days.
/// - Workouts from every app (Strava, Garmin, Fitness, LukiFitti itself, …) through an anchored
///   query. The anchor only moves forward once the upload callback reports success, so offline
///   runs simply retry later.
///
/// HealthKit never reveals read access, so empty results are treated as "no data".
@MainActor
@Observable
public final class ActivityHealthSync {
    /// `true` once the person has been asked for activity access on this device.
    public private(set) var hasRequestedAuthorization: Bool
    public private(set) var isSyncing = false
    /// Last successful upload of Apple Health activity.
    public private(set) var lastSyncAt: Date?
    public var isUITesting: Bool = ProcessInfo.processInfo.arguments.contains("--uitesting")

    private let defaults: UserDefaults
    private static let requestedKey = "lukifitti.health.activity.requested"
    private static let anchorKey = "lukifitti.health.workouts.anchor"
    private static let lastDayKey = "lukifitti.health.activity.lastUploadDay"
    private static let lastSyncKey = "lukifitti.health.activity.lastSyncAt"

    /// Days re-read on every import (late watch syncs, edits in other apps).
    public nonisolated static let recentDays = 30
    /// Imports closer together than this are skipped unless forced.
    public nonisolated static let throttle: TimeInterval = 5 * 60

    #if canImport(HealthKit)
    private let healthStore: HKHealthStore? = HKHealthStore.isHealthDataAvailable() ? HKHealthStore() : nil
    #endif

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.hasRequestedAuthorization = defaults.bool(forKey: Self.requestedKey)
        let last = defaults.double(forKey: Self.lastSyncKey)
        self.lastSyncAt = last > 0 ? Date(timeIntervalSince1970: last) : nil
    }

    public var isAvailable: Bool {
        #if canImport(HealthKit)
        return !isUITesting && healthStore != nil
        #else
        return false
        #endif
    }

    #if canImport(HealthKit)
    /// Everything LukiFitti writes: gym workouts and their active energy, plus weigh-ins.
    static var shareTypes: Set<HKSampleType> {
        [
            HKObjectType.workoutType(),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.bodyMass),
        ]
    }

    /// Everything LukiFitti reads: workouts and active energy from any app, distances for
    /// those workouts, live heart rate and body weight.
    static var readTypes: Set<HKObjectType> {
        [
            HKObjectType.workoutType(),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.distanceWalkingRunning),
            HKQuantityType(.distanceCycling),
            HKQuantityType(.distanceSwimming),
            HKQuantityType(.heartRate),
            HKQuantityType(.bodyMass),
        ]
    }
    #endif

    /// Asks for all Apple Health types LukiFitti uses in one sheet (the system skips types that
    /// were already answered, so repeats are cheap).
    @discardableResult
    public func requestAuthorization() async -> Bool {
        guard isAvailable else { return false }
        #if canImport(HealthKit)
        guard let healthStore else { return false }
        do {
            try await healthStore.requestAuthorization(toShare: Self.shareTypes, read: Self.readTypes)
            hasRequestedAuthorization = true
            defaults.set(true, forKey: Self.requestedKey)
            return true
        } catch {
            return false
        }
        #else
        return false
        #endif
    }

    // MARK: Import

    /// Reads daily active energy and workout changes and hands them to `upload` (which chunks
    /// within the API limits). Returns `true` when something was uploaded.
    @discardableResult
    public func importChanges(
        force: Bool = false,
        now: Date = Date(),
        upload: @MainActor (_ payload: ImportHealthActivityDto) async -> Bool
    ) async -> Bool {
        guard isAvailable, hasRequestedAuthorization, !isSyncing else { return false }
        if !force, let lastSyncAt, now.timeIntervalSince(lastSyncAt) < Self.throttle, now >= lastSyncAt {
            return false
        }
        #if canImport(HealthKit)
        guard let healthStore else { return false }
        isSyncing = true
        defer { isSyncing = false }

        let calendar = Self.localCalendar
        let today = calendar.startOfDay(for: now)
        let from = Self.importStart(today: today, lastUploadDay: defaults.string(forKey: Self.lastDayKey), calendar: calendar)
        let days = await dailyActiveEnergy(from: from, to: now, calendar: calendar, store: healthStore)

        let descriptor = HKAnchoredObjectQueryDescriptor(
            predicates: [.workout()],
            anchor: loadAnchor()
        )
        guard let result = try? await descriptor.result(for: healthStore) else { return false }
        let latestAllowed = now.addingTimeInterval(5 * 60)
        let ownBundle = Bundle.main.bundleIdentifier
        let workouts = result.addedSamples.compactMap { Self.input(for: $0, latestAllowed: latestAllowed, ownBundle: ownBundle) }
        let deleted = result.deletedObjects.map { $0.uuid.uuidString.lowercased() }
        let payload = ImportHealthActivityDto(days: days, workouts: workouts, deletedWorkoutUuids: deleted)

        guard !payload.isEmpty else {
            saveAnchor(result.newAnchor)
            markSynced(today: today, now: now)
            return false
        }
        guard await upload(payload) else { return false }
        saveAnchor(result.newAnchor)
        markSynced(today: today, now: now)
        return true
        #else
        return false
        #endif
    }

    /// Forgets the import position (e.g. on sign-out) so the next account imports everything.
    public func resetAnchors() {
        defaults.removeObject(forKey: Self.anchorKey)
        defaults.removeObject(forKey: Self.lastDayKey)
        defaults.removeObject(forKey: Self.lastSyncKey)
        lastSyncAt = nil
    }

    // MARK: Helpers

    nonisolated static var localCalendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = .current
        cal.locale = Locale(identifier: "en_US_POSIX")
        return cal
    }

    /// First day to read: the last 30 days, or from the day before the last successful upload
    /// when that is earlier (catches up after a long offline stretch), at most 400 days back.
    nonisolated static func importStart(today: Date, lastUploadDay: String?, calendar: Calendar) -> Date {
        let recent = calendar.date(byAdding: .day, value: -(recentDays - 1), to: today) ?? today
        let oldest = calendar.date(byAdding: .day, value: -(HealthActivityLimits.importMaxDays - 1), to: today) ?? today
        var start = recent
        if let lastUploadDay, let last = LukiDayKey.date(lastUploadDay, calendar: calendar),
           let before = calendar.date(byAdding: .day, value: -1, to: last) {
            start = min(start, before)
        }
        return max(start, oldest)
    }

    private func markSynced(today: Date, now: Date) {
        defaults.set(LukiDayKey.string(today, timeZone: Self.localCalendar.timeZone), forKey: Self.lastDayKey)
        defaults.set(now.timeIntervalSince1970, forKey: Self.lastSyncKey)
        lastSyncAt = now
    }

    #if canImport(HealthKit)
    private func dailyActiveEnergy(
        from: Date, to: Date, calendar: Calendar, store: HKHealthStore
    ) async -> [HealthDailyEnergyInputDto] {
        let predicate = HKQuery.predicateForSamples(withStart: from, end: to)
        let descriptor = HKStatisticsCollectionQueryDescriptor(
            predicate: .quantitySample(type: HKQuantityType(.activeEnergyBurned), predicate: predicate),
            options: .cumulativeSum,
            anchorDate: calendar.startOfDay(for: from),
            intervalComponents: DateComponents(day: 1)
        )
        guard let collection = try? await descriptor.result(for: store) else { return [] }
        return collection.statistics().compactMap { stats in
            guard let sum = stats.sumQuantity() else { return nil }
            let kcal = sum.doubleValue(for: .kilocalorie())
            guard kcal.isFinite else { return nil }
            let clamped = min(HealthActivityLimits.kcalRange.upperBound, max(0, kcal))
            return HealthDailyEnergyInputDto(
                day: LukiDayKey.string(stats.startDate, timeZone: calendar.timeZone),
                activeKcal: (clamped * 10).rounded() / 10
            )
        }
    }

    static func input(for workout: HKWorkout, latestAllowed: Date, ownBundle: String?) -> HealthWorkoutInputDto? {
        guard workout.endDate > workout.startDate,
              workout.endDate <= latestAllowed,
              workout.endDate.timeIntervalSince(workout.startDate) <= 48 * 3600 else { return nil }
        let source = workout.sourceRevision.source
        let isOwn = source == HKSource.default()
            || (ownBundle.map { source.bundleIdentifier.hasPrefix($0) } ?? false)
        let kcal = workout.statistics(for: HKQuantityType(.activeEnergyBurned))?
            .sumQuantity()?
            .doubleValue(for: .kilocalorie())
        let distanceTypes: [HKQuantityTypeIdentifier] = [.distanceWalkingRunning, .distanceCycling, .distanceSwimming]
        let meters = distanceTypes.lazy
            .compactMap { workout.statistics(for: HKQuantityType($0))?.sumQuantity()?.doubleValue(for: .meter()) }
            .first { $0 > 0 && $0.isFinite }
        return HealthWorkoutInputDto(
            healthKitUuid: workout.uuid.uuidString.lowercased(),
            activityType: activityTypeName(workout.workoutActivityType),
            sourceName: String(source.name.prefix(HealthActivityLimits.sourceNameMaxLength)),
            isOwn: isOwn,
            startedAt: LukiISODate.string(workout.startDate),
            endedAt: LukiISODate.string(workout.endDate),
            activeKcal: kcal.flatMap { $0.isFinite ? (min(HealthActivityLimits.kcalRange.upperBound, max(0, $0)) * 10).rounded() / 10 : nil },
            distanceMeters: meters.map { ($0 * 10).rounded() / 10 }
        )
    }

    /// camelCase `HKWorkoutActivityType` name for the common types, else `other`.
    static func activityTypeName(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: "running"
        case .cycling: "cycling"
        case .walking: "walking"
        case .swimming: "swimming"
        case .hiking: "hiking"
        case .traditionalStrengthTraining: "traditionalStrengthTraining"
        case .functionalStrengthTraining: "functionalStrengthTraining"
        case .highIntensityIntervalTraining: "highIntensityIntervalTraining"
        case .yoga: "yoga"
        case .rowing: "rowing"
        case .elliptical: "elliptical"
        case .flexibility: "flexibility"
        default: "other"
        }
    }

    private func loadAnchor() -> HKQueryAnchor? {
        guard let data = defaults.data(forKey: Self.anchorKey) else { return nil }
        return try? NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
    }

    private func saveAnchor(_ anchor: HKQueryAnchor) {
        guard let data = try? NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true) else { return }
        defaults.set(data, forKey: Self.anchorKey)
    }
    #endif
}
