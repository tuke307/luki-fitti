import Foundation
import LukiFittiModels

public struct SetProgressionSuggestion: Codable, Sendable, Equatable, Hashable {
    public var workingSetIndex: Int
    public var lastWeight: Double?
    public var lastReps: Int?
    public var lastRpe: Double?
    public var suggestedWeight: Double?
    public var suggestedReps: Int?
    public var weightDelta: Double
    public var repsDelta: Int
    public var phase: ProgressionPhase
    public var confidence: Double

    public init(
        workingSetIndex: Int,
        lastWeight: Double?,
        lastReps: Int?,
        lastRpe: Double?,
        suggestedWeight: Double?,
        suggestedReps: Int?,
        weightDelta: Double,
        repsDelta: Int,
        phase: ProgressionPhase,
        confidence: Double
    ) {
        self.workingSetIndex = workingSetIndex
        self.lastWeight = lastWeight
        self.lastReps = lastReps
        self.lastRpe = lastRpe
        self.suggestedWeight = suggestedWeight
        self.suggestedReps = suggestedReps
        self.weightDelta = weightDelta
        self.repsDelta = repsDelta
        self.phase = phase
        self.confidence = confidence
    }
}

public struct WorkingSetHistoryPoint: Codable, Sendable, Equatable, Hashable {
    public var setNumber: Int
    public var weight: Double
    public var weightUnit: WeightUnit
    public var weightNormalized: Double
    public var reps: Int
    public var rpe: Double?
    public var estimated1RM: Double
    public var peakHeartRateBpm: Int?
    public var restEndHeartRateBpm: Int?

    public init(
        setNumber: Int,
        weight: Double,
        weightUnit: WeightUnit,
        weightNormalized: Double,
        reps: Int,
        rpe: Double?,
        estimated1RM: Double,
        peakHeartRateBpm: Int? = nil,
        restEndHeartRateBpm: Int? = nil
    ) {
        self.setNumber = setNumber
        self.weight = weight
        self.weightUnit = weightUnit
        self.weightNormalized = weightNormalized
        self.reps = reps
        self.rpe = rpe
        self.estimated1RM = estimated1RM
        self.peakHeartRateBpm = peakHeartRateBpm
        self.restEndHeartRateBpm = restEndHeartRateBpm
    }
}

public struct ExerciseHistorySessionEntry: Codable, Sendable, Equatable, Hashable {
    public var clientSessionId: String
    public var workoutName: String
    public var startedAt: String
    public var workingSets: [WorkingSetHistoryPoint]
    public var bestEstimated1RM: Double
    public var avgWeightNormalized: Double
    public var avgReps: Double
    public var avgRpe: Double?
    public var totalVolumeNormalized: Double
    public var avgHeartRateRecoveryDropBpm: Int?

    public init(
        clientSessionId: String,
        workoutName: String,
        startedAt: String,
        workingSets: [WorkingSetHistoryPoint],
        bestEstimated1RM: Double,
        avgWeightNormalized: Double,
        avgReps: Double,
        avgRpe: Double?,
        totalVolumeNormalized: Double,
        avgHeartRateRecoveryDropBpm: Int? = nil
    ) {
        self.clientSessionId = clientSessionId
        self.workoutName = workoutName
        self.startedAt = startedAt
        self.workingSets = workingSets
        self.bestEstimated1RM = bestEstimated1RM
        self.avgWeightNormalized = avgWeightNormalized
        self.avgReps = avgReps
        self.avgRpe = avgRpe
        self.totalVolumeNormalized = totalVolumeNormalized
        self.avgHeartRateRecoveryDropBpm = avgHeartRateRecoveryDropBpm
    }
}

public struct ExerciseProgressionInsight: Codable, Sendable, Equatable, Hashable {
    public var exerciseId: String
    public var sessionsCount: Int
    public var lastSession: ExerciseHistorySessionEntry?
    public var history: [ExerciseHistorySessionEntry]
    public var ewma1RM: Double
    public var slopePerSession: Double
    public var phase: ProgressionPhase
    public var confidence: Double
    public var setSuggestions: [SetProgressionSuggestion]
    public var elevatedSystemicFatigueFromHR: Bool

