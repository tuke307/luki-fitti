import {
  EquipmentType,
  ExerciseCategory,
  ExerciseType,
  SetType,
  WeightUnit,
} from '../enums';
import type {
  ExerciseDto,
  SessionExerciseDto,
  SessionSetDto,
  WorkoutSessionDto,
} from '../schemas';

const LBS_TO_KG = 0.45359237;
const KG_TO_LBS = 1 / LBS_TO_KG;

export type ProgressionPhase =
  | 'INCREASE_WEIGHT'
  | 'INCREASE_REPS'
  | 'DELOAD'
  | 'MAINTAIN'
  | 'BASELINE';

export interface SetProgressionSuggestion {
  workingSetIndex: number;
  lastWeight: number | null;
  lastReps: number | null;
  lastRpe: number | null;
  suggestedWeight: number | null;
  suggestedReps: number | null;
  weightDelta: number;
  repsDelta: number;
  phase: ProgressionPhase;
  confidence: number;
}

export interface ExerciseHistorySessionEntry {
  clientSessionId: string;
  workoutName: string;
  startedAt: string;
  workingSets: Array<{
    setNumber: number;
    weight: number;
    weightUnit: WeightUnit;
    weightNormalized: number;
    reps: number;
    rpe: number | null;
    estimated1RM: number;
  }>;
  bestEstimated1RM: number;
  avgWeightNormalized: number;
  avgReps: number;
  avgRpe: number | null;
  totalVolumeNormalized: number;
}

export interface ExerciseProgressionInsight {
  exerciseId: string;
  sessionsCount: number;
  lastSession: ExerciseHistorySessionEntry | null;
  history: ExerciseHistorySessionEntry[];
  ewma1RM: number;
  slopePerSession: number;
  phase: ProgressionPhase;
  confidence: number;
  setSuggestions: SetProgressionSuggestion[];
}

export function convertWeight(weight: number, fromUnit: WeightUnit, toUnit: WeightUnit): number {
  if (fromUnit === toUnit) return weight;
  const converted = fromUnit === WeightUnit.LBS ? weight * LBS_TO_KG : weight * KG_TO_LBS;
  return Math.round(converted * 2) / 2;
}

/**
 * Ensemble 1RM estimator combining Epley (1 + r/30) and Brzycki (36 / (37 - r))
 * for reliable submaximal strength estimation across 1..20+ rep ranges.
 */
export function estimateOneRepMax(weight: number, reps: number, rpe?: number | null): number {
  if (weight <= 0 || reps <= 0) return 0;
  const repsInReserve = rpe && rpe >= 5 && rpe <= 10 ? Math.max(0, 10 - rpe) : 0;
  const effectiveReps = Math.min(30, reps + repsInReserve * 0.5);
  if (effectiveReps === 1) return weight;

  const epley = weight * (1 + effectiveReps / 30);
  const brzycki =
    effectiveReps < 35 ? weight * (36 / (37 - effectiveReps)) : epley;
  const blended = effectiveReps <= 10 ? (epley + brzycki) / 2 : epley;
  return Math.round(blended * 100) / 100;
}

/**
 * Determines the smallest practical gym plate/dumbbell increment for an exercise.
 */
export function getStandardWeightIncrement(
  unit: WeightUnit,
  exercise?: Pick<ExerciseDto, 'category' | 'equipment'> | null,
  currentWeight?: number | null,
): number {
  const isIsolation = exercise?.category === ExerciseCategory.ISOLATION;
  const eq = exercise?.equipment;

  if (unit === WeightUnit.LBS) {
    if (isIsolation || eq === EquipmentType.DUMBBELL || eq === EquipmentType.CABLE) {
      return 5;
    }
    return currentWeight && currentWeight >= 135 ? 5 : 5;
  }

  // KG increments
  if (isIsolation || eq === EquipmentType.CABLE) {
    return currentWeight && currentWeight < 20 ? 1.25 : 2.5;
  }
  if (eq === EquipmentType.DUMBBELL) {
    return 2;
  }
  return 2.5;
}

