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
const DAY_MS = 24 * 60 * 60 * 1000;

/** RPE logged by the 3-bar "Max" effort level — nothing left in the tank. */
export const MAX_EFFORT_RPE = 9.5;

/**
 * Stall detection thresholds. Mirrored 1:1 in the Swift `ProgressionEngine` —
 * keep both in sync.
 */
export const SUGGESTION_THRESHOLDS = {
  /** Sessions compared for grinding / regression. */
  recentWindow: 3,
  /** Max-effort sessions within the recent window that count as grinding. */
  grindingMinHardSessions: 2,
  /** Estimated 1RM gain (%) across the window below which max effort is "no gain". */
  grindingMaxGainPct: 1,
  /** Estimated 1RM drop (%) across the window that counts as a regression. */
  regressionDropPct: 4,
  plateauMinSessions: 4,
  plateauMinWeeks: 3,
  plateauMinSessionsSinceBest: 3,
  /** A key split muscle with fewer than this share of the busiest muscle's sets is low volume. */
  lowVolumeRatio: 0.5,
} as const;

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

export interface ExerciseTrend {
  sessionsCount: number;
  /** Weeks between the first and last logged session. */
  spanWeeks: number;
  /** Sessions logged after the one that set the current best estimated 1RM. */
  sessionsSinceBest: number;
  /** Whole weeks between the best session and the last session. */
  weeksSinceBest: number;
  /** Sessions in the recent window logged at max effort. */
  hardSessionsRecent: number;
  recentWindow: number;
  /** Estimated 1RM change (%) from the start to the end of the recent window. */
  changePct: number;
}

/**
 * Summarizes whether an exercise is still moving: a single max-effort session is
 * normal training, a stall is max effort or time passing without results.
 */