    public init(
        exerciseId: String,
        sessionsCount: Int,
        lastSession: ExerciseHistorySessionEntry?,
        history: [ExerciseHistorySessionEntry],
        ewma1RM: Double,
        slopePerSession: Double,
        phase: ProgressionPhase,
        confidence: Double,
        setSuggestions: [SetProgressionSuggestion],
        elevatedSystemicFatigueFromHR: Bool = false
    ) {
        self.exerciseId = exerciseId
        self.sessionsCount = sessionsCount
        self.lastSession = lastSession
        self.history = history
        self.ewma1RM = ewma1RM
        self.slopePerSession = slopePerSession
        self.phase = phase
        self.confidence = confidence
        self.setSuggestions = setSuggestions
        self.elevatedSystemicFatigueFromHR = elevatedSystemicFatigueFromHR
    }
}

public enum ProgressionEngine {
    public static let lbsToKg: Double = 0.45359237
    public static let kgToLbs: Double = 1.0 / 0.45359237

    public static func convertWeight(_ weight: Double, from fromUnit: WeightUnit, to toUnit: WeightUnit) -> Double {
        if fromUnit == toUnit { return weight }
        let converted = fromUnit == .LBS ? weight * lbsToKg : weight * kgToLbs
        return (converted * 2.0).rounded() / 2.0
    }

    public static func roundToGymStep(_ value: Double, step: Double = 0.5) -> Double {
        if step <= 0 { return (value * 10.0).rounded() / 10.0 }
        let inv = 1.0 / step
        return (value * inv).rounded() / inv
    }

    /// Ensemble 1RM estimator combining Epley (1 + r/30) and Brzycki (36 / (37 - r))
    /// with 100% mathematical parity with `packages/common/src/utils/progression.util.ts`.
    public static func estimateOneRepMax(weight: Double, reps: Int, rpe: Double? = nil) -> Double {
        if weight <= 0 || reps <= 0 { return 0 }
        let repsInReserve: Double
        if let rpe, rpe >= 5, rpe <= 10 {
            repsInReserve = max(0, 10.0 - rpe)
        } else {
            repsInReserve = 0
        }
        let effectiveReps = min(30.0, Double(reps) + repsInReserve * 0.5)
        if effectiveReps == 1.0 { return weight }

        let epley = weight * (1.0 + effectiveReps / 30.0)
        let brzycki = effectiveReps < 35.0 ? weight * (36.0 / (37.0 - effectiveReps)) : epley
        let blended = effectiveReps <= 10.0 ? (epley + brzycki) / 2.0 : epley
        return (blended * 100.0).rounded() / 100.0
    }

    public static func getStandardWeightIncrement(
        unit: WeightUnit,
        exercise: ExerciseDto? = nil,
        currentWeight: Double? = nil
    ) -> Double {
        let isIsolation = exercise?.category == .ISOLATION
        let eq = exercise?.equipment

        if unit == .LBS {
            return 5.0
        }

        if isIsolation || eq == .CABLE {
            if let currentWeight, currentWeight > 0, currentWeight < 20.0 {
                return 1.25
            }
            return 2.5
        }
        if eq == .DUMBBELL {
            return 2.0
        }
        return 2.5
    }

