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

    /// RPE logged by the 3-bar "Max" effort level — nothing left in the tank.
    public static let maxEffortRpe: Double = 9.5

    /// Stall detection thresholds. Mirrored 1:1 from `SUGGESTION_THRESHOLDS` in
    /// `packages/common/src/utils/progression.util.ts` — keep both in sync.
    public enum SuggestionThresholds {
        /// Sessions compared for grinding / regression.
        public static let recentWindow = 3
        /// Max-effort sessions within the recent window that count as grinding.
        public static let grindingMinHardSessions = 2
        /// Estimated 1RM gain (%) across the window below which max effort is "no gain".
        public static let grindingMaxGainPct = 1.0
        /// Estimated 1RM drop (%) across the window that counts as a regression.
        public static let regressionDropPct = 4.0
        public static let plateauMinSessions = 4
        public static let plateauMinWeeks = 3.0
        public static let plateauMinSessionsSinceBest = 3
        /// A key split muscle with fewer than this share of the busiest muscle's sets is low volume.
        public static let lowVolumeRatio = 0.5
    }

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
        let maxEffortLast = (lastSession.avgRpe ?? 8.0) >= maxEffortRpe || elevatedSystemicFatigueFromHR
        let consecutiveRegression = prevSession != nil &&
            lastSession.bestEstimated1RM < (prevSession?.bestEstimated1RM ?? 0) * 0.96 &&
            (majoritySetsBelowMin || maxEffortLast)

        // Max effort is a normal training outcome: topping out the rep band still earns
        // more weight, and only a max effort below the top holds the prescription.
        // Watch HR recovery fatigue (no effort logged) still holds the weight.
        let overallPhase: ProgressionPhase
        if consecutiveRegression || (majoritySetsBelowMin && maxEffortLast) {
            overallPhase = .DELOAD
        } else if allSetsHitTopOfBand && !elevatedSystemicFatigueFromHR && primaryLastWeight > 0 {
            overallPhase = .INCREASE_WEIGHT
        } else if maxEffortLast && !majoritySetsBelowMin {
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
            } else if lastR >= repMax && lastW > 0 && !elevatedSystemicFatigueFromHR {
                // Individual set topped out rep range even if later sets didn't -> suggest micro weight bump
                suggestedWeight = roundToGymStep(lastW + stepIncrement, step: 0.5)
                suggestedReps = repMin
                setPhase = .INCREASE_WEIGHT
            } else if overallPhase == .INCREASE_REPS {
                if lastR < repMax && (lastRpe ?? 8.0) <= 9.0 {
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

    // MARK: - Exercise Trend & Stall Detection

    /// Summarizes whether an exercise is still moving: a single max-effort session is
    /// normal training, a stall is max effort or time passing without results.
    public static func analyzeExerciseTrend(_ history: [ExerciseHistorySessionEntry]) -> ExerciseTrend {
        guard let first = history.first, let last = history.last else { return ExerciseTrend() }
        let n = history.count

        var bestIndex = 0
        for i in 1..<n where history[i].bestEstimated1RM > history[bestIndex].bestEstimated1RM {
            bestIndex = i
        }

        let recent = Array(history.suffix(SuggestionThresholds.recentWindow))
        let windowStart = recent[0].bestEstimated1RM
        let changePct = recent.count >= 2 && windowStart > 0
            ? (((last.bestEstimated1RM - windowStart) / windowStart) * 1000.0).rounded() / 10.0
            : 0

        return ExerciseTrend(
            sessionsCount: n,
            spanWeeks: weeksBetween(first.startedAt, last.startedAt),
            sessionsSinceBest: n - 1 - bestIndex,
            weeksSinceBest: Int(weeksBetween(history[bestIndex].startedAt, last.startedAt).rounded(.down)),
            hardSessionsRecent: recent.filter { ($0.avgRpe ?? 0) >= maxEffortRpe }.count,
            recentWindow: recent.count,
            changePct: changePct
        )
    }

    /// Classifies an exercise trend as a stall, or `nil` when it is still progressing.
    /// Priority: REGRESSION > GRINDING > PLATEAU.
    public static func classifyExerciseStall(_ trend: ExerciseTrend) -> ExerciseSuggestionReasonType? {
        typealias T = SuggestionThresholds
        let fullWindow = trend.recentWindow >= T.recentWindow
        if fullWindow && trend.changePct <= -T.regressionDropPct { return .REGRESSION }
        if fullWindow &&
            trend.hardSessionsRecent >= T.grindingMinHardSessions &&
            trend.changePct < T.grindingMaxGainPct {
            return .GRINDING
        }
        if trend.sessionsCount >= T.plateauMinSessions &&
            trend.spanWeeks >= T.plateauMinWeeks &&
            trend.sessionsSinceBest >= T.plateauMinSessionsSinceBest {
            return .PLATEAU
        }
        return nil
    }

    private static func weeksBetween(_ from: String, _ to: String) -> Double {
        guard let start = parseIsoDate(from), let end = parseIsoDate(to) else { return 0 }
        return end.timeIntervalSince(start) / (7 * 24 * 60 * 60)
    }

    private static func parseIsoDate(_ value: String) -> Date? {
        (try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(value))
            ?? (try? Date.ISO8601FormatStyle().parse(value))
    }

    // MARK: - Smart Workout Exercise Suggestion Engine (Max 1 per Workout)

    private static let splitMusclePriority: [WorkoutSplitArchetype: [MuscleGroup]] = [
        .PUSH: [.SHOULDERS, .CHEST, .TRICEPS],
        .PULL: [.BACK, .BICEPS, .SHOULDERS],
        .LEGS: [.QUADRICEPS, .HAMSTRINGS, .GLUTES, .CALVES],
        .ARMS: [.BICEPS, .TRICEPS, .SHOULDERS, .FOREARMS],
        .SHOULDERS: [.SHOULDERS, .TRICEPS, .ABS_CORE],
        .CHEST_BACK: [.CHEST, .BACK, .SHOULDERS],
        .UPPER: [.SHOULDERS, .CHEST, .BACK, .BICEPS, .TRICEPS],
        .FULL_BODY: [.SHOULDERS, .CHEST, .BACK, .QUADRICEPS, .HAMSTRINGS],
    ]

    public static func inferWorkoutSplitArchetype(
        workoutName: String,
        folderName: String?,
        musclesInWorkout: [MuscleGroup]
    ) -> WorkoutSplitArchetype {
        let text = "\(workoutName) \(folderName ?? "")".lowercased()

        if text.contains("push") || (text.contains("chest") && text.contains("tricep")) { return .PUSH }
        if text.contains("pull") || (text.contains("back") && text.contains("bicep")) { return .PULL }
        if text.contains("leg") || text.contains("bein") || text.contains("quad") || text.contains("lower") {
            return .LEGS
        }
        if text.contains("arm") || text.contains("bicep") || text.contains("tricep") { return .ARMS }
        if text.contains("shoulder") || text.contains("schulter") || text.contains("delt") { return .SHOULDERS }

        let muscleSet = Set(musclesInWorkout)
        let hasPush = muscleSet.contains(.CHEST) && (muscleSet.contains(.TRICEPS) || muscleSet.contains(.SHOULDERS))
        let hasPull = muscleSet.contains(.BACK) && muscleSet.contains(.BICEPS)
        let hasLegs = muscleSet.contains(.QUADRICEPS) || muscleSet.contains(.HAMSTRINGS) || muscleSet.contains(.GLUTES)

        if hasPush && !hasPull && !hasLegs { return .PUSH }
        if hasPull && !hasPush && !hasLegs { return .PULL }
        if hasLegs && !hasPush && !hasPull { return .LEGS }
        if (muscleSet.contains(.BICEPS) || muscleSet.contains(.TRICEPS)) &&
            !hasLegs && !muscleSet.contains(.CHEST) && !muscleSet.contains(.BACK) {
            return .ARMS
        }
        if hasPush && hasPull && !hasLegs { return .UPPER }
        return .FULL_BODY
    }

    /// Identifies *why* a suggestion was made (stalling exercise or target muscle).
    /// Mirrors `workoutSuggestionReasonKey` in progression.util.ts.
    public static func workoutSuggestionReasonKey(
        reasonType: ExerciseSuggestionReasonType,
        stallingExerciseId: String?,
        targetMuscle: MuscleGroup
    ) -> String {
        if let stallingExerciseId { return "\(reasonType.rawValue):\(stallingExerciseId)" }
        return "\(reasonType.rawValue):\(targetMuscle.rawValue)"
    }

    public static func toDismissedSuggestion(_ s: WorkoutExerciseSuggestion) -> DismissedWorkoutSuggestion {
        DismissedWorkoutSuggestion(
            reasonKey: workoutSuggestionReasonKey(
                reasonType: s.reasonType,
                stallingExerciseId: s.stallingExerciseId,
                targetMuscle: s.targetMuscle
            ),
            exerciseId: s.suggestedExercise.id
        )
    }

    /// Proposes at most ONE smart exercise suggestion for a workout, and only when there is a
    /// concrete reason: an exercise that regressed, grinds at max effort without gains, or
    /// plateaued for weeks, or a key split muscle that is missing or under-trained.
    /// Returns `nil` otherwise. Mirrors `computeWorkoutExerciseSuggestion` in progression.util.ts.
    public static func computeWorkoutExerciseSuggestion(
        workoutName: String,
        folderName: String? = nil,
        exercises: [WorkoutSuggestionInputExercise],
        catalog: [ExerciseDto],
        historySessions: [WorkoutSessionDto],
        weightUnit: WeightUnit = .KG,
        dismissed: [DismissedWorkoutSuggestion] = []
    ) -> WorkoutExerciseSuggestion? {
        let strengthCatalog = catalog.filter { $0.exerciseType == .STRENGTH }
        guard !strengthCatalog.isEmpty else { return nil }

        var existingIds = Set<String>()
        var existingNames = Set<String>()
        var resolved: [(input: WorkoutSuggestionInputExercise, catalogEx: ExerciseDto?, muscle: MuscleGroup)] = []

        for ex in exercises {
            let normalizedName = ex.exerciseName?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let catEx = ex.exerciseId.flatMap { id in catalog.first { $0.id == id } }
                ?? normalizedName.flatMap { name in
                    catalog.first { $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == name }
                }

            if let id = ex.exerciseId { existingIds.insert(id) }
            if let catEx {
                existingIds.insert(catEx.id)
                existingNames.insert(catEx.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
            }
            if let normalizedName { existingNames.insert(normalizedName) }

            resolved.append((ex, catEx, ex.primaryMuscleGroup ?? catEx?.primaryMuscleGroup ?? .CHEST))
        }

        let splitArchetype = inferWorkoutSplitArchetype(
            workoutName: workoutName,
            folderName: folderName,
            musclesInWorkout: resolved.map(\.muscle)
        )
        let splitMuscles = splitMusclePriority[splitArchetype] ?? [.SHOULDERS]

        var setsByMuscle: [MuscleGroup: Int] = Dictionary(uniqueKeysWithValues: splitMuscles.map { ($0, 0) })
        for r in resolved { setsByMuscle[r.muscle, default: 0] += r.input.plannedSets }
        let setsTotal = resolved.reduce(0) { $0 + $1.input.plannedSets }

        // Every honest reason, strongest first: stalls by severity, then missing / under-trained muscles.
        struct Reason {
            var reasonType: ExerciseSuggestionReasonType
            var targetMuscle: MuscleGroup
            var stallingExerciseId: String?
            var stallingExerciseName: String?
            var avoidEquipment: EquipmentType?
            var trend: ExerciseTrend?
            var severity: Double
        }
        var stalls: [(order: Int, reason: Reason)] = []

        for (order, item) in resolved.enumerated() {
            let exId = item.input.exerciseId ?? item.catalogEx?.id
            let exName = item.input.exerciseName ?? item.catalogEx?.name
            if exId == nil && exName == nil { continue }

            let trend = analyzeExerciseTrend(
                extractGlobalExerciseHistory(
                    exerciseId: exId,
                    exerciseName: exName,
                    historySessions: historySessions,
                    targetUnit: weightUnit
                )
            )
            guard let stall = classifyExerciseStall(trend) else { continue }

            // Give a bonus to the key split muscle (e.g. SHOULDERS in PUSH) when tied
            let splitBonus = item.muscle == splitMuscles.first ? 1.5 : 0
            let (base, detail): (Double, Double) = switch stall {
            case .REGRESSION: (100, min(20, -trend.changePct))
            case .GRINDING: (50, Double(trend.hardSessionsRecent) * 5)
            default: (10, Double(min(20, trend.sessionsSinceBest)))
            }
            stalls.append((order, Reason(
                reasonType: stall,
                targetMuscle: item.muscle,
                stallingExerciseId: exId,
                stallingExerciseName: exName ?? "Exercise",
                avoidEquipment: item.catalogEx?.equipment,
                trend: trend,
                severity: base + detail + splitBonus
            )))
        }
        // Stable sort by severity (matches the JS sort used on the web)
        var reasons = stalls
            .sorted { $0.reason.severity != $1.reason.severity ? $0.reason.severity > $1.reason.severity : $0.order < $1.order }
            .map(\.reason)

        // No stall needed: only suggest when a key split muscle is missing or clearly under-trained
        let maxSets = splitMuscles.map { setsByMuscle[$0] ?? 0 }.max() ?? 0
        let lowVolumeLimit = Double(maxSets) * SuggestionThresholds.lowVolumeRatio
        var muscleReasons: [(idx: Int, muscle: MuscleGroup, count: Int)] = []
        for (idx, muscle) in splitMuscles.enumerated() {
            let count = setsByMuscle[muscle] ?? 0
            if count == 0 || Double(count) < lowVolumeLimit {
                muscleReasons.append((idx, muscle, count))
            }
        }
        muscleReasons.sort { lhs, rhs in
            lhs.count != rhs.count ? lhs.count < rhs.count : lhs.idx < rhs.idx
        }
        for m in muscleReasons {
            reasons.append(Reason(
                reasonType: m.count == 0 ? .MISSING_MUSCLE : .LOW_VOLUME,
                targetMuscle: m.muscle,
                stallingExerciseId: nil,
                stallingExerciseName: nil,
                avoidEquipment: resolved.first { $0.muscle == m.muscle }?.catalogEx?.equipment,
                trend: nil,
                severity: 0
            ))
        }

        let dismissedReasons = Set(dismissed.map(\.reasonKey))
        let dismissedExercises = Set(dismissed.map(\.exerciseId))

        // Pick the first reason that is not dismissed and has a candidate not already in the workout.
        // No candidate means no honest suggestion, so the card stays hidden.
        var picked: (reason: Reason, chosen: ExerciseDto)?
        for reason in reasons {
            let key = workoutSuggestionReasonKey(
                reasonType: reason.reasonType,
                stallingExerciseId: reason.stallingExerciseId,
                targetMuscle: reason.targetMuscle
            )
            if dismissedReasons.contains(key) { continue }
            let pool = strengthCatalog.filter {
                !existingIds.contains($0.id) &&
                    !dismissedExercises.contains($0.id) &&
                    !existingNames.contains($0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()) &&
                    $0.primaryMuscleGroup == reason.targetMuscle
            }
            guard !pool.isEmpty else { continue }

            // Score candidates: prefer predefined alternatives of stalling exercise, or fresh equipment
            let preferredAltIds = Set(
                reason.stallingExerciseId.flatMap { id in catalog.first { $0.id == id } }?.alternativeExerciseIds ?? []
            )
            let scored = pool.map { candidate -> (candidate: ExerciseDto, score: Int) in
                var score = 0
                if preferredAltIds.contains(candidate.id) { score += 5 }
                if let avoid = reason.avoidEquipment, candidate.equipment != avoid { score += 3 }
                if [.CABLE, .DUMBBELL, .MACHINE].contains(candidate.equipment) { score += 2 }
                return (candidate, score)
            }
            // Stable max: first candidate with the highest score, matching the TS sort order
            picked = (reason, scored.reduce(scored[0]) { $1.score > $0.score ? $1 : $0 }.candidate)
            break
        }

        guard let picked else { return nil }
        let chosen = picked.chosen
        let reasonType = picked.reason.reasonType
        let targetMuscle = picked.reason.targetMuscle
        let stallingExerciseId = picked.reason.stallingExerciseId
        let stallingExerciseName = picked.reason.stallingExerciseName
        let trend = picked.reason.trend

        let chosenInsight = computeExerciseProgression(
            exerciseId: chosen.id,
            exerciseName: chosen.name,
            historySessions: historySessions,
            catalogExercise: chosen,
            plannedSets: 3,
            targetRepsMin: 10,
            targetRepsMax: 14,
            weightUnit: weightUnit
        )
        let isSmallMuscle = [.SHOULDERS, .BICEPS, .TRICEPS].contains(chosen.primaryMuscleGroup)
        let defaultWeight = chosenInsight.setSuggestions.first?.suggestedWeight
            ?? (isSmallMuscle ? (weightUnit == .LBS ? 25.0 : 12.5) : (weightUnit == .LBS ? 95.0 : 40.0))

        return WorkoutExerciseSuggestion(
            suggestedExercise: chosen,
            targetMuscle: chosen.primaryMuscleGroup,
            splitArchetype: splitArchetype,
            reasonType: reasonType,
            stallingExerciseId: stallingExerciseId,
            stallingExerciseName: stallingExerciseName,
            evidence: WorkoutSuggestionEvidence(
                sessionsSinceBest: trend?.sessionsSinceBest ?? 0,
                weeksSinceBest: trend?.weeksSinceBest ?? 0,
                hardSessionsRecent: trend?.hardSessionsRecent ?? 0,
                recentWindow: trend?.recentWindow ?? 0,
                changePct: trend?.changePct ?? 0,
                setsForMuscle: setsByMuscle[targetMuscle] ?? 0,
                setsTotal: setsTotal
            ),
            recommendedSets: 3,
            recommendedRepsMin: chosen.category == .COMPOUND ? 8 : 10,
            recommendedRepsMax: chosen.category == .COMPOUND ? 12 : 15,
            recommendedWeight: defaultWeight,
            recommendedRestSeconds: chosen.category == .COMPOUND ? 90 : 60
        )
    }
}

/// A suggestion the user dismissed (or accepted) during a workout.
public struct DismissedWorkoutSuggestion: Codable, Sendable, Equatable, Hashable {
    public var reasonKey: String
    public var exerciseId: String

    public init(reasonKey: String, exerciseId: String) {
        self.reasonKey = reasonKey
        self.exerciseId = exerciseId
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

public enum WorkoutSplitArchetype: String, Sendable, Equatable, Hashable {
    case PUSH, PULL, LEGS, ARMS, SHOULDERS, CHEST_BACK, UPPER, FULL_BODY
}

public enum ExerciseSuggestionReasonType: String, Sendable, Equatable, Hashable {
    case PLATEAU, GRINDING, REGRESSION, MISSING_MUSCLE, LOW_VOLUME

    /// Stall reasons reference an existing exercise that can be swapped out.
    public var isStall: Bool { self == .PLATEAU || self == .GRINDING || self == .REGRESSION }
}

public struct ExerciseTrend: Sendable, Equatable {
    public var sessionsCount: Int
    /// Weeks between the first and last logged session.
    public var spanWeeks: Double
    /// Sessions logged after the one that set the current best estimated 1RM.
    public var sessionsSinceBest: Int
    /// Whole weeks between the best session and the last session.
    public var weeksSinceBest: Int
    /// Sessions in the recent window logged at max effort.
    public var hardSessionsRecent: Int
    public var recentWindow: Int
    /// Estimated 1RM change (%) from the start to the end of the recent window.
    public var changePct: Double

    public init(
        sessionsCount: Int = 0,
        spanWeeks: Double = 0,
        sessionsSinceBest: Int = 0,
        weeksSinceBest: Int = 0,
        hardSessionsRecent: Int = 0,
        recentWindow: Int = 0,
        changePct: Double = 0
    ) {
        self.sessionsCount = sessionsCount
        self.spanWeeks = spanWeeks
        self.sessionsSinceBest = sessionsSinceBest
        self.weeksSinceBest = weeksSinceBest
        self.hardSessionsRecent = hardSessionsRecent
        self.recentWindow = recentWindow
        self.changePct = changePct
    }
}

/// Numbers behind a suggestion, formatted by the UI into a short evidence chip.
public struct WorkoutSuggestionEvidence: Sendable, Equatable {
    public var sessionsSinceBest: Int
    public var weeksSinceBest: Int
    public var hardSessionsRecent: Int
    public var recentWindow: Int
    public var changePct: Double
    public var setsForMuscle: Int
    public var setsTotal: Int

    public init(
        sessionsSinceBest: Int = 0,
        weeksSinceBest: Int = 0,
        hardSessionsRecent: Int = 0,
        recentWindow: Int = 0,
        changePct: Double = 0,
        setsForMuscle: Int = 0,
        setsTotal: Int = 0
    ) {
        self.sessionsSinceBest = sessionsSinceBest
        self.weeksSinceBest = weeksSinceBest
        self.hardSessionsRecent = hardSessionsRecent
        self.recentWindow = recentWindow
        self.changePct = changePct
        self.setsForMuscle = setsForMuscle
        self.setsTotal = setsTotal
    }
}

public struct WorkoutSuggestionInputExercise: Sendable, Equatable {
    public var exerciseId: String?
    public var exerciseName: String?
    public var primaryMuscleGroup: MuscleGroup?
    public var plannedSets: Int

    public init(
        exerciseId: String? = nil,
        exerciseName: String? = nil,
        primaryMuscleGroup: MuscleGroup? = nil,
        plannedSets: Int = 3
    ) {
        self.exerciseId = exerciseId
        self.exerciseName = exerciseName
        self.primaryMuscleGroup = primaryMuscleGroup
        self.plannedSets = plannedSets
    }
}

public struct WorkoutExerciseSuggestion: Sendable, Equatable {
    public var suggestedExercise: ExerciseDto
    public var targetMuscle: MuscleGroup
    public var splitArchetype: WorkoutSplitArchetype
    public var reasonType: ExerciseSuggestionReasonType
    /// Only set for stall reasons (PLATEAU / GRINDING / REGRESSION).
    public var stallingExerciseId: String?
    public var stallingExerciseName: String?
    public var evidence: WorkoutSuggestionEvidence
    public var recommendedSets: Int
    public var recommendedRepsMin: Int
    public var recommendedRepsMax: Int
    public var recommendedWeight: Double
    public var recommendedRestSeconds: Int

    public init(
        suggestedExercise: ExerciseDto,
        targetMuscle: MuscleGroup,
        splitArchetype: WorkoutSplitArchetype,
        reasonType: ExerciseSuggestionReasonType,
        stallingExerciseId: String? = nil,
        stallingExerciseName: String? = nil,
        evidence: WorkoutSuggestionEvidence = WorkoutSuggestionEvidence(),
        recommendedSets: Int = 3,
        recommendedRepsMin: Int = 10,
        recommendedRepsMax: Int = 14,
        recommendedWeight: Double = 20.0,
        recommendedRestSeconds: Int = 60
    ) {
        self.suggestedExercise = suggestedExercise
        self.targetMuscle = targetMuscle
        self.splitArchetype = splitArchetype
        self.reasonType = reasonType
        self.stallingExerciseId = stallingExerciseId
        self.stallingExerciseName = stallingExerciseName
        self.evidence = evidence
        self.recommendedSets = recommendedSets
        self.recommendedRepsMin = recommendedRepsMin
        self.recommendedRepsMax = recommendedRepsMax
        self.recommendedWeight = recommendedWeight
        self.recommendedRestSeconds = recommendedRestSeconds
    }
}
