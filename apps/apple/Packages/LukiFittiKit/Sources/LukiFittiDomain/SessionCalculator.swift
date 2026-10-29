import Foundation
import LukiFittiModels

public struct RestTimerStatus: Sendable, Equatable {
    public var remainingSeconds: Int
    public var totalSeconds: Int
    public var isRunning: Bool
    public var isPaused: Bool

    public init(remainingSeconds: Int = 0, totalSeconds: Int = 0, isRunning: Bool = false, isPaused: Bool = false) {
        self.remainingSeconds = remainingSeconds
        self.totalSeconds = totalSeconds
        self.isRunning = isRunning
        self.isPaused = isPaused
    }
}

public enum SessionCalculator {
    /// Index of the exercise a running workout should show when it is (re)opened: the one the user
    /// last opened, else the one with the most recently logged set while it still has open sets,
    /// else the first unfinished one. Returns 0 for an empty or fully finished workout.
    /// Port of `resolveFocusedExerciseIndex` in `packages/common`.
    public static func resolveFocusedExerciseIndex(
        _ exercises: [SessionExerciseDto],
        rememberedClientExerciseId: String? = nil
    ) -> Int {
        if let rememberedClientExerciseId,
           let remembered = exercises.firstIndex(where: { $0.clientExerciseId == rememberedClientExerciseId }) {
            return remembered
        }

        func hasOpenSets(_ ex: SessionExerciseDto) -> Bool { ex.sets.contains { !$0.completed } }

        var latestIdx: Int?
        var latestDate = Date.distantPast
        for (idx, ex) in exercises.enumerated() {
            for set in ex.sets where set.completed {
                guard let raw = set.completedAt, let date = parseIsoDate(raw), date > latestDate else { continue }
                latestDate = date
                latestIdx = idx
            }
        }
        if let latestIdx, hasOpenSets(exercises[latestIdx]) { return latestIdx }

        return exercises.firstIndex {
            $0.status != .COMPLETED && $0.status != .SKIPPED && hasOpenSets($0)
        } ?? 0
    }

    private static func parseIsoDate(_ value: String) -> Date? {
        (try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(value))
            ?? (try? Date.ISO8601FormatStyle().parse(value))
    }

    public static func recalculateSessionTotals(_ session: WorkoutSessionDto) -> WorkoutSessionDto {
        var totalVolumeKg: Double = 0
        var totalSetsCompleted = 0
        var totalRepsCompleted = 0
        var totalStretchSeconds = 0
        var allBpms: [Int] = []

        if let samples = session.heartRateSamples {
            allBpms.append(contentsOf: samples.map(\.bpm))
        }

        for ex in session.exercises {
            let isStretch = ex.exerciseTypeSnapshot == .STRETCHING
            for set in ex.sets {
                if let avgHr = set.avgHeartRateBpm { allBpms.append(avgHr) }
                if let peakHr = set.peakHeartRateBpm { allBpms.append(peakHr) }
                guard set.completed else { continue }
                totalSetsCompleted += 1

                if isStretch || set.setType == .STRETCH {
                    totalStretchSeconds += set.durationSeconds ?? 0
                    if let reps = set.reps { totalRepsCompleted += reps }
                } else {
                    let reps = set.reps ?? 0
                    totalRepsCompleted += reps
                    if set.setType != .WARMUP, let weight = set.weight, weight > 0, reps > 0 {
                        let wKg = set.weightUnit == .LBS ? weight * ProgressionEngine.lbsToKg : weight
                        totalVolumeKg += wKg * Double(reps)
                    }
                }
            }
        }

        var updated = session
        updated.totalVolumeKg = (totalVolumeKg * 10.0).rounded() / 10.0
        updated.totalSetsCompleted = totalSetsCompleted
        updated.totalRepsCompleted = totalRepsCompleted
        updated.totalStretchSeconds = totalStretchSeconds

        if !allBpms.isEmpty {
            if updated.avgHeartRateBpm == nil {
                updated.avgHeartRateBpm = Int((Double(allBpms.reduce(0, +)) / Double(allBpms.count)).rounded())
            }
            if updated.maxHeartRateBpm == nil {
                updated.maxHeartRateBpm = allBpms.max()
            }
            if updated.minHeartRateBpm == nil {
                updated.minHeartRateBpm = allBpms.min()
            }
        }
        return updated
    }