    public static func extractGlobalExerciseHistory(
        exerciseId: String?,
        exerciseName: String?,
        historySessions: [WorkoutSessionDto],
        targetUnit: WeightUnit = .KG
    ) -> [ExerciseHistorySessionEntry] {
        let trimmedId = exerciseId?.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedTargetName = exerciseName?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        if (trimmedId == nil || trimmedId?.isEmpty == true) && normalizedTargetName.isEmpty {
            return []
        }

        let completedSessions = historySessions
            .filter { $0.status == .COMPLETED || $0.completedAt != nil }
            .sorted { $0.startedAt < $1.startedAt }

        var entries: [ExerciseHistorySessionEntry] = []

        for session in completedSessions {
            let matchingExercises = session.exercises.filter { ex in
                if let trimmedId, !trimmedId.isEmpty, ex.exerciseId == trimmedId {
                    return true
                }
                if ex.exerciseId == nil,
                   !normalizedTargetName.isEmpty,
                   ex.exerciseNameSnapshot.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == normalizedTargetName {
                    return true
                }
                return false
            }

            if matchingExercises.isEmpty { continue }

            var workingSets: [WorkingSetHistoryPoint] = []
            for ex in matchingExercises {
                if ex.exerciseTypeSnapshot == .STRETCHING {
                    continue
                }
                for s in ex.sets {
                    if !s.completed || s.setType == .WARMUP || s.setType == .STRETCH {
                        continue
                    }
                    let rawWeight = s.weight ?? 0
                    let reps = s.reps ?? 0
                    if rawWeight <= 0 && reps <= 0 { continue }

                    let weightNormalized = rawWeight > 0
                        ? convertWeight(rawWeight, from: s.weightUnit, to: targetUnit)
                        : 0
                    let est1RM = (weightNormalized > 0 && reps > 0)
                        ? estimateOneRepMax(weight: weightNormalized, reps: reps, rpe: s.rpe)
                        : Double(reps)

                    workingSets.append(
                        WorkingSetHistoryPoint(
                            setNumber: workingSets.count + 1,
                            weight: rawWeight,
                            weightUnit: s.weightUnit,
                            weightNormalized: weightNormalized,
                            reps: reps,
                            rpe: s.rpe,
                            estimated1RM: est1RM,
                            peakHeartRateBpm: s.peakHeartRateBpm,
                            restEndHeartRateBpm: s.restEndHeartRateBpm
                        )
                    )
                }
            }

            if workingSets.isEmpty { continue }

            let bestEstimated1RM = workingSets.map(\.estimated1RM).max() ?? 0
            let avgWeightNormalized = ((workingSets.reduce(0.0) { $0 + $1.weightNormalized } / Double(workingSets.count)) * 10.0).rounded() / 10.0
            let avgReps = ((workingSets.reduce(0.0) { $0 + Double($1.reps) } / Double(workingSets.count)) * 10.0).rounded() / 10.0

            let rpeSets = workingSets.compactMap(\.rpe)
            let avgRpe: Double? = rpeSets.isEmpty
                ? nil
                : ((rpeSets.reduce(0.0, +) / Double(rpeSets.count)) * 10.0).rounded() / 10.0

            let totalVolumeNormalized = ((workingSets.reduce(0.0) { $0 + ($1.weightNormalized * Double($1.reps)) }) * 10.0).rounded() / 10.0

            let hrDrops = workingSets.compactMap { ws -> Int? in
                guard let peak = ws.peakHeartRateBpm, let restEnd = ws.restEndHeartRateBpm else { return nil }
                return max(0, peak - restEnd)
            }
            let avgHrDrop: Int? = hrDrops.isEmpty ? nil : Int((Double(hrDrops.reduce(0, +)) / Double(hrDrops.count)).rounded())

            entries.append(
                ExerciseHistorySessionEntry(
                    clientSessionId: session.clientSessionId,
                    workoutName: session.workoutNameSnapshot,
                    startedAt: session.startedAt,
                    workingSets: workingSets,
                    bestEstimated1RM: bestEstimated1RM,
                    avgWeightNormalized: avgWeightNormalized,
                    avgReps: avgReps,
                    avgRpe: avgRpe,
                    totalVolumeNormalized: totalVolumeNormalized,
                    avgHeartRateRecoveryDropBpm: avgHrDrop
                )
            )
        }

        return entries
    }

    public static func computeTrendTelemetry(entries: [ExerciseHistorySessionEntry]) -> (ewma1RM: Double, slopePerSession: Double) {
        guard let first = entries.first else {
            return (0, 0)
        }

        let alpha = 0.45
        var ewma = first.bestEstimated1RM
        for i in 1..<entries.count {
            ewma = alpha * entries[i].bestEstimated1RM + (1.0 - alpha) * ewma
        }

        let recent = Array(entries.suffix(6))
        let n = recent.count
        if n < 2 {
            return ((ewma * 10.0).rounded() / 10.0, 0)
        }

        var sumX = 0.0
        var sumY = 0.0
        var sumXY = 0.0
        var sumXX = 0.0
        for i in 0..<n {
            let x = Double(i)
            let y = recent[i].bestEstimated1RM
            sumX += x
            sumY += y
            sumXY += x * y
            sumXX += x * x
        }

        let nd = Double(n)
        let denom = nd * sumXX - sumX * sumX
        let slope = denom != 0 ? (nd * sumXY - sumX * sumY) / denom : 0

        return (
            ewma1RM: (ewma * 10.0).rounded() / 10.0,
            slopePerSession: (slope * 100.0).rounded() / 100.0
        )
    }

