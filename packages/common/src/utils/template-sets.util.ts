import { SessionExerciseOrigin, SessionStatus, SetType } from '../enums';
import type {
  TemplateExerciseInputDto,
  TemplateSetDto,
  WorkoutSessionDto,
  WorkoutTemplateDto,
  WorkoutTemplateExerciseDto,
} from '../schemas';

const DEFAULT_REST_SECONDS = 90;

interface TemplateExerciseLike {
  plannedSets: number;
  warmupSets?: number | null;
  targetRepsMin?: number | null;
  targetWeight?: number | null;
  targetDurationSeconds?: number | null;
  sets?: TemplateSetDto[] | null;
}

/** Warm-ups default to 60 % of the working weight, rounded to the nearest 0.5. */
function warmupWeight(targetWeight: number | null | undefined): number {
  return targetWeight ? Math.round(targetWeight * 0.6 * 2) / 2 : 20;
}

/**
 * The per-set plan of a template exercise. Templates saved before per-set plans existed only
 * have summary values; those are expanded into warm-up + working sets.
 */
export function resolveTemplateSets(te: TemplateExerciseLike): TemplateSetDto[] {
  if (te.sets && te.sets.length > 0) return te.sets;
  const reps = te.targetRepsMin ?? 10;
  return [
    ...Array.from({ length: te.warmupSets ?? 0 }, () => ({
      setType: SetType.WARMUP,
      weight: warmupWeight(te.targetWeight),
      reps,
      durationSeconds: null,
    })),
    ...Array.from({ length: Math.max(1, te.plannedSets) }, () => ({
      setType: SetType.WORKING,
      weight: te.targetWeight ?? null,
      reps,
      durationSeconds: te.targetDurationSeconds ?? null,
    })),
  ];
}

/** Summary fields kept for older clients (watch, older app builds) and list previews. */
export function summarizeTemplateSets(sets: TemplateSetDto[]): {
  plannedSets: number;
  warmupSets: number;
  targetWeight: number | null;
} {
  const warmups = sets.filter((s) => s.setType === SetType.WARMUP).length;
  const workingWeights = sets
    .filter((s) => s.setType === SetType.WORKING && s.weight !== null)
    .map((s) => s.weight as number);
  return {
    plannedSets: Math.min(30, Math.max(1, sets.length - warmups)),
    warmupSets: Math.min(10, warmups),
    targetWeight: workingWeights.length > 0 ? Math.max(...workingWeights) : null,
  };
}

/** Moves warm-up sets in front of the others while keeping their relative order. */
export function orderWarmupsFirst<T extends { setType: SetType }>(sets: T[]): T[] {
  return [
    ...sets.filter((s) => s.setType === SetType.WARMUP),
    ...sets.filter((s) => s.setType !== SetType.WARMUP),
  ];
}

export function templateExerciseToInput(
  te: WorkoutTemplateExerciseDto,
  orderIndex = te.orderIndex,
): TemplateExerciseInputDto {
  return {
    id: te.id,
    exerciseId: te.exerciseId,
    sets: te.sets ?? null,
    orderIndex,
    plannedSets: te.plannedSets,
    warmupSets: te.warmupSets,
    targetRepsMin: te.targetRepsMin,
    targetRepsMax: te.targetRepsMax,
    targetWeight: te.targetWeight,
    weightUnit: te.weightUnit,
    restSeconds: te.restSeconds,
    targetDurationSeconds: te.targetDurationSeconds,
    targetDistanceMeters: te.targetDistanceMeters,
    notes: te.notes ?? null,
    alternativeExerciseIds: te.alternativeExerciseIds ?? [],
  };
}

function comparable(ex: TemplateExerciseInputDto) {
  return {
    exerciseId: ex.exerciseId,
    sets: resolveTemplateSets(ex).map((s) => [s.setType, s.weight, s.reps, s.durationSeconds]),
    restSeconds: ex.restSeconds,
    alternatives: ex.alternativeExerciseIds ?? [],
  };
}

/**
 * Turns a finished workout into the next version of its template, so the next session starts
 * from what was actually done:
 * - sets (count, type, order, weight, reps) are copied, warm-ups first;
 * - added exercises are inserted where they were done, removed ones are dropped;
 * - skipped exercises keep their previous plan;
 * - a swapped exercise replaces the original, which becomes an alternative.
 * Returns `null` when the session does not belong to the template or nothing changed.
 */
export function buildTemplateExercisesFromSession(
  template: WorkoutTemplateDto,
  session: WorkoutSessionDto,
): TemplateExerciseInputDto[] | null {
  if (session.templateId !== template.id || session.status !== SessionStatus.COMPLETED) {
    return null;
  }

  const used = new Set<string>();
  const takeOriginal = (exerciseId: string | null | undefined) => {
    if (!exerciseId) return null;
    const found = template.exercises.find((te) => !used.has(te.id) && te.exerciseId === exerciseId);
    if (found) used.add(found.id);
    return found ?? null;
  };

  const next: TemplateExerciseInputDto[] = [];
  for (const ex of session.exercises) {
    if (!ex.exerciseId) continue;
    const substituted = ex.origin === SessionExerciseOrigin.SUBSTITUTED;
    const original =
      (substituted ? takeOriginal(ex.replacedExerciseId) : null) ?? takeOriginal(ex.exerciseId);
    const didAnySet = ex.sets.some((s) => s.completed);

    if (!didAnySet && !substituted) {
      // Skipped: keep the old plan. Exercises added during the workout but never done are dropped.
      if (original) next.push(templateExerciseToInput(original, next.length));
      continue;
    }
    if (ex.sets.length === 0) continue;

    const sets = orderWarmupsFirst(
      ex.sets.map((s) => ({
        setType: s.setType,
        weight: s.weight ?? null,
        reps: s.reps ?? null,
        durationSeconds: s.durationSeconds ?? null,
      })),
    );
    const baseAlternatives = original?.alternativeExerciseIds ?? ex.alternativeExerciseIds ?? [];
    const alternatives = Array.from(
      new Set(
        substituted && ex.replacedExerciseId
          ? [ex.replacedExerciseId, ...baseAlternatives]
          : baseAlternatives,
      ),
    ).filter((id) => id !== ex.exerciseId);

    next.push({
      id: original?.id,
      exerciseId: ex.exerciseId,
      sets,
      orderIndex: next.length,
      ...summarizeTemplateSets(sets),
      targetRepsMin: original?.targetRepsMin ?? ex.targetRepsMin ?? null,
      targetRepsMax: original?.targetRepsMax ?? ex.targetRepsMax ?? null,
      weightUnit: original?.weightUnit ?? session.weightUnit,
      restSeconds: ex.restSeconds,
      targetDurationSeconds: original?.targetDurationSeconds ?? ex.targetDurationSeconds ?? null,
      targetDistanceMeters: original?.targetDistanceMeters ?? null,
      notes: original?.notes ?? ex.notes ?? null,
      alternativeExerciseIds: alternatives,
    });
  }

  // A superset link (rest 0) cannot point past the last exercise.
  const last = next[next.length - 1];
  if (last && last.restSeconds === 0) last.restSeconds = DEFAULT_REST_SECONDS;

  const current = template.exercises
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((te) => templateExerciseToInput(te));
  const unchanged =
    JSON.stringify(current.map(comparable)) === JSON.stringify(next.map(comparable));
  return unchanged ? null : next;
}
