import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain
@testable import LukiFittiAPI
@testable import LukiFittiStore
@testable import LukiFittiWatchSync

final class LukiFittiStoreTests: XCTestCase {
    @MainActor
    func testOfflineStoreAddsNewlyBundledExercisesToTheSavedCatalog() throws {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("LukiFittiStoreTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: tempDir) }

        let fresh = OfflineStore(storageDirectory: tempDir)
        try JSONEncoder().encode(Array(fresh.catalog.dropLast(5)))
            .write(to: tempDir.appendingPathComponent("exercise_catalog.json"))

        let store = OfflineStore(storageDirectory: tempDir)
        XCTAssertEqual(Set(store.catalog.map(\.id)), Set(fresh.catalog.map(\.id)))
    }

    @MainActor
    func testOfflineStorePersistsActiveSessionAndSyncQueueAndMergesWatchMutations() throws {
        let tempDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("LukiFittiStoreTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: tempDir) }

        let store = OfflineStore(storageDirectory: tempDir)
        XCTAssertFalse(store.catalog.isEmpty)
        XCTAssertEqual(store.folders.count, 3)

        let template = store.folders[0].templates[0]
        var session = SessionCalculator.createOfflineSessionFromTemplate(
            template: template,
            catalog: store.catalog,
            userId: "user-1",
            weightUnit: .KG,
            sourceDevice: .APPLE_WATCH
        )

        let firstEx = session.exercises[0]
        let firstSet = firstEx.sets.first(where: { $0.setType == .WORKING })!
        let workingSetIdx = firstEx.sets.firstIndex(where: { $0.setType == .WORKING })!

        var timestamps: [String: Int64] = [:]
        let mutation = SessionMutationPacket(
            clientSessionId: session.clientSessionId,
            clientExerciseId: firstEx.clientExerciseId,
            clientSetId: firstSet.clientSetId,
            weight: 92.5,
            reps: 8,
            completed: true,
            avgHeartRateBpm: 144,
            peakHeartRateBpm: 169,
            restEndHeartRateBpm: 120,
            timestampMs: 1_700_000_001_000,
            newVersion: 2
        )

        session = WatchSyncMerger.applyMutation(mutation, to: session, lastAppliedTimestamps: &timestamps)
        XCTAssertEqual(session.totalSetsCompleted, 1)
        XCTAssertEqual(session.totalVolumeKg, 740.0)
        XCTAssertEqual(session.exercises[0].sets[workingSetIdx].peakHeartRateBpm, 169)

        // Older out-of-order mutation must be ignored by last-write-wins timestamp merger
        let staleMutation = SessionMutationPacket(
            clientSessionId: session.clientSessionId,
            clientExerciseId: firstEx.clientExerciseId,
            clientSetId: firstSet.clientSetId,
            weight: 60.0,
            reps: 5,
            completed: false,
            timestampMs: 1_700_000_000_500,
            newVersion: 1
        )
        session = WatchSyncMerger.applyMutation(staleMutation, to: session, lastAppliedTimestamps: &timestamps)
        XCTAssertEqual(session.exercises[0].sets[workingSetIdx].weight, 92.5)
        XCTAssertTrue(session.exercises[0].sets[workingSetIdx].completed)

        store.saveActiveSession(session)
        store.enqueueSessionSync(session)

        // Reload store from disk to verify persistence
        let reloadedStore = OfflineStore(storageDirectory: tempDir)
        XCTAssertEqual(reloadedStore.activeSession?.clientSessionId, session.clientSessionId)
        XCTAssertEqual(reloadedStore.activeSession?.totalVolumeKg, 740.0)
        XCTAssertEqual(reloadedStore.syncQueue.count, 1)
        XCTAssertEqual(reloadedStore.syncQueue.first?.payload.exercises.first?.sets[workingSetIdx].peakHeartRateBpm, 169)
    }
}