    public static func computeExerciseProgression(
        exerciseId: String?,
        exerciseName: String?,
        historySessions: [WorkoutSessionDto],
        catalogExercise: ExerciseDto? = nil,
        plannedSets: Int = 3,
        targetRepsMin: Int? = 8,
        targetRepsMax: Int? = 12,
        targetWeight: Double? = nil,
        weightUnit: WeightUnit = .KG,
        currentSets: [SessionSetDto]? = nil
    ) -> ExerciseProgressionInsight {
        let repMin = targetRepsMin ?? 8
        let repMax = targetRepsMax ?? max(repMin + 2, 12)

        let history = extractGlobalExerciseHistory(
            exerciseId: exerciseId,
            exerciseName: exerciseName,
            historySessions: historySessions,
            targetUnit: weightUnit
        )

        let (ewma1RM, slopePerSession) = computeTrendTelemetry(entries: history)
        let lastSession = history.last
        let prevSession = history.count > 1 ? history[history.count - 2] : nil

        let workingSetsCount: Int = if let currentSets {
            currentSets.filter { $0.setType != .WARMUP && $0.setType != .STRETCH }.count
        } else {
            plannedSets
        }

        guard let lastSession, !lastSession.workingSets.isEmpty else {
            let count = max(1, workingSetsCount)
            let baselineSuggestions = (0..<count).map { idx in
                SetProgressionSuggestion(
                    workingSetIndex: idx,
                    lastWeight: nil,
                    lastReps: nil,
                    lastRpe: nil,
                    suggestedWeight: targetWeight,
                    suggestedReps: repMin,
                    weightDelta: 0,
                    repsDelta: 0,
                    phase: .BASELINE,
                    confidence: 0
                )
            }
            return ExerciseProgressionInsight(
                exerciseId: exerciseId ?? exerciseName ?? "unknown",
                sessionsCount: 0,
                lastSession: nil,
                history: [],
                ewma1RM: 0,
                slopePerSession: 0,
                phase: .BASELINE,
                confidence: 0,
                setSuggestions: baselineSuggestions,
                elevatedSystemicFatigueFromHR: false
            )
        }

        let lastWorkingSets = lastSession.workingSets
        let primaryLastWeight = lastWorkingSets.first?.weightNormalized ?? 0
        let stepIncrement = getStandardWeightIncrement(
            unit: weightUnit,
            exercise: catalogExercise,
            currentWeight: primaryLastWeight
        )

        // Cardiovascular fatigue detection from Apple Watch HR recovery (< 15 BPM drop after rest)
        let elevatedSystemicFatigueFromHR: Bool = if lastSession.avgRpe == nil,
                                                      let hrDrop = lastSession.avgHeartRateRecoveryDropBpm {
            hrDrop < 15
        } else {
            false
        }

        let allSetsHitTopOfBand = lastWorkingSets.allSatisfy { $0.reps >= repMax }
        let majoritySetsBelowMin = Double(lastWorkingSets.filter { $0.reps < repMin }.count) > Double(lastWorkingSets.count) / 2.0
        let highFatigueLast = (lastSession.avgRpe ?? 8.0) >= 9.5 || elevatedSystemicFatigueFromHR
        let consecutiveRegression = prevSession != nil &&
            lastSession.bestEstimated1RM < (prevSession?.bestEstimated1RM ?? 0) * 0.96 &&
            (majoritySetsBelowMin || highFatigueLast)

        let overallPhase: ProgressionPhase
        if consecutiveRegression || (majoritySetsBelowMin && highFatigueLast) {
            overallPhase = .DELOAD
        } else if allSetsHitTopOfBand && !highFatigueLast && primaryLastWeight > 0 {
            overallPhase = .INCREASE_WEIGHT
        } else if highFatigueLast && !majoritySetsBelowMin {
            overallPhase = .MAINTAIN
        } else {
            overallPhase = .INCREASE_REPS
        }

        let confidence = min(0.95, ((0.45 + Double(min(history.count, 5)) * 0.1) * 100.0).rounded() / 100.0)

        let currentWorkingSets = currentSets?.filter { $0.setType != .WARMUP && $0.setType != .STRETCH } ?? []
        let totalSetsToSuggest = max(workingSetsCount, currentWorkingSets.count, lastWorkingSets.count)

        var setSuggestions: [SetProgressionSuggestion] = []
        for idx in 0..<totalSetsToSuggest {
            let historicalSet = idx < lastWorkingSets.count ? lastWorkingSets[idx] : lastWorkingSets[lastWorkingSets.count - 1]
            let lastW = historicalSet.weightNormalized
            let lastR = historicalSet.reps
            let lastRpe = historicalSet.rpe

            let suggestedWeight: Double?
            let suggestedReps: Int?
            let setPhase: ProgressionPhase

            if overallPhase == .INCREASE_WEIGHT && lastW > 0 {
                suggestedWeight = roundToGymStep(lastW + stepIncrement, step: 0.5)
                suggestedReps = repMin
                setPhase = .INCREASE_WEIGHT
            } else if overallPhase == .DELOAD && lastW > 0 {
                let reduced = max(
                    stepIncrement,
                    lastW - max(stepIncrement, roundToGymStep(lastW * 0.05, step: stepIncrement))
                )
                suggestedWeight = roundToGymStep(reduced, step: 0.5)
                suggestedReps = max(repMin, min(repMax, lastR))
                setPhase = .DELOAD
            } else if overallPhase == .INCREASE_REPS {
                if lastR >= repMax && lastW > 0 && (lastRpe ?? 8.0) < 9.5 {
                    suggestedWeight = roundToGymStep(lastW + stepIncrement, step: 0.5)
                    suggestedReps = repMin
                    setPhase = .INCREASE_WEIGHT
                } else if lastR < repMax && (lastRpe ?? 8.0) <= 9.0 {
                    suggestedWeight = lastW > 0 ? lastW : targetWeight
                    suggestedReps = min(repMax, lastR + 1)
                    setPhase = .INCREASE_REPS
                } else {
                    suggestedWeight = lastW > 0 ? lastW : targetWeight
                    suggestedReps = lastR
                    setPhase = .MAINTAIN
                }
            } else {
                suggestedWeight = lastW > 0 ? lastW : targetWeight
                suggestedReps = lastR
                setPhase = .MAINTAIN
            }

            let baselineWeight = lastW > 0 ? lastW : (targetWeight ?? 0)
            let baselineReps = lastR > 0 ? lastR : repMin

            let weightDelta: Double = if let suggestedWeight, baselineWeight > 0 {
                ((suggestedWeight - baselineWeight) * 100.0).rounded() / 100.0
            } else {
                0
            }

            let repsDelta: Int = if let suggestedReps, baselineReps > 0 {
                suggestedReps - baselineReps
            } else {
                0
            }

            setSuggestions.append(
                SetProgressionSuggestion(
                    workingSetIndex: idx,
                    lastWeight: lastW > 0 ? lastW : nil,
                    lastReps: lastR > 0 ? lastR : nil,
                    lastRpe: lastRpe,
                    suggestedWeight: suggestedWeight,
                    suggestedReps: suggestedReps,
                    weightDelta: weightDelta,
                    repsDelta: repsDelta,
                    phase: setPhase,
                    confidence: confidence
                )
            )
        }

        return ExerciseProgressionInsight(
            exerciseId: exerciseId ?? exerciseName ?? "unknown",
            sessionsCount: history.count,
            lastSession: lastSession,
            history: history,
            ewma1RM: ewma1RM,
            slopePerSession: slopePerSession,
            phase: overallPhase,
            confidence: confidence,
            setSuggestions: setSuggestions,
            elevatedSystemicFatigueFromHR: elevatedSystemicFatigueFromHR
        )
    }

