import Foundation
import Observation
import LukiFittiModels

#if canImport(HealthKit)
import HealthKit
#endif

/// Two-way Apple Health sync for body weight, separate from the workout coordinator.
///
/// - Import: an anchored query returns weigh-ins added/deleted in Apple Health since the last
///   successful upload (samples written by LukiFitti itself are excluded). The anchor only moves
///   forward once the upload callback reports success, so offline runs simply retry later.
/// - Export: manual weigh-ins are written as `HKQuantitySample`s keyed by
///   `HKMetadataKeySyncIdentifier` = `clientEntryId`, so edits replace the earlier sample.
@MainActor
@Observable
public final class BodyMassHealthSync {
    /// `true` once the person has been asked for body-weight access on this device.
    public private(set) var hasRequestedAuthorization: Bool
    public private(set) var isSyncing = false
    public var isUITesting: Bool = ProcessInfo.processInfo.arguments.contains("--uitesting")

    private let defaults: UserDefaults
    private static let requestedKey = "lukifitti.health.bodyMass.requested"
    private static let anchorKey = "lukifitti.health.bodyMass.anchor"

    #if canImport(HealthKit)
    private let healthStore: HKHealthStore? = HKHealthStore.isHealthDataAvailable() ? HKHealthStore() : nil
    private var bodyMassType: HKQuantityType { HKQuantityType(.bodyMass) }
    #endif

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        self.hasRequestedAuthorization = defaults.bool(forKey: Self.requestedKey)
    }

    public var isAvailable: Bool {
        #if canImport(HealthKit)
        return !isUITesting && healthStore != nil
        #else
        return false
        #endif
    }

    /// Asks for read + write access to body weight (once; the system ignores repeats).
    @discardableResult
    public func requestAuthorization() async -> Bool {
        guard isAvailable else { return false }
        #if canImport(HealthKit)
        guard let healthStore else { return false }
        do {
            try await healthStore.requestAuthorization(toShare: [bodyMassType], read: [bodyMassType])
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

    /// Whether LukiFitti may write weigh-ins (read access is never disclosed by HealthKit).
    public var canWrite: Bool {
        #if canImport(HealthKit)
        guard isAvailable, let healthStore else { return false }
        return healthStore.authorizationStatus(for: bodyMassType) == .sharingAuthorized
        #else
        return false
        #endif
    }

    // MARK: Import

    /// Reads changes since the stored anchor and hands them to `upload`. Only runs after the
    /// person was asked for access. Returns `true` when something new was uploaded.
    @discardableResult
    public func importChanges(
        upload: @MainActor (_ samples: [BodyWeightHealthKitSampleDto], _ deletedUuids: [String]) async -> Bool
    ) async -> Bool {
        guard isAvailable, hasRequestedAuthorization, !isSyncing else { return false }
        #if canImport(HealthKit)
        guard let healthStore else { return false }
        isSyncing = true
        defer { isSyncing = false }

        let notOwn = NSCompoundPredicate(notPredicateWithSubpredicate: HKQuery.predicateForObjects(from: HKSource.default()))
        let descriptor = HKAnchoredObjectQueryDescriptor(
            predicates: [.quantitySample(type: bodyMassType, predicate: notOwn)],
            anchor: loadAnchor()
        )
        guard let result = try? await descriptor.result(for: healthStore) else { return false }

        let latestAllowed = Date().addingTimeInterval(5 * 60)
        let kg = HKUnit.gramUnit(with: .kilo)
        let samples = result.addedSamples.compactMap { sample -> BodyWeightHealthKitSampleDto? in
            let value = sample.quantity.doubleValue(for: kg)
            guard BodyWeightLimits.kgRange.contains(value), sample.startDate <= latestAllowed else { return nil }
            return BodyWeightHealthKitSampleDto(
                healthKitUuid: sample.uuid.uuidString.lowercased(),
                measuredAt: LukiISODate.string(sample.startDate),
                weightKg: (value * 100).rounded() / 100
            )
        }
        let deleted = result.deletedObjects.map { $0.uuid.uuidString.lowercased() }
        let newAnchor = result.newAnchor

        guard !samples.isEmpty || !deleted.isEmpty else {
            saveAnchor(newAnchor)
            return false
        }
        guard await upload(samples, deleted) else { return false }
        saveAnchor(newAnchor)
        return true
        #else
        return false
        #endif
    }

    /// Forgets the import position (e.g. on sign-out) so the next account imports everything.
    public func resetImportAnchor() {
        defaults.removeObject(forKey: Self.anchorKey)
    }

    // MARK: Export

    /// Writes (or replaces) the Apple Health sample for a manual weigh-in.
    public func export(_ entry: BodyWeightEntryDto) async {
        guard entry.source == .MANUAL, canWrite, let date = entry.measuredAtDate else { return }
        #if canImport(HealthKit)
        guard let healthStore else { return }
        let version = Int64(((entry.updatedAtDate ?? Date()).timeIntervalSince1970 * 1000).rounded())
        let sample = HKQuantitySample(
            type: bodyMassType,
            quantity: HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: entry.weightKg),
            start: date,
            end: date,
            metadata: [
                HKMetadataKeySyncIdentifier: entry.clientEntryId,
                HKMetadataKeySyncVersion: NSNumber(value: version),
                HKMetadataKeyWasUserEntered: true,
            ]
        )
        try? await healthStore.save(sample)
        #endif
    }

    /// Removes the Apple Health sample LukiFitti wrote for a manual weigh-in.
    public func deleteExported(clientEntryId: String) async {
        guard canWrite else { return }
        #if canImport(HealthKit)
        guard let healthStore else { return }
        let predicate = HKQuery.predicateForObjects(
            withMetadataKey: HKMetadataKeySyncIdentifier,
            allowedValues: [clientEntryId]
        )
        _ = try? await healthStore.deleteObjects(of: bodyMassType, predicate: predicate)
        #endif
    }

    // MARK: Anchor persistence

    #if canImport(HealthKit)
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
