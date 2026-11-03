import XCTest
@testable import LukiFittiModels
@testable import LukiFittiDomain
@testable import LukiFittiHealth

@MainActor
final class HealthKitWorkoutCoordinatorTests: XCTestCase {
    private func makeCoordinator() -> HealthKitWorkoutCoordinator {
        let coordinator = HealthKitWorkoutCoordinator()
        coordinator.isUITesting = true
        return coordinator
    }

    func testLiveMetricsPacketRoundTrips() throws {
        let packet = WorkoutLiveMetricsPacket(
            bpm: 142,
            activeKcal: 87.5,
            basalKcal: 31.2,
            sentAt: Date(timeIntervalSince1970: 1_784_000_000.25)
        )
        let data = try JSONEncoder().encode(packet)
        let decoded = try JSONDecoder().decode(WorkoutLiveMetricsPacket.self, from: data)
        XCTAssertEqual(decoded.bpm, 142)
        XCTAssertEqual(decoded.activeKcal, 87.5, accuracy: 0.001)
        XCTAssertEqual(decoded.basalKcal, 31.2, accuracy: 0.001)
        XCTAssertEqual(decoded.sentAt.timeIntervalSince1970, 1_784_000_000.25, accuracy: 0.001)
    }

    func testLiveMetricsPacketWithoutBpmDecodes() throws {
        let packet = WorkoutLiveMetricsPacket(activeKcal: 10, basalKcal: 4)
        let decoded = try JSONDecoder().decode(
            WorkoutLiveMetricsPacket.self,
            from: JSONEncoder().encode(packet)
        )
        XCTAssertNil(decoded.bpm)
    }

    func testIngestHeartRateTracksLiveStatsAndDownsamples() async {
        let coordinator = makeCoordinator()
        await coordinator.startWorkout(sessionType: .STRENGTH, startedAt: Date(timeIntervalSince1970: 1_000))

        coordinator.ingestHeartRateSample(bpm: 120, at: Date(timeIntervalSince1970: 1_010))
        coordinator.ingestHeartRateSample(bpm: 130, at: Date(timeIntervalSince1970: 1_012))
        coordinator.ingestHeartRateSample(bpm: 140, at: Date(timeIntervalSince1970: 1_020))

        XCTAssertEqual(coordinator.currentHeartRateBpm, 140)
        XCTAssertEqual(coordinator.avgHeartRateBpm, 130)
        XCTAssertEqual(coordinator.maxHeartRateBpm, 140)
        XCTAssertEqual(coordinator.minHeartRateBpm, 120)
        // 1 sample every 5 s of workout time: offsets 10 and 20 land, 12 is folded into the buffer.
        XCTAssertEqual(coordinator.heartRateSamples.map(\.bpm), [120, 140])
    }

    func testIngestHeartRateRejectsImplausibleValues() async {
        let coordinator = makeCoordinator()
        await coordinator.startWorkout(sessionType: .STRENGTH)
        coordinator.ingestHeartRateSample(bpm: 5)
        coordinator.ingestHeartRateSample(bpm: 300)
        XCTAssertNil(coordinator.currentHeartRateBpm)
        XCTAssertTrue(coordinator.heartRateSamples.isEmpty)
    }

    func testSetAndRestSnapshotsConsumeTheBuffer() async {
        let coordinator = makeCoordinator()
        await coordinator.startWorkout(sessionType: .STRENGTH)
        coordinator.ingestHeartRateSample(bpm: 110)
        coordinator.ingestHeartRateSample(bpm: 130)

        let set = coordinator.snapshotCompletedSetTelemetry()
        XCTAssertEqual(set.avgBpm, 120)
        XCTAssertEqual(set.peakBpm, 130)
        // Buffer consumed: the next snapshot falls back to the current reading only.
        let rest = coordinator.snapshotRestEndHeartRate()
        XCTAssertEqual(rest, 130)
    }

    func testIngestEnergyBurnedRoundsAndSplitsActiveTotal() async {
        let coordinator = makeCoordinator()
        await coordinator.startWorkout(sessionType: .STRENGTH)
        coordinator.ingestEnergyBurned(activeKcal: 87.54, basalKcal: 30.01)
        XCTAssertEqual(coordinator.activeCaloriesKcal, 87.5, accuracy: 0.001)
        XCTAssertEqual(coordinator.totalCaloriesKcal, 117.6, accuracy: 0.001)
    }

    func testFinishWorkoutReturnsAccumulatedMetrics() async {
        let coordinator = makeCoordinator()
        await coordinator.startWorkout(sessionType: .STRENGTH)
        coordinator.ingestHeartRateSample(bpm: 120)
        coordinator.ingestHeartRateSample(bpm: 140)
        coordinator.ingestEnergyBurned(activeKcal: 55)

        let metrics = await coordinator.finishWorkout(clientSessionId: "s-1")
        XCTAssertEqual(metrics.activeCaloriesKcal, 55)
        XCTAssertEqual(metrics.avgHeartRateBpm, 130)
        XCTAssertEqual(metrics.maxHeartRateBpm, 140)
        XCTAssertEqual(metrics.minHeartRateBpm, 120)
        XCTAssertFalse(coordinator.isWorkoutRunning)
    }

    func testRestEndAlertGateDedupesByEndsAt() {
        var gate = RestEndAlertGate()
        XCTAssertTrue(gate.take(endsAt: "2026-01-01T10:00:00Z"))
        XCTAssertFalse(gate.take(endsAt: "2026-01-01T10:00:00Z"))
        XCTAssertTrue(gate.take(endsAt: "2026-01-01T10:02:00Z"))
        gate.reset()
        XCTAssertTrue(gate.take(endsAt: "2026-01-01T10:02:00Z"))
    }

    func testLiveBurnedKcalEstimateUsesElapsedSeconds() {
        var session = WorkoutSessionDto(
            clientSessionId: "s-1",
            workoutNameSnapshot: "Push",
            status: .IN_PROGRESS,
            startedAt: "2026-01-01T10:00:00Z",
            activeDurationSeconds: 0
        )
        // A completed working set feeds the strength-density estimate.
        session.exercises = [
            SessionExerciseDto(
                sessionId: "s-1",
                exerciseId: "ex-1",
                exerciseNameSnapshot: "Bench Press",
                primaryMuscleSnapshot: .CHEST,
                orderIndex: 0,
                plannedSets: 1,
                sets: [
                    SessionSetDto(
                        sessionExerciseId: "se-1",
                        setNumber: 1,
                        weight: 60,
                        reps: 10,
                        completed: true
                    ),
                ]
            ),
        ]
        let hourly = NutritionMath.liveBurnedKcalEstimate(for: session, elapsedSeconds: 3600, bodyWeightKg: 80)
        XCTAssertEqual(hourly, NutritionMath.burnedKcal(for: {
            var copy = session
            copy.activeDurationSeconds = 3600
            return copy
        }(), bodyWeightKg: 80))
        XCTAssertGreaterThan(hourly, 0)
        // Zero elapsed -> no estimate; measured/session calories are ignored for the live value.
        XCTAssertEqual(NutritionMath.liveBurnedKcalEstimate(for: session, elapsedSeconds: 0, bodyWeightKg: 80), 0)
    }
}