    public static func formatCompactDelta(_ delta: Double) -> String? {
        if !delta.isFinite || abs(delta) < 0.01 { return nil }
        let rounded = (delta * 100.0).rounded() / 100.0
        let formatted = rounded.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f", rounded)
            : String(format: "%g", rounded)
        return rounded > 0 ? "+\(formatted)" : formatted
    }

    public static func applyExerciseHistoryToSessionExercise(
        _ sessionExercise: SessionExerciseDto,
        historySessions: [WorkoutSessionDto],
        catalogExercise: ExerciseDto? = nil,
        weightUnit: WeightUnit = .KG
    ) -> SessionExerciseDto {
        if sessionExercise.exerciseTypeSnapshot == .STRETCHING {
            return sessionExercise
        }

        let insight = computeExerciseProgression(
            exerciseId: sessionExercise.exerciseId,
            exerciseName: sessionExercise.exerciseNameSnapshot,
            historySessions: historySessions,
            catalogExercise: catalogExercise,
            plannedSets: sessionExercise.plannedSets,
            targetRepsMin: sessionExercise.targetRepsMin,
            targetRepsMax: sessionExercise.targetRepsMax,
            targetWeight: sessionExercise.targetWeight,
            weightUnit: weightUnit,
            currentSets: sessionExercise.sets
        )

        guard let lastSession = insight.lastSession else {
            return sessionExercise
        }

        let primaryLastWeight = lastSession.workingSets.first?.weightNormalized
        var workingIdx = 0

        let hydratedSets = sessionExercise.sets.map { set -> SessionSetDto in
            var copy = set
            if copy.setType == .WARMUP {
                let warmupBase = primaryLastWeight ?? sessionExercise.targetWeight
                if let warmupBase {
                    copy.weight = roundToGymStep(warmupBase * 0.6, step: 0.5)
                }
                copy.weightUnit = weightUnit
                return copy
            }
            if copy.setType == .STRETCH {
                return copy
            }

            let suggestion = workingIdx < insight.setSuggestions.count
                ? insight.setSuggestions[workingIdx]
                : insight.setSuggestions.last
            workingIdx += 1

            guard let suggestion else { return copy }
            copy.weight = suggestion.lastWeight ?? copy.weight
            copy.weightUnit = weightUnit
            copy.reps = suggestion.lastReps ?? copy.reps
            return copy
        }

        var updated = sessionExercise
        updated.targetWeight = primaryLastWeight ?? sessionExercise.targetWeight
        updated.sets = hydratedSets
        return updated
    }