export function analyzeExerciseTrend(history: ExerciseHistorySessionEntry[]): ExerciseTrend {
  const n = history.length;
  if (n === 0) {
    return {
      sessionsCount: 0,
      spanWeeks: 0,
      sessionsSinceBest: 0,
      weeksSinceBest: 0,
      hardSessionsRecent: 0,
      recentWindow: 0,
      changePct: 0,
    };
  }

  let bestIndex = 0;
  for (let i = 1; i < n; i++) {
    if (history[i]!.bestEstimated1RM > history[bestIndex]!.bestEstimated1RM) bestIndex = i;
  }

  const first = history[0]!;
  const last = history[n - 1]!;
  const weeksBetween = (from: string, to: string) =>
    (Date.parse(to) - Date.parse(from)) / (7 * DAY_MS);

  const recent = history.slice(-SUGGESTION_THRESHOLDS.recentWindow);
  const windowStart = recent[0]!.bestEstimated1RM;
  const changePct =
    recent.length >= 2 && windowStart > 0
      ? Math.round(((last.bestEstimated1RM - windowStart) / windowStart) * 1000) / 10
      : 0;

  return {
    sessionsCount: n,
    spanWeeks: weeksBetween(first.startedAt, last.startedAt),
    sessionsSinceBest: n - 1 - bestIndex,
    weeksSinceBest: Math.floor(weeksBetween(history[bestIndex]!.startedAt, last.startedAt)),
    hardSessionsRecent: recent.filter((e) => (e.avgRpe ?? 0) >= MAX_EFFORT_RPE).length,
    recentWindow: recent.length,
    changePct,
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
  const maxEffortLast = (lastSession.avgRpe ?? 8) >= MAX_EFFORT_RPE;
  const consecutiveRegression =
    prevSession !== null &&
    lastSession.bestEstimated1RM < prevSession.bestEstimated1RM * 0.96 &&
    (majoritySetsBelowMin || maxEffortLast);

  // Max effort is a normal training outcome: topping out the rep band still earns
  // more weight, and only a max effort below the top holds the prescription.
  let overallPhase: ProgressionPhase;
  if (consecutiveRegression || (majoritySetsBelowMin && maxEffortLast)) {
    overallPhase = 'DELOAD';
  } else if (allSetsHitTopOfBand && primaryLastWeight > 0) {
    overallPhase = 'INCREASE_WEIGHT';
  } else if (maxEffortLast && !majoritySetsBelowMin) {
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
    } else if (lastR >= repMax && lastW > 0) {
      // Individual set topped out rep range even if later sets didn't -> suggest micro weight bump
      suggestedWeight = roundToGymStep(lastW + stepIncrement, 0.5);
      suggestedReps = repMin;
      setPhase = 'INCREASE_WEIGHT';
    } else if (overallPhase === 'INCREASE_REPS') {
      if (lastR < repMax && (lastRpe ?? 8) <= 9) {
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

export type ExerciseSuggestionReasonType =
  'PLATEAU' | 'GRINDING' | 'REGRESSION' | 'MISSING_MUSCLE' | 'LOW_VOLUME';

/** Numbers behind a suggestion, formatted by the UI into a short evidence chip. */
export interface WorkoutSuggestionEvidence {
  sessionsSinceBest: number;
  weeksSinceBest: number;
  hardSessionsRecent: number;
  recentWindow: number;
  changePct: number;
  setsForMuscle: number;
  setsTotal: number;
}

export interface WorkoutExerciseSuggestion {
  suggestedExercise: ExerciseDto;
  targetMuscle: MuscleGroup;
  splitArchetype: WorkoutSplitArchetype;
  reasonType: ExerciseSuggestionReasonType;
  /** Only set for stall reasons (PLATEAU / GRINDING / REGRESSION). */
  stallingExerciseId: string | null;
  stallingExerciseName: string | null;
  evidence: WorkoutSuggestionEvidence;
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
 * Classifies an exercise trend as a stall, or `null` when it is still progressing.
 * Priority: REGRESSION > GRINDING > PLATEAU.
 */
export function classifyExerciseStall(
  trend: ExerciseTrend,
): 'PLATEAU' | 'GRINDING' | 'REGRESSION' | null {
  const T = SUGGESTION_THRESHOLDS;
  const fullWindow = trend.recentWindow >= T.recentWindow;
  if (fullWindow && trend.changePct <= -T.regressionDropPct) return 'REGRESSION';
  if (
    fullWindow &&
    trend.hardSessionsRecent >= T.grindingMinHardSessions &&
    trend.changePct < T.grindingMaxGainPct
  ) {
    return 'GRINDING';
  }
  if (
    trend.sessionsCount >= T.plateauMinSessions &&
    trend.spanWeeks >= T.plateauMinWeeks &&
    trend.sessionsSinceBest >= T.plateauMinSessionsSinceBest
  ) {
    return 'PLATEAU';
  }
  return null;
}

const STALL_BASE_SEVERITY = { REGRESSION: 100, GRINDING: 50, PLATEAU: 10 } as const;

export interface DismissedWorkoutSuggestion {
  reasonKey: string;
  exerciseId: string;
}

/** Identifies *why* a suggestion was made (stalling exercise or target muscle), independent of the exercise. */
export function workoutSuggestionReasonKey(s: {
  reasonType: ExerciseSuggestionReasonType;
  stallingExerciseId: string | null;
  targetMuscle: MuscleGroup;
}): string {
  return s.stallingExerciseId
    ? `${s.reasonType}:${s.stallingExerciseId}`
    : `${s.reasonType}:${s.targetMuscle}`;
}

/** What to remember when the user dismisses a suggestion. */
export function toDismissedSuggestion(s: WorkoutExerciseSuggestion): DismissedWorkoutSuggestion {
  return { reasonKey: workoutSuggestionReasonKey(s), exerciseId: s.suggestedExercise.id };
}

/**
 * Proposes at most ONE smart exercise suggestion for a workout (template preview,
 * template builder, or live active session), and only when there is a concrete reason:
 * an exercise that regressed, grinds at max effort without gains, or plateaued for weeks,
 * or a key split muscle that is missing or under-trained. Returns `null` otherwise.
 */
export function computeWorkoutExerciseSuggestion(params: {
  workoutName: string;
  folderName?: string | null;
  exercises: WorkoutSuggestionInputExercise[];
  catalog: ExerciseDto[];
  historySessions: WorkoutSessionDto[];
  weightUnit?: WeightUnit;
  /** Suggestions the user dismissed during this workout: their reason and exercise are skipped. */
  dismissed?: DismissedWorkoutSuggestion[];
}): WorkoutExerciseSuggestion | null {
  const {
    workoutName,
    folderName = null,
    exercises,
    catalog,
    historySessions,
    weightUnit = WeightUnit.KG,
    dismissed = [],
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

  const setsByMuscle = new Map<MuscleGroup, number>();
  for (const m of splitMuscles) setsByMuscle.set(m, 0);
  for (const r of resolvedExercises) {
    setsByMuscle.set(r.muscle, (setsByMuscle.get(r.muscle) ?? 0) + (r.input.plannedSets ?? 3));
  }
  const setsTotal = resolvedExercises.reduce((sum, r) => sum + (r.input.plannedSets ?? 3), 0);

  // Every honest reason, strongest first: stalls by severity, then missing / under-trained muscles.
  interface ReasonCandidate {
    reasonType: ExerciseSuggestionReasonType;
    targetMuscle: MuscleGroup;
    stallingExerciseId: string | null;
    stallingExerciseName: string | null;
    avoidEquipment: EquipmentType | null;
    trend: ExerciseTrend | null;
    severityScore: number;
  }
  const reasons: ReasonCandidate[] = [];

  for (const item of resolvedExercises) {
    const exId = item.input.exerciseId ?? item.catalogEx?.id ?? null;
    const exName = item.input.exerciseName ?? item.catalogEx?.name ?? null;
    if (!exId && !exName) continue;

    const trend = analyzeExerciseTrend(
      extractGlobalExerciseHistory(exId, exName, historySessions, weightUnit),
    );
    const stall = classifyExerciseStall(trend);
    if (!stall) continue;

    // Give a bonus to the key split muscle (e.g. SHOULDERS in PUSH) when tied
    const splitBonus = item.muscle === splitMuscles[0] ? 1.5 : 0;
    const detail =
      stall === 'REGRESSION'
        ? Math.min(20, -trend.changePct)
        : stall === 'GRINDING'
          ? trend.hardSessionsRecent * 5
          : Math.min(20, trend.sessionsSinceBest);
    reasons.push({
      reasonType: stall,
      targetMuscle: item.muscle,
      stallingExerciseId: exId,
      stallingExerciseName: exName ?? item.catalogEx?.name ?? 'Exercise',
      avoidEquipment: item.catalogEx?.equipment ?? null,
      trend,
      severityScore: STALL_BASE_SEVERITY[stall] + detail + splitBonus,
    });
  }
  reasons.sort((a, b) => b.severityScore - a.severityScore);

  // No stall needed: only suggest when a key split muscle is missing or clearly under-trained
  const maxSets = Math.max(0, ...splitMuscles.map((m) => setsByMuscle.get(m) ?? 0));
  const muscleReasons = splitMuscles
    .map((m, idx) => ({ muscle: m, count: setsByMuscle.get(m) ?? 0, idx }))
    .filter(({ count }) => count === 0 || count < maxSets * SUGGESTION_THRESHOLDS.lowVolumeRatio)
    .sort((a, b) => a.count - b.count || a.idx - b.idx);
  for (const { muscle, count } of muscleReasons) {
    reasons.push({
      reasonType: count === 0 ? 'MISSING_MUSCLE' : 'LOW_VOLUME',
      targetMuscle: muscle,
      stallingExerciseId: null,
      stallingExerciseName: null,
      avoidEquipment:
        resolvedExercises.find((r) => r.muscle === muscle)?.catalogEx?.equipment ?? null,
      trend: null,
      severityScore: 0,
    });
  }

  const dismissedReasons = new Set(dismissed.map((d) => d.reasonKey));
  const dismissedExercises = new Set(dismissed.map((d) => d.exerciseId));

  // Pick the first reason that is not dismissed and has a candidate not already in the workout.
  // No candidate means no honest suggestion, so the card stays hidden.
  let picked: { reason: ReasonCandidate; chosen: ExerciseDto } | null = null;
  for (const reason of reasons) {
    if (dismissedReasons.has(workoutSuggestionReasonKey(reason))) continue;
    const pool = strengthCatalog.filter(
      (c) =>
        !existingIds.has(c.id) &&
        !dismissedExercises.has(c.id) &&
        !existingNames.has(c.name.trim().toLowerCase()) &&
        c.primaryMuscleGroup === reason.targetMuscle,
    );
    if (pool.length === 0) continue;

    // Score candidates: prefer predefined alternatives of stalling exercise, or fresh equipment (Cable/Dumbbell/Machine)
    const stallingCatalogEx = reason.stallingExerciseId
      ? catalog.find((c) => c.id === reason.stallingExerciseId)
      : null;
    const preferredAltIds = new Set(stallingCatalogEx?.alternativeExerciseIds ?? []);
    const scored = pool.map((candidate) => {
      let score = 0;
      if (preferredAltIds.has(candidate.id)) score += 5;
      if (reason.avoidEquipment && candidate.equipment !== reason.avoidEquipment) score += 3;
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
    picked = { reason, chosen: scored[0]!.candidate };
    break;
  }

  if (!picked) return null;
  const { chosen } = picked;
  const { reasonType, targetMuscle, stallingExerciseId, stallingExerciseName, trend } =
    picked.reason;

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
    evidence: {
      sessionsSinceBest: trend?.sessionsSinceBest ?? 0,
      weeksSinceBest: trend?.weeksSinceBest ?? 0,
      hardSessionsRecent: trend?.hardSessionsRecent ?? 0,
      recentWindow: trend?.recentWindow ?? 0,
      changePct: trend?.changePct ?? 0,
      setsForMuscle: setsByMuscle.get(targetMuscle) ?? 0,
      setsTotal,
    },
    recommendedSets: 3,
    recommendedRepsMin: chosen.category === ExerciseCategory.COMPOUND ? 8 : 10,
    recommendedRepsMax: chosen.category === ExerciseCategory.COMPOUND ? 12 : 15,
    recommendedWeight: defaultWeight,
    recommendedRestSeconds: chosen.category === ExerciseCategory.COMPOUND ? 90 : 60,
  };
}
