import {
  EquipmentType,
  ExerciseCategory,
  ExerciseType,
  MuscleGroup,
  SetType,
  WeightUnit,
} from '../enums';
import type { ExerciseDto, SessionExerciseDto, SessionSetDto, WorkoutSessionDto } from '../schemas';

const LBS_TO_KG = 0.45359237;
const KG_TO_LBS = 1 / LBS_TO_KG;

export type ProgressionPhase =
  'INCREASE_WEIGHT' | 'INCREASE_REPS' | 'DELOAD' | 'MAINTAIN' | 'BASELINE';

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
  const brzycki = effectiveReps < 35 ? weight * (36 / (37 - effectiveReps)) : epley;
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
      if (ex.exerciseTypeSnapshot === ExerciseType.STRETCHING) {
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
      Math.round((workingSets.reduce((sum, ws) => sum + ws.reps, 0) / workingSets.length) * 10) /
      10;

    const rpeSets = workingSets.filter((ws) => ws.rpe !== null && ws.rpe !== undefined);
    const avgRpe =
      rpeSets.length > 0
        ? Math.round((rpeSets.reduce((sum, ws) => sum + (ws.rpe ?? 0), 0) / rpeSets.length) * 10) /
          10
        : null;

    const totalVolumeNormalized =
      Math.round(workingSets.reduce((sum, ws) => sum + ws.weightNormalized * ws.reps, 0) * 10) / 10;

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
  const stepIncrement = getStandardWeightIncrement(weightUnit, catalogExercise, primaryLastWeight);

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

  const confidence = Math.min(
    0.95,
    Math.round((0.45 + Math.min(history.length, 5) * 0.1) * 100) / 100,
  );

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
    const historicalSet = lastWorkingSets[idx] ?? lastWorkingSets[lastWorkingSets.length - 1]!;
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
    const repsDelta = suggestedReps !== null && baselineReps > 0 ? suggestedReps - baselineReps : 0;

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
  if (sessionExercise.exerciseTypeSnapshot === ExerciseType.STRETCHING) {
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

// ─────────────────────────────────────────────────────────────────────────────
// Gymlife-Style Superset Grouping Helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface ExerciseBlockItem<T> {
  item: T;
  globalIndex: number;
  stepNumber: number;
}

export interface ExerciseRenderBlock<T> {
  type: 'single' | 'superset';
  startIndex: number;
  rounds: number;
  intraRestSeconds: number;
  roundRestSeconds: number;
  items: Array<ExerciseBlockItem<T>>;
}

/**
 * Formats seconds into Gymlife-style M:SS round rest notation (e.g. 60 -> "1:00", 90 -> "1:30").
 */
export function formatRestDurationMinSec(seconds: number): string {
  const safe = Math.max(0, Math.round(seconds));
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

/**
 * Groups consecutive exercises linked with `restSeconds === 0` into unified Gymlife-style
 * Superset blocks while preserving standalone exercises as `'single'` blocks.
 */
export function groupExercisesIntoBlocks<T extends { restSeconds: number; plannedSets?: number }>(
  exercises: T[],
): Array<ExerciseRenderBlock<T>> {
  const blocks: Array<ExerciseRenderBlock<T>> = [];
  let i = 0;

  while (i < exercises.length) {
    const current = exercises[i]!;
    if (current.restSeconds === 0 && i < exercises.length - 1) {
      const startIndex = i;
      const items: Array<ExerciseBlockItem<T>> = [];
      let stepNumber = 1;

      while (i < exercises.length) {
        const ex = exercises[i]!;
        items.push({
          item: ex,
          globalIndex: i,
          stepNumber,
        });
        stepNumber += 1;

        if (ex.restSeconds === 0 && i < exercises.length - 1) {
          i += 1;
        } else {
          i += 1;
          break;
        }
      }

      const lastItem = items[items.length - 1]!.item;
      const maxPlannedSets = Math.max(...items.map((it) => it.item.plannedSets ?? 3));

      blocks.push({
        type: 'superset',
        startIndex,
        rounds: maxPlannedSets,
        intraRestSeconds: 0,
        roundRestSeconds: lastItem.restSeconds > 0 ? lastItem.restSeconds : 60,
        items,
      });
    } else {
      blocks.push({
        type: 'single',
        startIndex: i,
        rounds: current.plannedSets ?? 3,
        intraRestSeconds: current.restSeconds,
        roundRestSeconds: current.restSeconds,
        items: [
          {
            item: current,
            globalIndex: i,
            stepNumber: 1,
          },
        ],
      });
      i += 1;
    }
  }

  return blocks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Smart Workout Exercise Suggestion Engine (Heuristic + LLM-Ready Interface)
// ─────────────────────────────────────────────────────────────────────────────

export type WorkoutSplitArchetype =
  'PUSH' | 'PULL' | 'LEGS' | 'ARMS' | 'SHOULDERS' | 'CHEST_BACK' | 'UPPER' | 'FULL_BODY';

export type ExerciseSuggestionReasonType = 'PLATEAU' | 'HIGH_FATIGUE' | 'SPLIT_BALANCE';

export interface WorkoutExerciseSuggestion {
  suggestedExercise: ExerciseDto;
  targetMuscle: MuscleGroup;
  splitArchetype: WorkoutSplitArchetype;
  reasonType: ExerciseSuggestionReasonType;
  stallingExerciseId: string | null;
  stallingExerciseName: string | null;
  recommendedSets: number;
  recommendedRepsMin: number;
  recommendedRepsMax: number;
  recommendedWeight: number | null;
  recommendedRestSeconds: number;
}

export interface WorkoutSuggestionInputExercise {
  exerciseId?: string | null;
  exerciseName?: string | null;
  primaryMuscleGroup?: MuscleGroup | null;
  plannedSets?: number;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetWeight?: number | null;
}

const SPLIT_MUSCLE_PRIORITY: Record<WorkoutSplitArchetype, MuscleGroup[]> = {
  PUSH: [MuscleGroup.SHOULDERS, MuscleGroup.CHEST, MuscleGroup.TRICEPS],
  PULL: [MuscleGroup.BACK, MuscleGroup.BICEPS, MuscleGroup.SHOULDERS],
  LEGS: [MuscleGroup.QUADRICEPS, MuscleGroup.HAMSTRINGS, MuscleGroup.GLUTES, MuscleGroup.CALVES],
  ARMS: [MuscleGroup.BICEPS, MuscleGroup.TRICEPS, MuscleGroup.SHOULDERS, MuscleGroup.FOREARMS],
  SHOULDERS: [MuscleGroup.SHOULDERS, MuscleGroup.TRICEPS, MuscleGroup.ABS_CORE],
  CHEST_BACK: [MuscleGroup.CHEST, MuscleGroup.BACK, MuscleGroup.SHOULDERS],
  UPPER: [
    MuscleGroup.SHOULDERS,
    MuscleGroup.CHEST,
    MuscleGroup.BACK,
    MuscleGroup.BICEPS,
    MuscleGroup.TRICEPS,
  ],
  FULL_BODY: [
    MuscleGroup.SHOULDERS,
    MuscleGroup.CHEST,
    MuscleGroup.BACK,
    MuscleGroup.QUADRICEPS,
    MuscleGroup.HAMSTRINGS,
  ],
};

export function inferWorkoutSplitArchetype(
  workoutName: string,
  folderName: string | null | undefined,
  musclesInWorkout: MuscleGroup[],
): WorkoutSplitArchetype {
  const text = `${workoutName} ${folderName ?? ''}`.toLowerCase();

  if (text.includes('push') || (text.includes('chest') && text.includes('tricep'))) {
    return 'PUSH';
  }
  if (text.includes('pull') || (text.includes('back') && text.includes('bicep'))) {
    return 'PULL';
  }
  if (
    text.includes('leg') ||
    text.includes('bein') ||
    text.includes('quad') ||
    text.includes('lower')
  ) {
    return 'LEGS';
  }
  if (text.includes('arm') || text.includes('bicep') || text.includes('tricep')) {
    return 'ARMS';
  }
  if (text.includes('shoulder') || text.includes('schulter') || text.includes('delt')) {
    return 'SHOULDERS';
  }

  const muscleSet = new Set(musclesInWorkout);
  const hasPush =
    muscleSet.has(MuscleGroup.CHEST) &&
    (muscleSet.has(MuscleGroup.TRICEPS) || muscleSet.has(MuscleGroup.SHOULDERS));
  const hasPull = muscleSet.has(MuscleGroup.BACK) && muscleSet.has(MuscleGroup.BICEPS);
  const hasLegs =
    muscleSet.has(MuscleGroup.QUADRICEPS) ||
    muscleSet.has(MuscleGroup.HAMSTRINGS) ||
    muscleSet.has(MuscleGroup.GLUTES);

  if (hasPush && !hasPull && !hasLegs) return 'PUSH';
  if (hasPull && !hasPush && !hasLegs) return 'PULL';
  if (hasLegs && !hasPush && !hasPull) return 'LEGS';
  if (
    (muscleSet.has(MuscleGroup.BICEPS) || muscleSet.has(MuscleGroup.TRICEPS)) &&
    !hasLegs &&
    !muscleSet.has(MuscleGroup.CHEST) &&
    !muscleSet.has(MuscleGroup.BACK)
  ) {
    return 'ARMS';
  }
  if (hasPush && hasPull && !hasLegs) return 'UPPER';
  return 'FULL_BODY';
}

/**
 * Proposes at most ONE smart exercise suggestion for a workout (template preview,
 * template builder, or live active session) based on split balance, progression slope
 * plateau, and RPE/effort fatigue.
 *
 * Example: In a Push workout where existing shoulder exercises have plateaued or feel
 * consistently hard (high RPE / DELOAD / flat slope), suggests a fresh shoulder exercise.
 */
export function computeWorkoutExerciseSuggestion(params: {
  workoutName: string;
  folderName?: string | null;
  exercises: WorkoutSuggestionInputExercise[];
  catalog: ExerciseDto[];
  historySessions: WorkoutSessionDto[];
  weightUnit?: WeightUnit;
}): WorkoutExerciseSuggestion | null {
  const {
    workoutName,
    folderName = null,
    exercises,
    catalog,
    historySessions,
    weightUnit = WeightUnit.KG,
  } = params;

  const strengthCatalog = catalog.filter((c) => c.exerciseType === ExerciseType.STRENGTH);
  if (strengthCatalog.length === 0) return null;

  const existingIds = new Set<string>();
  const existingNames = new Set<string>();
  const resolvedExercises: Array<{
    input: WorkoutSuggestionInputExercise;
    catalogEx: ExerciseDto | null;
    muscle: MuscleGroup;
  }> = [];

  for (const ex of exercises) {
    const catEx =
      (ex.exerciseId ? catalog.find((c) => c.id === ex.exerciseId) : null) ??
      (ex.exerciseName
        ? catalog.find((c) => c.name.trim().toLowerCase() === ex.exerciseName!.trim().toLowerCase())
        : null) ??
      null;

    if (ex.exerciseId) existingIds.add(ex.exerciseId);
    if (catEx) {
      existingIds.add(catEx.id);
      existingNames.add(catEx.name.trim().toLowerCase());
    }
    if (ex.exerciseName) {
      existingNames.add(ex.exerciseName.trim().toLowerCase());
    }

    const muscle = ex.primaryMuscleGroup ?? catEx?.primaryMuscleGroup ?? MuscleGroup.CHEST;
    resolvedExercises.push({ input: ex, catalogEx: catEx, muscle });
  }

  const splitArchetype = inferWorkoutSplitArchetype(
    workoutName,
    folderName,
    resolvedExercises.map((r) => r.muscle),
  );
  const splitMuscles = SPLIT_MUSCLE_PRIORITY[splitArchetype];

  // Evaluate progression & fatigue across exercises currently in the workout
  let worstStalling: {
    exerciseId: string | null;
    exerciseName: string;
    muscle: MuscleGroup;
    equipment: EquipmentType | null;
    reasonType: ExerciseSuggestionReasonType;
    severityScore: number;
  } | null = null;

  for (const item of resolvedExercises) {
    const exId = item.input.exerciseId ?? item.catalogEx?.id ?? null;
    const exName = item.input.exerciseName ?? item.catalogEx?.name ?? null;
    if (!exId && !exName) continue;

    const insight = computeExerciseProgression({
      exerciseId: exId,
      exerciseName: exName,
      historySessions,
      catalogExercise: item.catalogEx,
      plannedSets: item.input.plannedSets ?? 3,
      targetRepsMin: item.input.targetRepsMin ?? 8,
      targetRepsMax: item.input.targetRepsMax ?? 12,
      targetWeight: item.input.targetWeight ?? null,
      weightUnit,
    });

    if (insight.sessionsCount === 0 || !insight.lastSession) continue;

    const avgRpe = insight.lastSession.avgRpe ?? 8;
    const isHighFatigue = avgRpe >= 9.0 || insight.phase === 'DELOAD';
    const isPlateau =
      insight.sessionsCount >= 2 &&
      (insight.slopePerSession <= 0.15 || insight.phase === 'MAINTAIN');

    if (!isHighFatigue && !isPlateau) continue;

    // Give a bonus to accessory/key split muscles (e.g. SHOULDERS in PUSH) when tied
    const splitBonus = item.muscle === splitMuscles[0] ? 1.5 : 0;
    const severityScore =
      (insight.phase === 'DELOAD' ? 4 : 0) +
      (avgRpe >= 9.0 ? 3 : avgRpe >= 8.5 ? 1.5 : 0) +
      (isPlateau ? 2.5 - Math.max(-1, Math.min(1, insight.slopePerSession)) : 0) +
      splitBonus;

    if (!worstStalling || severityScore > worstStalling.severityScore) {
      worstStalling = {
        exerciseId: exId,
        exerciseName: exName ?? item.catalogEx?.name ?? 'Exercise',
        muscle: item.muscle,
        equipment: item.catalogEx?.equipment ?? null,
        reasonType: isHighFatigue ? 'HIGH_FATIGUE' : 'PLATEAU',
        severityScore,
      };
    }
  }

  // Determine target muscle group
  let targetMuscle: MuscleGroup;
  let reasonType: ExerciseSuggestionReasonType = 'SPLIT_BALANCE';
  let stallingExerciseId: string | null = null;
  let stallingExerciseName: string | null = null;
  let avoidEquipment: EquipmentType | null = null;

  if (worstStalling) {
    targetMuscle = worstStalling.muscle;
    reasonType = worstStalling.reasonType;
    stallingExerciseId = worstStalling.exerciseId;
    stallingExerciseName = worstStalling.exerciseName;
    avoidEquipment = worstStalling.equipment;
  } else {
    // Find the muscle in the split archetype with the fewest planned sets in this workout
    const setsByMuscle = new Map<MuscleGroup, number>();
    for (const m of splitMuscles) {
      setsByMuscle.set(m, 0);
    }
    for (const r of resolvedExercises) {
      setsByMuscle.set(r.muscle, (setsByMuscle.get(r.muscle) ?? 0) + (r.input.plannedSets ?? 3));
    }

    let minSets = Number.POSITIVE_INFINITY;
    let chosenMuscle = splitMuscles[0] ?? MuscleGroup.SHOULDERS;
    for (const m of splitMuscles) {
      const count = setsByMuscle.get(m) ?? 0;
      if (count < minSets) {
        minSets = count;
        chosenMuscle = m;
      }
    }
    targetMuscle = chosenMuscle;

    // If there is already an exercise of this muscle in the workout, reference it for context
    const existingForMuscle = resolvedExercises.find((r) => r.muscle === targetMuscle);
    if (existingForMuscle) {
      stallingExerciseId =
        existingForMuscle.input.exerciseId ?? existingForMuscle.catalogEx?.id ?? null;
      stallingExerciseName =
        existingForMuscle.input.exerciseName ?? existingForMuscle.catalogEx?.name ?? null;
      avoidEquipment = existingForMuscle.catalogEx?.equipment ?? null;
    }
  }

  // Pick the best candidate from the catalog not already in the workout
  const candidates = strengthCatalog.filter(
    (c) =>
      !existingIds.has(c.id) &&
      !existingNames.has(c.name.trim().toLowerCase()) &&
      c.primaryMuscleGroup === targetMuscle,
  );

  const fallbackCandidates =
    candidates.length > 0
      ? candidates
      : strengthCatalog.filter(
          (c) =>
            !existingIds.has(c.id) &&
            !existingNames.has(c.name.trim().toLowerCase()) &&
            splitMuscles.includes(c.primaryMuscleGroup),
        );

  const pool =
    fallbackCandidates.length > 0
      ? fallbackCandidates
      : strengthCatalog.filter((c) => !existingIds.has(c.id));

  if (pool.length === 0) return null;

  // Score candidates: prefer predefined alternatives of stalling exercise, or fresh equipment (Cable/Dumbbell/Machine)
  const stallingCatalogEx = stallingExerciseId
    ? catalog.find((c) => c.id === stallingExerciseId)
    : null;
  const preferredAltIds = new Set(stallingCatalogEx?.alternativeExerciseIds ?? []);

  const scored = pool.map((candidate) => {
    let score = 0;
    if (preferredAltIds.has(candidate.id)) score += 5;
    if (avoidEquipment && candidate.equipment !== avoidEquipment) score += 3;
    if (
      candidate.equipment === EquipmentType.CABLE ||
      candidate.equipment === EquipmentType.DUMBBELL ||
      candidate.equipment === EquipmentType.MACHINE
    ) {
      score += 2;
    }
    return { candidate, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const chosen = scored[0]!.candidate;

  // Compute recommended starting prescription from global history or sensible defaults
  const chosenInsight = computeExerciseProgression({
    exerciseId: chosen.id,
    exerciseName: chosen.name,
    historySessions,
    catalogExercise: chosen,
    plannedSets: 3,
    targetRepsMin: 10,
    targetRepsMax: 14,
    weightUnit,
  });

  const firstSuggestion = chosenInsight.setSuggestions[0];
  const defaultWeight =
    firstSuggestion?.suggestedWeight ??
    (chosen.primaryMuscleGroup === MuscleGroup.SHOULDERS ||
    chosen.primaryMuscleGroup === MuscleGroup.BICEPS ||
    chosen.primaryMuscleGroup === MuscleGroup.TRICEPS
      ? weightUnit === WeightUnit.LBS
        ? 25
        : 12.5
      : weightUnit === WeightUnit.LBS
        ? 95
        : 40);

  return {
    suggestedExercise: chosen,
    targetMuscle: chosen.primaryMuscleGroup,
    splitArchetype,
    reasonType,
    stallingExerciseId,
    stallingExerciseName,
    recommendedSets: 3,
    recommendedRepsMin: chosen.category === ExerciseCategory.COMPOUND ? 8 : 10,
    recommendedRepsMax: chosen.category === ExerciseCategory.COMPOUND ? 12 : 15,
    recommendedWeight: defaultWeight,
    recommendedRestSeconds: chosen.category === ExerciseCategory.COMPOUND ? 90 : 60,
  };
}