export function roundToGymStep(value: number, step = 0.5): number {
  if (step <= 0) return Math.round(value * 10) / 10;
  const inv = 1 / step;
  return Math.round(value * inv) / inv;
}

/**
 * Extracts global chronological exercise history across ALL workouts and folders
 * (single source of truth by exerciseId, with case-insensitive name fallback).
 */
export function extractGlobalExerciseHistory(
  exerciseId: string | null | undefined,
  exerciseName: string | null | undefined,
  historySessions: WorkoutSessionDto[],
  targetUnit: WeightUnit = WeightUnit.KG,
): ExerciseHistorySessionEntry[] {
  if (!exerciseId && !exerciseName) return [];
  const normalizedTargetName = exerciseName?.trim().toLowerCase() ?? '';

  const completedSessions = historySessions
    .filter((s) => s.status === 'COMPLETED' || s.completedAt !== null)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));

  const entries: ExerciseHistorySessionEntry[] = [];

  for (const session of completedSessions) {
    const matchingExercises = session.exercises.filter((ex) => {
      if (exerciseId && ex.exerciseId === exerciseId) return true;
      if (
        !ex.exerciseId &&
        normalizedTargetName &&
        ex.exerciseNameSnapshot.trim().toLowerCase() === normalizedTargetName
      ) {
        return true;
      }
      return false;
    });

    if (matchingExercises.length === 0) continue;

    const workingSets: ExerciseHistorySessionEntry['workingSets'] = [];
    for (const ex of matchingExercises) {
      if (
        ex.exerciseTypeSnapshot === ExerciseType.STRETCHING ||
        ex.exerciseTypeSnapshot === ExerciseType.MOBILITY
      ) {
        continue;
      }

      for (const s of ex.sets) {
        if (!s.completed || s.setType === SetType.WARMUP || s.setType === SetType.STRETCH) {
          continue;
        }
        const rawWeight = s.weight ?? 0;
        const reps = s.reps ?? 0;
        if (rawWeight <= 0 && reps <= 0) continue;

        const weightNormalized =
          rawWeight > 0 ? convertWeight(rawWeight, s.weightUnit, targetUnit) : 0;
        const est1RM =
          weightNormalized > 0 && reps > 0
            ? estimateOneRepMax(weightNormalized, reps, s.rpe)
            : reps;

        workingSets.push({
          setNumber: workingSets.length + 1,
          weight: rawWeight,
          weightUnit: s.weightUnit,
          weightNormalized,
          reps,
          rpe: s.rpe ?? null,
          estimated1RM: est1RM,
        });
      }
    }

    if (workingSets.length === 0) continue;

    const bestEstimated1RM = Math.max(...workingSets.map((ws) => ws.estimated1RM));
    const avgWeightNormalized =
      Math.round(
        (workingSets.reduce((sum, ws) => sum + ws.weightNormalized, 0) / workingSets.length) * 10,
      ) / 10;
    const avgReps =
      Math.round(
        (workingSets.reduce((sum, ws) => sum + ws.reps, 0) / workingSets.length) * 10,
      ) / 10;

    const rpeSets = workingSets.filter((ws) => ws.rpe !== null && ws.rpe !== undefined);
    const avgRpe =
      rpeSets.length > 0
        ? Math.round(
            (rpeSets.reduce((sum, ws) => sum + (ws.rpe ?? 0), 0) / rpeSets.length) * 10,
          ) / 10
        : null;

    const totalVolumeNormalized =
      Math.round(
        workingSets.reduce((sum, ws) => sum + ws.weightNormalized * ws.reps, 0) * 10,
      ) / 10;

    entries.push({
      clientSessionId: session.clientSessionId,
      workoutName: session.workoutNameSnapshot,
      startedAt: session.startedAt,
      workingSets,
      bestEstimated1RM,
      avgWeightNormalized,
      avgReps,
      avgRpe,
      totalVolumeNormalized,
    });
  }

  return entries;
}