    public static func createOfflineSessionFromTemplate(
        template: WorkoutTemplateDto,
        catalog: [ExerciseDto],
        userId: String = "local-user",
        weightUnit: WeightUnit = .KG,
        sourceDevice: SessionSourceDevice = .IPHONE,
        historySessions: [WorkoutSessionDto] = []
    ) -> WorkoutSessionDto {
        let catalogMap = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0) })
        let clientSessionId = "sess-\(UUID().uuidString.lowercased())"
        let nowIso = ISO8601DateFormatter().string(from: Date())

        let exercises: [SessionExerciseDto] = template.exercises.enumerated().map { idx, te in
            let exInfo = te.exercise ?? catalogMap[te.exerciseId]
            let clientExerciseId = "sex-\(UUID().uuidString.lowercased())"
            let sets: [SessionSetDto] = TemplateSets.resolve(te).enumerated().map { sIdx, planned in
                SessionSetDto(
                    sessionExerciseId: clientExerciseId,
                    setNumber: sIdx + 1,
                    setType: planned.setType,
                    weight: planned.weight,
                    weightUnit: te.weightUnit,
                    reps: planned.reps,
                    durationSeconds: planned.durationSeconds ?? te.targetDurationSeconds,
                    distanceMeters: planned.setType == .WARMUP ? nil : te.targetDistanceMeters
                )
            }

            let baseEx = SessionExerciseDto(
                id: clientExerciseId,
                clientExerciseId: clientExerciseId,
                sessionId: clientSessionId,
                exerciseId: te.exerciseId,
                exerciseNameSnapshot: exInfo?.name ?? "Exercise",
                primaryMuscleSnapshot: exInfo?.primaryMuscleGroup ?? .FULL_BODY,
                exerciseTypeSnapshot: exInfo?.exerciseType ?? .STRENGTH,
                origin: .PLANNED,
                status: idx == 0 ? .IN_PROGRESS : .PENDING,
                orderIndex: idx,
                plannedSets: te.plannedSets,
                plannedWarmupSets: te.warmupSets,
                targetRepsMin: te.targetRepsMin,
                targetRepsMax: te.targetRepsMax,
                targetWeight: te.targetWeight,
                targetDurationSeconds: te.targetDurationSeconds,
                restSeconds: te.restSeconds,
                alternativeExerciseIds: !te.alternativeExerciseIds.isEmpty
                    ? te.alternativeExerciseIds
                    : (exInfo?.alternativeExerciseIds ?? []),
                notes: te.notes,
                sets: sets
            )

            // A per-set plan already holds the last workout's values.
            if let planned = te.sets, !planned.isEmpty { return baseEx }
            return ProgressionEngine.applyExerciseHistoryToSessionExercise(
                baseEx,
                historySessions: historySessions,
                catalogExercise: exInfo,
                weightUnit: te.weightUnit
            )
        }

        return WorkoutSessionDto(
            id: clientSessionId,
            clientSessionId: clientSessionId,
            userId: userId,
            templateId: template.id,
            sessionType: .STRENGTH,
            workoutNameSnapshot: template.name,
            status: .IN_PROGRESS,
            startedAt: nowIso,
            weightUnit: weightUnit,
            sourceDevice: sourceDevice,
            version: 1,
            lastSyncedAt: nowIso,
            exercises: exercises
        )
    }

    public static func createOfflineSessionFromStretchingRoutine(
        routine: StretchingRoutineDto,
        catalog: [ExerciseDto],
        userId: String = "local-user",
        weightUnit: WeightUnit = .KG,
        sourceDevice: SessionSourceDevice = .IPHONE
    ) -> WorkoutSessionDto {
        let catalogMap = Dictionary(uniqueKeysWithValues: catalog.map { ($0.id, $0) })
        let clientSessionId = "sess-\(UUID().uuidString.lowercased())"
        let nowIso = ISO8601DateFormatter().string(from: Date())

        let exercises: [SessionExerciseDto] = routine.exercises.enumerated().map { idx, re in
            let exInfo = re.exercise ?? catalogMap[re.exerciseId]
            let clientExerciseId = "sex-\(UUID().uuidString.lowercased())"
            let sets: [SessionSetDto] = (0..<re.sets).map { sIdx in
                SessionSetDto(
                    sessionExerciseId: clientExerciseId,
                    setNumber: sIdx + 1,
                    setType: .STRETCH,
                    weight: nil,
                    weightUnit: weightUnit,
                    reps: re.reps,
                    durationSeconds: re.durationSeconds ?? 45
                )
            }

            return SessionExerciseDto(
                id: clientExerciseId,
                clientExerciseId: clientExerciseId,
                sessionId: clientSessionId,
                exerciseId: re.exerciseId,
                exerciseNameSnapshot: exInfo?.name ?? "Stretch",
                primaryMuscleSnapshot: exInfo?.primaryMuscleGroup ?? .FULL_BODY,
                exerciseTypeSnapshot: exInfo?.exerciseType ?? .STRETCHING,
                origin: .PLANNED,
                status: idx == 0 ? .IN_PROGRESS : .PENDING,
                orderIndex: idx,
                plannedSets: re.sets,
                plannedWarmupSets: 0,
                targetRepsMin: re.reps,
                targetRepsMax: re.reps,
                targetDurationSeconds: re.durationSeconds ?? 45,
                restSeconds: re.transitionSeconds,
                alternativeExerciseIds: exInfo?.alternativeExerciseIds ?? [],
                notes: re.notes,
                sets: sets
            )
        }

        return WorkoutSessionDto(
            id: clientSessionId,
            clientSessionId: clientSessionId,
            userId: userId,
            stretchingRoutineId: routine.id,
            sessionType: .STRETCHING,
            workoutNameSnapshot: routine.name,
            status: .IN_PROGRESS,
            startedAt: nowIso,
            weightUnit: weightUnit,
            sourceDevice: sourceDevice,
            version: 1,
            lastSyncedAt: nowIso,
            exercises: exercises
        )
    }

    public static func substituteExerciseInSession(
        session: WorkoutSessionDto,
        clientExerciseId: String,
        replacementExercise: ExerciseDto,
        historySessions: [WorkoutSessionDto] = []
    ) -> WorkoutSessionDto {
        let updatedExercises = session.exercises.map { ex -> SessionExerciseDto in
            guard ex.clientExerciseId == clientExerciseId else { return ex }
            var sub = ex
            sub.replacedExerciseId = ex.replacedExerciseId ?? ex.exerciseId
            sub.replacedExerciseName = ex.replacedExerciseName ?? ex.exerciseNameSnapshot
            sub.exerciseId = replacementExercise.id
            sub.exerciseNameSnapshot = replacementExercise.name
            sub.primaryMuscleSnapshot = replacementExercise.primaryMuscleGroup
            sub.exerciseTypeSnapshot = replacementExercise.exerciseType
            sub.origin = .SUBSTITUTED

            return ProgressionEngine.applyExerciseHistoryToSessionExercise(
                sub,
                historySessions: historySessions,
                catalogExercise: replacementExercise,
                weightUnit: session.weightUnit
            )
        }

        var copy = session
        copy.version += 1
        copy.exercises = updatedExercises
        return recalculateSessionTotals(copy)
    }

    public static func computeRemainingRestSeconds(
        session: WorkoutSessionDto?,
        now: Date = Date()
    ) -> RestTimerStatus {
        guard let session else { return RestTimerStatus() }
        let totalSeconds = session.restTimerDurationSec ?? 0

        if let pausedRem = session.restTimerPausedRemSec {
            let rem = max(0, pausedRem)
            return RestTimerStatus(
                remainingSeconds: rem,
                totalSeconds: max(totalSeconds, rem),
                isRunning: false,
                isPaused: rem > 0
            )
        }

        if let endsIso = session.restTimerEndsAt,
           let endsDate = ISO8601DateFormatter().date(from: endsIso) {
            let rem = max(0, Int(ceil(endsDate.timeIntervalSince(now))))
            return RestTimerStatus(
                remainingSeconds: rem,
                totalSeconds: max(totalSeconds, rem),
                isRunning: rem > 0,
                isPaused: false
            )
        }

        return RestTimerStatus(remainingSeconds: 0, totalSeconds: totalSeconds, isRunning: false, isPaused: false)
    }
}