    // MARK: - Gymlife Superset Block Grouping & Formatting

    public static func formatRestDurationMinSec(_ seconds: Int) -> String {
        let safe = max(0, seconds)
        return String(format: "%d:%02d", safe / 60, safe % 60)
    }

    public static func groupTemplateExercisesIntoBlocks(
        _ exercises: [WorkoutTemplateExerciseDto]
    ) -> [ExerciseRenderBlock<WorkoutTemplateExerciseDto>] {
        var blocks: [ExerciseRenderBlock<WorkoutTemplateExerciseDto>] = []
        var i = 0
        while i < exercises.count {
            let current = exercises[i]
            if current.restSeconds == 0 && i < exercises.count - 1 {
                let startIndex = i
                var items: [ExerciseBlockItem<WorkoutTemplateExerciseDto>] = []
                var stepNumber = 1
                while i < exercises.count {
                    let ex = exercises[i]
                    items.append(ExerciseBlockItem(item: ex, globalIndex: i, stepNumber: stepNumber))
                    stepNumber += 1
                    if ex.restSeconds == 0 && i < exercises.count - 1 {
                        i += 1
                    } else {
                        i += 1
                        break
                    }
                }
                let lastItem = items[items.count - 1].item
                let maxRounds = items.map { $0.item.plannedSets }.max() ?? 3
                blocks.append(
                    ExerciseRenderBlock(
                        isSuperset: true,
                        startIndex: startIndex,
                        rounds: maxRounds,
                        roundRestSeconds: lastItem.restSeconds > 0 ? lastItem.restSeconds : 60,
                        items: items
                    )
                )
            } else {
                blocks.append(
                    ExerciseRenderBlock(
                        isSuperset: false,
                        startIndex: i,
                        rounds: current.plannedSets,
                        roundRestSeconds: current.restSeconds,
                        items: [ExerciseBlockItem(item: current, globalIndex: i, stepNumber: 1)]
                    )
                )
                i += 1
            }
        }
        return blocks
    }