/**
 * Computes Ordinary Least Squares (OLS) linear regression slope per session
 * and Exponentially Weighted Moving Average (EWMA) over recent sessions.
 */
function computeTrendTelemetry(entries: ExerciseHistorySessionEntry[]): {
  ewma1RM: number;
  slopePerSession: number;
} {
  if (entries.length === 0) {
    return { ewma1RM: 0, slopePerSession: 0 };
  }

  const alpha = 0.45;
  let ewma = entries[0]!.bestEstimated1RM;
  for (let i = 1; i < entries.length; i++) {
    ewma = alpha * entries[i]!.bestEstimated1RM + (1 - alpha) * ewma;
  }

  const recent = entries.slice(-6);
  const n = recent.length;
  if (n < 2) {
    return { ewma1RM: Math.round(ewma * 10) / 10, slopePerSession: 0 };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = recent[i]!.bestEstimated1RM;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumXX += x * x;
  }

  const denom = n * sumXX - sumX * sumX;
  const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;

  return {
    ewma1RM: Math.round(ewma * 10) / 10,
    slopePerSession: Math.round(slope * 100) / 100,
  };
}

/**
 * Statistical / ML Progressive Overload & Autoregulation Engine.
 *
 * Analyzes global exercise history across all workouts & folders (single source of truth)
 * using EWMA 1RM smoothing, OLS trend slope, RPE fatigue autoregulation, and double-progression
 * rep bands to output per-set weight/rep recommendations and subtle inline deltas.
 */
