import Foundation
import LukiFittiModels
import LukiFittiDomain

#if canImport(HealthKit)
import HealthKit
#endif

/// Saves finished LukiFitti gym sessions to Apple Health as `HKWorkout`s (closing Move and
/// Exercise rings) and removes them again when the session is deleted.
///
/// Workouts are keyed by `HKMetadataKeySyncIdentifier` = `clientSessionId` with the session
/// version, so re-exporting an edited session replaces the earlier workout. Active energy is only
/// added when no other app recorded a workout at the same time (e.g. an Apple Watch strength
/// workout), so the calories aren't counted twice.
@MainActor
public final class WorkoutHealthExport {
    public var isUITesting: Bool = ProcessInfo.processInfo.arguments.contains("--uitesting")

    #if canImport(HealthKit)
    private let healthStore: HKHealthStore? = HKHealthStore.isHealthDataAvailable() ? HKHealthStore() : nil
    #endif

    public init() {}

    public var isAvailable: Bool {
        #if canImport(HealthKit)
        return !isUITesting && healthStore != nil
        #else
        return false
        #endif
    }

    /// Whether LukiFitti may write workouts (read access is never disclosed by HealthKit).
    public var canWrite: Bool {
        #if canImport(HealthKit)
        guard isAvailable, let healthStore else { return false }
        return healthStore.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized
        #else
        return false
        #endif
    }

    /// Writes (or replaces) the Apple Health workout for a completed session and returns its
    /// lowercase UUID, or `nil` when nothing was written (no access, not completed, failure).
    public func export(_ session: WorkoutSessionDto, bodyWeightKg: Double?) async -> String? {
        guard canWrite, session.status == .COMPLETED,
              let start = LukiISODate.parse(session.startedAt),
              let end = session.completedAt.flatMap(LukiISODate.parse),
              end > start else { return nil }
        #if canImport(HealthKit) && (os(iOS) || os(watchOS))
        guard let healthStore else { return nil }
        let canWriteEnergy = healthStore.authorizationStatus(for: HKQuantityType(.activeEnergyBurned)) == .sharingAuthorized
        let kcal = Double(NutritionMath.burnedKcal(for: session, bodyWeightKg: bodyWeightKg))
        let request = Request(
            clientSessionId: session.clientSessionId,
            version: session.version,
            isStretching: session.sessionType == .STRETCHING,
            start: start,
            end: end,
            kcal: canWriteEnergy && kcal > 0 ? kcal : nil,
            // Always clear an earlier export first: a re-sent session may carry the same version.
            replacesExisting: true
        )
        guard let uuid = try? await Self.save(request, store: healthStore) else { return nil }
        return uuid.uuidString.lowercased()
        #else
        return nil
        #endif
    }

    /// Removes the Apple Health workout (and its energy sample) LukiFitti wrote for a session.
    public func deleteExported(clientSessionId: String) async {
        guard canWrite else { return }
        #if canImport(HealthKit)
        guard let healthStore else { return }
        await Self.delete(clientSessionId: clientSessionId, store: healthStore)
        #endif
    }

    #if canImport(HealthKit)
    nonisolated struct Request: Sendable {
        let clientSessionId: String
        let version: Int
        let isStretching: Bool
        let start: Date
        let end: Date
        let kcal: Double?
        let replacesExisting: Bool
    }

    nonisolated static func energySyncIdentifier(_ clientSessionId: String) -> String { "\(clientSessionId)-energy" }

    nonisolated private static func delete(clientSessionId: String, store: HKHealthStore) async {
        let workouts = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues: [clientSessionId])
        let energy = HKQuery.predicateForObjects(
            withMetadataKey: HKMetadataKeySyncIdentifier,
            allowedValues: [energySyncIdentifier(clientSessionId)]
        )
        _ = try? await store.deleteObjects(of: HKObjectType.workoutType(), predicate: workouts)
        _ = try? await store.deleteObjects(of: HKQuantityType(.activeEnergyBurned), predicate: energy)
    }

    #if os(iOS) || os(watchOS)
    nonisolated private static func save(_ request: Request, store: HKHealthStore) async throws -> UUID? {
        if request.replacesExisting {
            await delete(clientSessionId: request.clientSessionId, store: store)
        }
        let includeEnergy: Bool
        if request.kcal != nil {
            includeEnergy = await !hasOtherWorkout(from: request.start, to: request.end, store: store)
        } else {
            includeEnergy = false
        }

        let configuration = HKWorkoutConfiguration()
        configuration.activityType = request.isStretching ? .flexibility : .traditionalStrengthTraining
        configuration.locationType = .indoor
        let builder = HKWorkoutBuilder(healthStore: store, configuration: configuration, device: .local())
        try await builder.beginCollection(at: request.start)
        try await builder.addMetadata([
            HKMetadataKeySyncIdentifier: request.clientSessionId,
            HKMetadataKeySyncVersion: NSNumber(value: request.version),
            HKMetadataKeyIndoorWorkout: true,
        ])
        if includeEnergy, let kcal = request.kcal {
            let sample = HKQuantitySample(
                type: HKQuantityType(.activeEnergyBurned),
                quantity: HKQuantity(unit: .kilocalorie(), doubleValue: kcal),
                start: request.start,
                end: request.end,
                metadata: [
                    HKMetadataKeySyncIdentifier: energySyncIdentifier(request.clientSessionId),
                    HKMetadataKeySyncVersion: NSNumber(value: request.version),
                ]
            )
            try await builder.addSamples([sample])
        }
        try await builder.endCollection(at: request.end)
        return try await builder.finishWorkout()?.uuid
    }

    /// Whether another app (e.g. an Apple Watch workout) recorded a workout overlapping the range.
    nonisolated private static func hasOtherWorkout(from start: Date, to end: Date, store: HKHealthStore) async -> Bool {
        let inRange = HKQuery.predicateForSamples(withStart: start, end: end)
        let notOwn = NSCompoundPredicate(notPredicateWithSubpredicate: HKQuery.predicateForObjects(from: HKSource.default()))
        let descriptor = HKSampleQueryDescriptor(
            predicates: [.workout(NSCompoundPredicate(andPredicateWithSubpredicates: [inRange, notOwn]))],
            sortDescriptors: [],
            limit: 1
        )
        let results = (try? await descriptor.result(for: store)) ?? []
        return !results.isEmpty
    }
    #endif
    #endif
}