    public static func groupSessionExercisesIntoBlocks(
        _ exercises: [SessionExerciseDto]
    ) -> [ExerciseRenderBlock<SessionExerciseDto>] {
        var blocks: [ExerciseRenderBlock<SessionExerciseDto>] = []
        var i = 0
        while i < exercises.count {
            let current = exercises[i]
            if current.restSeconds == 0 && i < exercises.count - 1 {
                let startIndex = i
                var items: [ExerciseBlockItem<SessionExerciseDto>] = []
                var stepNumber = 1
                while i < exercises.count {
                    let ex = exercises[i]
                    items.append(ExerciseBlockItem(item: ex, globalIndex: i, stepNumber: stepNumber))
                    stepNumber += 1
                    if ex.restSeconds == 0 && i < exercises.count - 1 {
                        i += 1
                    } else {
                        i += 1
                        break
                    }
                }
                let lastItem = items[items.count - 1].item
                let maxRounds = items.map { $0.item.plannedSets }.max() ?? 3
                blocks.append(
                    ExerciseRenderBlock(
                        isSuperset: true,
                        startIndex: startIndex,
                        rounds: maxRounds,
                        roundRestSeconds: lastItem.restSeconds > 0 ? lastItem.restSeconds : 60,
                        items: items
                    )
                )
            } else {
                blocks.append(
                    ExerciseRenderBlock(
                        isSuperset: false,
                        startIndex: i,
                        rounds: current.plannedSets,
                        roundRestSeconds: current.restSeconds,
                        items: [ExerciseBlockItem(item: current, globalIndex: i, stepNumber: 1)]
                    )
                )
                i += 1
            }
        }
        return blocks
    }

    // MARK: - Smart Workout Exercise Suggestion Engine (Max 1 per Workout)

    public static func computeWorkoutExerciseSuggestion(
        workoutName: String,
        folderName: String? = nil,
        existingExerciseIds: [String],
        existingExerciseNames: [String] = [],
        existingMuscles: [MuscleGroup] = [],
        catalog: [ExerciseDto],
        historySessions: [WorkoutSessionDto],
        weightUnit: WeightUnit = .KG
    ) -> WorkoutExerciseSuggestion? {
        let strengthCatalog = catalog.filter { $0.exerciseType == .STRENGTH }
        guard !strengthCatalog.isEmpty else { return nil }

        let idSet = Set(existingExerciseIds)
        let nameSet = Set(existingExerciseNames.map { $0.lowercased() })

        let text = "\(workoutName) \(folderName ?? "")".lowercased()
        let splitMuscles: [MuscleGroup]
        if text.contains("push") || (text.contains("chest") && text.contains("tricep")) {
            splitMuscles = [.SHOULDERS, .CHEST, .TRICEPS]
        } else if text.contains("pull") || (text.contains("back") && text.contains("bicep")) {
            splitMuscles = [.BACK, .BICEPS, .SHOULDERS]
        } else if text.contains("leg") || text.contains("bein") || text.contains("quad") {
            splitMuscles = [.QUADRICEPS, .HAMSTRINGS, .GLUTES, .CALVES]
        } else if text.contains("arm") || text.contains("bicep") || text.contains("tricep") {
            splitMuscles = [.BICEPS, .TRICEPS, .SHOULDERS]
        } else if text.contains("shoulder") || text.contains("schulter") {
            splitMuscles = [.SHOULDERS, .TRICEPS, .ABS_CORE]
        } else if !existingMuscles.isEmpty {
            splitMuscles = Array(Set(existingMuscles))
        } else {
            splitMuscles = [.SHOULDERS, .CHEST, .BACK]
        }

        var stallingEx: ExerciseDto?
        var stallingReason: String?

        for exId in existingExerciseIds {
            guard let catEx = catalog.first(where: { $0.id == exId }) else { continue }
            let insight = computeExerciseProgression(
                exerciseId: catEx.id,
                exerciseName: catEx.name,
                historySessions: historySessions,
                catalogExercise: catEx,
                weightUnit: weightUnit
            )
            guard insight.sessionsCount > 0, let last = insight.lastSession else { continue }
            let avgRpe = last.avgRpe ?? 8.0
            if avgRpe >= 9.0 || insight.phase == .DELOAD {
                stallingEx = catEx
                stallingReason = "\(catEx.name) felt heavy recently — try a fresh \(catEx.primaryMuscleGroup.rawValue.lowercased()) stimulus"
                break
            } else if insight.sessionsCount >= 2 && (insight.slopePerSession <= 0.15 || insight.phase == .MAINTAIN) {
                stallingEx = catEx
                stallingReason = "Progress on \(catEx.name) has plateaued — rotate or add a complementary \(catEx.primaryMuscleGroup.rawValue.lowercased()) movement"
                break
            }
        }

        let targetMuscle = stallingEx?.primaryMuscleGroup ?? splitMuscles.first ?? .SHOULDERS
        let pool = strengthCatalog.filter {
            !idSet.contains($0.id) &&
            !nameSet.contains($0.name.lowercased()) &&
            $0.primaryMuscleGroup == targetMuscle
        }
        let fallbackPool = pool.isEmpty
            ? strengthCatalog.filter { !idSet.contains($0.id) && !nameSet.contains($0.name.lowercased()) }
            : pool

        guard let chosen = fallbackPool.first else { return nil }
        let reason = stallingReason ?? "Recommended \(chosen.primaryMuscleGroup.rawValue.lowercased()) exercise to complement \(workoutName)"
        let defaultWeight: Double = (chosen.primaryMuscleGroup == .SHOULDERS || chosen.primaryMuscleGroup == .BICEPS || chosen.primaryMuscleGroup == .TRICEPS)
            ? (weightUnit == .LBS ? 25.0 : 12.5)
            : (weightUnit == .LBS ? 95.0 : 40.0)

        return WorkoutExerciseSuggestion(
            suggestedExercise: chosen,
            targetMuscle: chosen.primaryMuscleGroup,
            reasonText: reason,
            stallingExerciseId: stallingEx?.id,
            stallingExerciseName: stallingEx?.name,
            recommendedSets: 3,
            recommendedRepsMin: chosen.category == .COMPOUND ? 8 : 10,
            recommendedRepsMax: chosen.category == .COMPOUND ? 12 : 15,
            recommendedWeight: defaultWeight,
            recommendedRestSeconds: chosen.category == .COMPOUND ? 90 : 60
        )
    }
}