export function computeExerciseProgression(params: {
  exerciseId: string | null | undefined;
  exerciseName: string | null | undefined;
  historySessions: WorkoutSessionDto[];
  catalogExercise?: ExerciseDto | null;
  plannedSets?: number;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetWeight?: number | null;
  weightUnit?: WeightUnit;
  currentSets?: SessionSetDto[];
}): ExerciseProgressionInsight {
  const {
    exerciseId,
    exerciseName,
    historySessions,
    catalogExercise,
    plannedSets = 3,
    targetRepsMin = 8,
    targetRepsMax = 12,
    targetWeight = null,
    weightUnit = WeightUnit.KG,
    currentSets,
  } = params;

  const repMin = targetRepsMin ?? 8;
  const repMax = targetRepsMax ?? Math.max(repMin + 2, 12);

  const history = extractGlobalExerciseHistory(
    exerciseId,
    exerciseName,
    historySessions,
    weightUnit,
  );

  const { ewma1RM, slopePerSession } = computeTrendTelemetry(history);
  const lastSession = history.length > 0 ? history[history.length - 1]! : null;
  const prevSession = history.length > 1 ? history[history.length - 2]! : null;

  const workingSetsCount = currentSets
    ? currentSets.filter((s) => s.setType !== SetType.WARMUP && s.setType !== SetType.STRETCH)
        .length
    : plannedSets;

  if (!lastSession || lastSession.workingSets.length === 0) {
    return {
      exerciseId: exerciseId ?? exerciseName ?? 'unknown',
      sessionsCount: 0,
      lastSession: null,
      history: [],
      ewma1RM: 0,
      slopePerSession: 0,
      phase: 'BASELINE',
      confidence: 0,
      setSuggestions: Array.from({ length: Math.max(1, workingSetsCount) }, (_, idx) => ({
        workingSetIndex: idx,
        lastWeight: null,
        lastReps: null,
        lastRpe: null,
        suggestedWeight: targetWeight,
        suggestedReps: repMin,
        weightDelta: 0,
        repsDelta: 0,
        phase: 'BASELINE',
        confidence: 0,
      })),
    };
  }

  const lastWorkingSets = lastSession.workingSets;
  const primaryLastWeight = lastWorkingSets[0]?.weightNormalized ?? 0;
  const stepIncrement = getStandardWeightIncrement(
    weightUnit,
    catalogExercise,
    primaryLastWeight,
  );

  // Determine overall exercise phase from recent performance & fatigue
  const allSetsHitTopOfBand = lastWorkingSets.every((s) => s.reps >= repMax);
  const majoritySetsBelowMin =
    lastWorkingSets.filter((s) => s.reps < repMin).length > lastWorkingSets.length / 2;
  const highFatigueLast = (lastSession.avgRpe ?? 8) >= 9.5;
  const consecutiveRegression =
    prevSession !== null &&
    lastSession.bestEstimated1RM < prevSession.bestEstimated1RM * 0.96 &&
    (majoritySetsBelowMin || highFatigueLast);

  let overallPhase: ProgressionPhase;
  if (consecutiveRegression || (majoritySetsBelowMin && highFatigueLast)) {
    overallPhase = 'DELOAD';
  } else if (allSetsHitTopOfBand && !highFatigueLast && primaryLastWeight > 0) {
    overallPhase = 'INCREASE_WEIGHT';
  } else if (highFatigueLast && !majoritySetsBelowMin) {
    overallPhase = 'MAINTAIN';
  } else {
    overallPhase = 'INCREASE_REPS';
  }

  const confidence = Math.min(0.95, Math.round((0.45 + Math.min(history.length, 5) * 0.1) * 100) / 100);

  // Build per-working-set suggestions and deltas against either the current input or last session
  const currentWorkingSets = currentSets
    ? currentSets.filter((s) => s.setType !== SetType.WARMUP && s.setType !== SetType.STRETCH)
    : [];

  const totalSetsToSuggest = Math.max(
    workingSetsCount,
    currentWorkingSets.length,
    lastWorkingSets.length,
  );

  const setSuggestions: SetProgressionSuggestion[] = [];

  for (let idx = 0; idx < totalSetsToSuggest; idx++) {
    const historicalSet =
      lastWorkingSets[idx] ?? lastWorkingSets[lastWorkingSets.length - 1]!;
    const lastW = historicalSet.weightNormalized;
    const lastR = historicalSet.reps;
    const lastRpe = historicalSet.rpe;

    let suggestedWeight: number | null;
    let suggestedReps: number | null;
    let setPhase: ProgressionPhase;

    if (overallPhase === 'INCREASE_WEIGHT' && lastW > 0) {
      suggestedWeight = roundToGymStep(lastW + stepIncrement, 0.5);
      // Reset reps toward bottom/middle of target rep band when stepping up weight
      suggestedReps = repMin;
      setPhase = 'INCREASE_WEIGHT';
    } else if (overallPhase === 'DELOAD' && lastW > 0) {
      const reduced = Math.max(
        stepIncrement,
        lastW - Math.max(stepIncrement, roundToGymStep(lastW * 0.05, stepIncrement)),
      );
      suggestedWeight = roundToGymStep(reduced, 0.5);
      suggestedReps = Math.max(repMin, Math.min(repMax, lastR));
      setPhase = 'DELOAD';
    } else if (overallPhase === 'INCREASE_REPS') {
      if (lastR >= repMax && lastW > 0 && (lastRpe ?? 8) < 9.5) {
        // Individual set topped out rep range even if later sets didn't -> suggest micro weight bump or hold
        suggestedWeight = roundToGymStep(lastW + stepIncrement, 0.5);
        suggestedReps = repMin;
        setPhase = 'INCREASE_WEIGHT';
      } else if (lastR < repMax && (lastRpe ?? 8) <= 9) {
        suggestedWeight = lastW > 0 ? lastW : targetWeight;
        suggestedReps = Math.min(repMax, lastR + 1);
        setPhase = 'INCREASE_REPS';
      } else {
        suggestedWeight = lastW > 0 ? lastW : targetWeight;
        suggestedReps = lastR;
        setPhase = 'MAINTAIN';
      }
    } else {
      suggestedWeight = lastW > 0 ? lastW : targetWeight;
      suggestedReps = lastR;
      setPhase = 'MAINTAIN';
    }

    // Calculate delta relative to the baseline (last logged weight/reps for this set)
    const baselineWeight = lastW > 0 ? lastW : (targetWeight ?? 0);
    const baselineReps = lastR > 0 ? lastR : repMin;

    const weightDelta =
      suggestedWeight !== null && baselineWeight > 0
        ? Math.round((suggestedWeight - baselineWeight) * 100) / 100
        : 0;
    const repsDelta =
      suggestedReps !== null && baselineReps > 0 ? suggestedReps - baselineReps : 0;

    setSuggestions.push({
      workingSetIndex: idx,
      lastWeight: lastW > 0 ? lastW : null,
      lastReps: lastR > 0 ? lastR : null,
      lastRpe,
      suggestedWeight,
      suggestedReps,
      weightDelta,
      repsDelta,
      phase: setPhase,
      confidence,
    });
  }

  return {
    exerciseId: exerciseId ?? exerciseName ?? 'unknown',
    sessionsCount: history.length,
    lastSession,
    history,
    ewma1RM,
    slopePerSession,
    phase: overallPhase,
    confidence,
    setSuggestions,
  };
}

