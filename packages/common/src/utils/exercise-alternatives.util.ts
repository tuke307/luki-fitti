import { ExerciseType, MovementPattern } from '../enums';
import type { ExerciseDto, WorkoutSessionDto } from '../schemas';

/** Why an exercise was ranked as an alternative; the client turns these into a short label. */
export type AlternativeReason =
  | 'YOUR_ALTERNATIVE'
  | 'SAME_MOVEMENT'
  | 'SIMILAR_MOVEMENT'
  | 'SAME_MUSCLES'
  | 'SAME_SIDE'
  | 'DONE_BEFORE'
  | 'DIFFERENT_EQUIPMENT';

export interface RankedAlternative {
  exercise: ExerciseDto;
  score: number;
  /** Strongest first. */
  reasons: AlternativeReason[];
}

export interface RankAlternativesOptions {
  /** Completed sessions; exercises with a completed set count as "done before". */
  historySessions?: WorkoutSessionDto[];
  /** Exercises never to return, e.g. the ones already in the session. */
  excludeIds?: Iterable<string>;
  /** The user's own alternatives of the target: always eligible and ranked first. */
  preferredIds?: Iterable<string>;
  /** Everyday exercises (e.g. the core catalog), ranked above obscure variants on a tie. */
  popularIds?: Iterable<string>;
  limit?: number;
}

const P = MovementPattern;

/**
 * Patterns that are a weaker but honest replacement for each other. Everything else must match
 * exactly: a straight-arm pulldown is never replaced by a row or a lat pulldown.
 */
const COMPATIBLE_PATTERNS: ReadonlyArray<readonly [MovementPattern, MovementPattern]> = [
  [P.HORIZONTAL_PUSH, P.INCLINE_PUSH],
  [P.HORIZONTAL_PUSH, P.DIP],
  [P.SQUAT, P.LUNGE],
  [P.HIP_THRUST, P.HIP_EXTENSION],
  [P.HINGE, P.BACK_EXTENSION],
  [P.LATERAL_RAISE, P.UPRIGHT_ROW],
  [P.ROTATION, P.LATERAL_FLEXION],
  [P.CORE_FLEXION, P.HIP_FLEXION],
];

export function areMovementPatternsCompatible(a: MovementPattern, b: MovementPattern): boolean {
  return COMPATIBLE_PATTERNS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** Score weights, highest first. Kept in sync with `ExerciseAlternatives.swift`. */
export const ALTERNATIVE_WEIGHTS = {
  preferred: 40,
  sameMovement: 30,
  similarMovement: 12,
  /** Multiplied by the Jaccard overlap of the target regions (0…1). */
  regionOverlap: 20,
  /** Multiplied by the Jaccard overlap of the slug words, so close variants come first. */
  nameOverlap: 10,
  sameSide: 8,
  doneBefore: 6,
  sameMechanic: 4,
  sameMuscle: 4,
  popular: 4,
  differentEquipment: 2,
} as const;

/** Overlap at which the reason list says "same muscles". */
const SAME_MUSCLES_OVERLAP = 0.5;

/** Ids of exercises the user logged at least one completed set of. */
export function loggedExerciseIds(historySessions: WorkoutSessionDto[]): Set<string> {
  const ids = new Set<string>();
  for (const session of historySessions) {
    for (const ex of session.exercises) {
      if (ex.exerciseId && ex.sets.some((s) => s.completed)) ids.add(ex.exerciseId);
    }
  }
  return ids;
}

/** Words of a slug; slugs are English and the same in every language. */
export function alternativeSlugWords(slug: string): string[] {
  return slug.split('-').filter((w) => w.length > 0 && !SLUG_STOP_WORDS.has(w));
}

const SLUG_STOP_WORDS = new Set(['a', 'an', 'and', 'the', 'to', 'on', 'of', 'with', 'in', 'or']);

function jaccard(a: readonly string[], b: readonly string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let shared = 0;
  for (const r of setA) if (setB.has(r)) shared++;
  return shared / (setA.size + setB.size - shared);
}

/**
 * Ranks replacements for `target` by how closely they match its movement: same (or compatible)
 * movement pattern first, then the regions trained, one or both sides, compound vs isolation,
 * what the user has done before, and a small bonus for different equipment. Exercises without a
 * known movement pattern are left out (they stay reachable through search), except the user's own
 * alternatives. Ported 1:1 to iOS as `ExerciseAlternatives.swift`.
 */
export function rankAlternatives(
  target: ExerciseDto,
  catalog: ExerciseDto[],
  options: RankAlternativesOptions = {},
): RankedAlternative[] {
  const W = ALTERNATIVE_WEIGHTS;
  const exclude = new Set(options.excludeIds ?? []);
  exclude.add(target.id);
  const userPreferred = new Set(options.preferredIds ?? []);
  const preferred = new Set([...target.alternativeExerciseIds, ...userPreferred]);
  const done = loggedExerciseIds(options.historySessions ?? []);
  const popular = new Set(options.popularIds ?? []);
  const targetPattern = target.movementPattern ?? null;
  const targetRegions = target.targetRegions ?? [];
  const targetWords = alternativeSlugWords(target.slug);

  const ranked: Array<RankedAlternative & { index: number }> = [];
  catalog.forEach((candidate, index) => {
    if (exclude.has(candidate.id) || candidate.exerciseType === ExerciseType.STRETCHING) return;
    const pattern = candidate.movementPattern ?? null;
    const samePattern = targetPattern !== null && pattern === targetPattern;
    const similarPattern =
      !samePattern &&
      targetPattern !== null &&
      pattern !== null &&
      areMovementPatternsCompatible(targetPattern, pattern);
    if (!samePattern && !similarPattern && !userPreferred.has(candidate.id)) return;

    const reasons: AlternativeReason[] = [];
    let score = 0;
    if (preferred.has(candidate.id)) {
      score += W.preferred;
      reasons.push('YOUR_ALTERNATIVE');
    }
    if (samePattern) {
      score += W.sameMovement;
      reasons.push('SAME_MOVEMENT');
    } else if (similarPattern) {
      score += W.similarMovement;
      reasons.push('SIMILAR_MOVEMENT');
    }
    const overlap = jaccard(targetRegions, candidate.targetRegions ?? []);
    score += overlap * W.regionOverlap;
    if (overlap >= SAME_MUSCLES_OVERLAP) reasons.push('SAME_MUSCLES');
    score += jaccard(targetWords, alternativeSlugWords(candidate.slug)) * W.nameOverlap;
    if (target.laterality && candidate.laterality === target.laterality) {
      score += W.sameSide;
      reasons.push('SAME_SIDE');
    }
    if (done.has(candidate.id)) {
      score += W.doneBefore;
      reasons.push('DONE_BEFORE');
    }
    if (target.mechanic && candidate.mechanic === target.mechanic) score += W.sameMechanic;
    if (candidate.primaryMuscleGroup === target.primaryMuscleGroup) score += W.sameMuscle;
    if (popular.has(candidate.id)) score += W.popular;
    if (candidate.equipment !== target.equipment) {
      score += W.differentEquipment;
      reasons.push('DIFFERENT_EQUIPMENT');
    }
    ranked.push({ exercise: candidate, score, reasons, index });
  });

  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  const limited = options.limit !== undefined ? ranked.slice(0, options.limit) : ranked;
  return limited.map(({ exercise, score, reasons }) => ({ exercise, score, reasons }));
}