public struct ExerciseBlockItem<T: Sendable>: Sendable {
    public var item: T
    public var globalIndex: Int
    public var stepNumber: Int

    public init(item: T, globalIndex: Int, stepNumber: Int) {
        self.item = item
        self.globalIndex = globalIndex
        self.stepNumber = stepNumber
    }
}

public struct ExerciseRenderBlock<T: Sendable>: Sendable {
    public var isSuperset: Bool
    public var startIndex: Int
    public var rounds: Int
    public var roundRestSeconds: Int
    public var items: [ExerciseBlockItem<T>]

    public init(
        isSuperset: Bool,
        startIndex: Int,
        rounds: Int,
        roundRestSeconds: Int,
        items: [ExerciseBlockItem<T>]
    ) {
        self.isSuperset = isSuperset
        self.startIndex = startIndex
        self.rounds = rounds
        self.roundRestSeconds = roundRestSeconds
        self.items = items
    }
}

public struct WorkoutExerciseSuggestion: Sendable, Equatable {
    public var suggestedExercise: ExerciseDto
    public var targetMuscle: MuscleGroup
    public var reasonText: String
    public var stallingExerciseId: String?
    public var stallingExerciseName: String?
    public var recommendedSets: Int
    public var recommendedRepsMin: Int
    public var recommendedRepsMax: Int
    public var recommendedWeight: Double
    public var recommendedRestSeconds: Int

    public init(
        suggestedExercise: ExerciseDto,
        targetMuscle: MuscleGroup,
        reasonText: String,
        stallingExerciseId: String? = nil,
        stallingExerciseName: String? = nil,
        recommendedSets: Int = 3,
        recommendedRepsMin: Int = 10,
        recommendedRepsMax: Int = 14,
        recommendedWeight: Double = 20.0,
        recommendedRestSeconds: Int = 60
    ) {
        self.suggestedExercise = suggestedExercise
        self.targetMuscle = targetMuscle
        self.reasonText = reasonText
        self.stallingExerciseId = stallingExerciseId
        self.stallingExerciseName = stallingExerciseName
        self.recommendedSets = recommendedSets
        self.recommendedRepsMin = recommendedRepsMin
        self.recommendedRepsMax = recommendedRepsMax
        self.recommendedWeight = recommendedWeight
        self.recommendedRestSeconds = recommendedRestSeconds
    }
}