/**
 * Formats a compact, text-free delta badge label such as "+2.5", "-2.5", "+1", "-1".
 */
export function formatCompactDelta(delta: number): string | null {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.01) return null;
  const rounded = Math.round(delta * 100) / 100;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

/**
 * Hydrates a newly created or substituted SessionExerciseDto with the user's
 * global single-source-of-truth exercise history so starting any workout in any
 * folder pre-populates the athlete's real working weights and reps.
 */
export function applyExerciseHistoryToSessionExercise(
  sessionExercise: SessionExerciseDto,
  historySessions: WorkoutSessionDto[],
  catalogExercise?: ExerciseDto | null,
  weightUnit: WeightUnit = WeightUnit.KG,
): SessionExerciseDto {
  if (
    sessionExercise.exerciseTypeSnapshot === ExerciseType.STRETCHING ||
    sessionExercise.exerciseTypeSnapshot === ExerciseType.MOBILITY
  ) {
    return sessionExercise;
  }

  const insight = computeExerciseProgression({
    exerciseId: sessionExercise.exerciseId,
    exerciseName: sessionExercise.exerciseNameSnapshot,
    historySessions,
    catalogExercise,
    plannedSets: sessionExercise.plannedSets,
    targetRepsMin: sessionExercise.targetRepsMin,
    targetRepsMax: sessionExercise.targetRepsMax,
    targetWeight: sessionExercise.targetWeight,
    weightUnit,
    currentSets: sessionExercise.sets,
  });

  if (!insight.lastSession) {
    return sessionExercise;
  }

  const primaryLastWeight = insight.lastSession.workingSets[0]?.weightNormalized ?? null;
  let workingIdx = 0;

  const hydratedSets = sessionExercise.sets.map((set) => {
    if (set.setType === SetType.WARMUP) {
      const warmupBase = primaryLastWeight ?? sessionExercise.targetWeight;
      return {
        ...set,
        weight: warmupBase ? roundToGymStep(warmupBase * 0.6, 0.5) : set.weight,
        weightUnit,
      };
    }

    if (set.setType === SetType.STRETCH) {
      return set;
    }

    const suggestion =
      insight.setSuggestions[workingIdx] ??
      insight.setSuggestions[insight.setSuggestions.length - 1];
    workingIdx += 1;

    if (!suggestion) return set;

    // Pre-fill with the athlete's last logged weight & reps from global history
    // so the inline suggestion badge (+2.5, +1, etc.) clearly shows the recommended delta
    // and can be tapped to apply or adjusted manually.
    return {
      ...set,
      weight: suggestion.lastWeight ?? set.weight,
      weightUnit,
      reps: suggestion.lastReps ?? set.reps,
    };
  });

  return {
    ...sessionExercise,
    targetWeight: primaryLastWeight ?? sessionExercise.targetWeight,
    sets: hydratedSets,
  };
}
