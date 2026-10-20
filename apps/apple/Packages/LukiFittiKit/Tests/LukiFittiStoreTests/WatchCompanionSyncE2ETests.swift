import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain
@testable import LukiFittiAPI
@testable import LukiFittiStore
@testable import LukiFittiWatchSync

final class WatchCompanionSyncE2ETests: XCTestCase {
    @MainActor
    func testIPhoneToWatchContextPushAndLiveSetMutationSync() throws {
        let iPhoneDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("LukiFittiIPhoneSyncE2E-\(UUID().uuidString)", isDirectory: true)
        let watchDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("LukiFittiWatchSyncE2E-\(UUID().uuidString)", isDirectory: true)
        defer {
            try? FileManager.default.removeItem(at: iPhoneDir)
            try? FileManager.default.removeItem(at: watchDir)
        }

        let iPhoneStore = OfflineStore(storageDirectory: iPhoneDir)
        let watchStore = OfflineStore(storageDirectory: watchDir)

        let template = iPhoneStore.folders[0].templates[0]
        let startedSession = SessionCalculator.createOfflineSessionFromTemplate(
            template: template,
            catalog: iPhoneStore.catalog,
            userId: "user-companion-1",
            weightUnit: .KG,
            sourceDevice: .IPHONE
        )
        iPhoneStore.saveActiveSession(startedSession)

        // 1. iPhone pushes application context & active session snapshot to Watch
        let contextPayload = WatchContextPayload(
            catalog: iPhoneStore.catalog,
            folders: iPhoneStore.folders,
            unfiledTemplates: iPhoneStore.unfiledTemplates,
            stretchingRoutines: iPhoneStore.stretchingRoutines,
            historySessions: iPhoneStore.historySessions,
            preferences: iPhoneStore.preferences,
            activeSession: iPhoneStore.activeSession
        )
        watchStore.saveCatalog(contextPayload.catalog)
        watchStore.saveWorkoutsOverview(
            folders: contextPayload.folders,
            unfiledTemplates: contextPayload.unfiledTemplates
        )
        watchStore.saveActiveSession(contextPayload.activeSession)

        XCTAssertEqual(watchStore.activeSession?.clientSessionId, startedSession.clientSessionId)
        XCTAssertEqual(watchStore.activeSession?.workoutNameSnapshot, template.name)

        // 2. Athlete completes a working set on Apple Watch with 1 Hz optical HR telemetry
        let firstExercise = try XCTUnwrap(watchStore.activeSession?.exercises.first)
        let workingSet = try XCTUnwrap(firstExercise.sets.first(where: { $0.setType == .WORKING }))

        let watchMutation = SessionMutationPacket(
            clientSessionId: startedSession.clientSessionId,
            clientExerciseId: firstExercise.clientExerciseId,
            clientSetId: workingSet.clientSetId,
            weight: 100.0,
            reps: 8,
            rpe: 8.5,
            completed: true,
            avgHeartRateBpm: 152,
            peakHeartRateBpm: 174,
            restEndHeartRateBpm: 128,
            restTimerEndsAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(90)),
            restTimerDurationSec: 90,
            timestampMs: 1_760_000_010_000,
            newVersion: 2
        )

        var iPhoneTimestamps: [String: Int64] = [:]
        let currentIPhoneActive = try XCTUnwrap(iPhoneStore.activeSession)
        let mergedOnIPhone = WatchSyncMerger.applyMutation(
            watchMutation,
            to: currentIPhoneActive,
            lastAppliedTimestamps: &iPhoneTimestamps
        )
        iPhoneStore.saveActiveSession(mergedOnIPhone)
        iPhoneStore.enqueueSessionSync(mergedOnIPhone)

        XCTAssertEqual(iPhoneStore.activeSession?.totalSetsCompleted, 1)
        XCTAssertEqual(iPhoneStore.activeSession?.totalVolumeKg, 800.0)
        XCTAssertEqual(iPhoneStore.activeSession?.restTimerDurationSec, 90)
        XCTAssertEqual(iPhoneStore.syncQueue.count, 1)
    }

    @MainActor
    func testStandaloneWatchWorkoutCompletionMergesIntoIPhoneHistoryAndSyncQueue() throws {
        let iPhoneDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("LukiFittiIPhoneStandaloneE2E-\(UUID().uuidString)", isDirectory: true)
        let watchDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("LukiFittiWatchStandaloneE2E-\(UUID().uuidString)", isDirectory: true)
        defer {
            try? FileManager.default.removeItem(at: iPhoneDir)
            try? FileManager.default.removeItem(at: watchDir)
        }

        let iPhoneStore = OfflineStore(storageDirectory: iPhoneDir)
        let watchStore = OfflineStore(storageDirectory: watchDir)

        let template = watchStore.folders[0].templates[0]
        var watchSession = SessionCalculator.createOfflineSessionFromTemplate(
            template: template,
            catalog: watchStore.catalog,
            userId: "user-watch-standalone",
            weightUnit: .KG,
            sourceDevice: .APPLE_WATCH
        )

        // Complete all sets on first exercise on Watch
        for idx in watchSession.exercises[0].sets.indices {
            watchSession.exercises[0].sets[idx].completed = true
            watchSession.exercises[0].sets[idx].weight = 80.0
            watchSession.exercises[0].sets[idx].reps = 10
        }
        watchSession.exercises[0].status = .COMPLETED
        watchSession.status = .COMPLETED
        watchSession.completedAt = ISO8601DateFormatter().string(from: Date())
        watchSession.activeCaloriesKcal = 345.0
        watchSession.totalCaloriesKcal = 420.0
        watchSession.avgHeartRateBpm = 148
        watchSession.maxHeartRateBpm = 179
        watchSession = SessionCalculator.recalculateSessionTotals(watchSession)

        // Simulate Watch transferring completed session to iPhone companion
        iPhoneStore.saveHistorySession(watchSession)
        iPhoneStore.enqueueSessionSync(watchSession)

        XCTAssertEqual(iPhoneStore.historySessions.count, 1)
        XCTAssertEqual(iPhoneStore.historySessions.first?.sourceDevice, .APPLE_WATCH)
        XCTAssertEqual(iPhoneStore.historySessions.first?.activeCaloriesKcal, 345.0)
        XCTAssertEqual(iPhoneStore.historySessions.first?.avgHeartRateBpm, 148)
        XCTAssertEqual(iPhoneStore.syncQueue.count, 1)
    }
}
