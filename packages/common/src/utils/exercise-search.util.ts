import type { ExerciseDto } from '../schemas';
import {
  EXERCISE_SEARCH_EQUIPMENT,
  EXERCISE_SEARCH_PHRASES,
  EXERCISE_SEARCH_SYNONYMS,
} from './exercise-search.vocab';

/**
 * Forgiving, ranked exercise search shared by web, API and (ported 1:1) iOS:
 *  - spacing/hyphens/plurals don't matter ("situp" finds "Sit-Ups"),
 *  - umlauts may be typed with or without `e` ("bankdrucken", "bankdruecken"),
 *  - German, English, slang and abbreviations are interchangeable ("Liegestütz" ↔ "push-up",
 *    "KH" ↔ "Kurzhantel" ↔ "dumbbell", "OHP", "RDL"),
 *  - small typos are tolerated ("bizepcurl", "kniebuege"),
 *  - results are ranked: name matches before tag/alias matches before muscle/equipment labels.
 * Short words (< 4 letters) only match whole words or word starts, so "rdl" never finds "hurdle".
 */

const PHRASES = EXERCISE_SEARCH_PHRASES.map(([pattern, replacement]) => ({
  pattern: new RegExp(pattern, 'g'),
  replacement,
}));

/** Lower case, umlauts and accents folded, punctuation (except hyphens) as spaces. */
export function foldSearchText(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä|ae/g, 'a')
    .replace(/ö|oe/g, 'o')
    .replace(/ü|ue/g, 'u')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function applyPhrases(folded: string): string {
  let text = folded;
  for (const { pattern, replacement } of PHRASES) text = text.replace(pattern, replacement);
  return text;
}

/** Light EN/DE stemming: "curls" → "curl", "kniebeugen" → "kniebeug", "presses" → "press". */
export function stemSearchToken(token: string): string {
  for (const suffix of ['en', 'es', 'er', 'e', 's', 'n']) {
    if (token.length - suffix.length < 4 || !token.endsWith(suffix)) continue;
    if (suffix === 's' && token.endsWith('ss')) continue;
    return token.slice(0, -suffix.length);
  }
  return token;
}

/**
 * Search tokens of a text: each word with its synonyms, as alternatives (a synonym may need
 * several tokens, e.g. "schrägbankdrücken" → incline + benchpress).
 */
export function searchTokenAlternatives(text: string): string[][][] {
  return applyPhrases(foldSearchText(text))
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((word) => [
      [stemSearchToken(word)],
      ...(EXERCISE_SEARCH_SYNONYMS[word]
        ? [EXERCISE_SEARCH_SYNONYMS[word].map(stemSearchToken)]
        : []),
    ]);
}

const EQUIPMENT_TOKENS = new Set(EXERCISE_SEARCH_EQUIPMENT.map(stemSearchToken));

function indexTokens(texts: string[]): Set<string> {
  return new Set(texts.flatMap((t) => searchTokenAlternatives(t).flat(2)));
}

function compact(text: string): string {
  return foldSearchText(text).replace(/[\s-]+/g, '');
}

/** Optimal string alignment distance, stopping early once it exceeds `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2]! + 1);
      }
      row.push(v);
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length]!;
}

/** How well one query token matches a set of indexed tokens (0–1). */
function tokenScore(query: string, tokens: Set<string>): number {
  if (tokens.has(query)) return 1;
  let best = 0;
  const maxTypos = query.length >= 8 ? 2 : query.length >= 4 ? 1 : 0;
  for (const token of tokens) {
    if (token.startsWith(query)) best = Math.max(best, 0.9);
    else if (query.length >= 4 && token.includes(query)) best = Math.max(best, 0.75);
    else if (maxTypos > 0 && best < 0.6 && editDistance(query, token, maxTypos) <= maxTypos) {
      best = 0.6;
    }
    if (best >= 0.9) break;
  }
  return best;
}

interface SearchField {
  tokens: Set<string>;
  compact: string[];
  weight: number;
}

export interface ExerciseSearchEntry {
  exercise: ExerciseDto;
  fields: SearchField[];
  names: string[];
  /** Per name: its words, each with its token alternatives (for ranking by name precision). */
  nameWords: string[][][][];
}

export interface ExerciseSearchIndex {
  entries: ExerciseSearchEntry[];
  boost?: (exercise: ExerciseDto) => number;
}

export interface ExerciseSearchOptions {
  /** Extra names of an exercise, e.g. its name in every language. */
  names?: (exercise: ExerciseDto) => string[];
  /** Muscle group / equipment labels in every language. */
  labels?: (exercise: ExerciseDto) => string[];
  /** Small ranking bonus (0–0.1), e.g. for exercises the user used recently. */
  boost?: (exercise: ExerciseDto) => number;
}

const FIELD_WEIGHT = { name: 1, tag: 0.85, label: 0.6 } as const;
const MIN_SCORE = 0.55;

export function buildExerciseSearchIndex(
  exercises: ExerciseDto[],
  options: ExerciseSearchOptions = {},
): ExerciseSearchIndex {
  return {
    boost: options.boost,
    entries: exercises.map((exercise) => {
      const names = Array.from(new Set([exercise.name, ...(options.names?.(exercise) ?? [])]));
      const labels = options.labels?.(exercise) ?? [];
      return {
        exercise,
        names,
        nameWords: names.map(searchTokenAlternatives),
        fields: [
          { tokens: indexTokens(names), compact: names.map(compact), weight: FIELD_WEIGHT.name },
          {
            tokens: indexTokens(exercise.tags),
            compact: exercise.tags.map(compact),
            weight: FIELD_WEIGHT.tag,
          },
          { tokens: indexTokens(labels), compact: [], weight: FIELD_WEIGHT.label },
        ],
      };
    }),
  };
}

export interface ExerciseSearchResult {
  exercise: ExerciseDto;
  score: number;
}

function scoreEntry(
  entry: ExerciseSearchEntry,
  query: string[][][],
  queryCompact: string,
  queryFolded: string,
  matchAllWords: boolean,
): number {
  let total = 0;
  let weights = 0;
  let unmatched = 0;
  for (const alternatives of query) {
    // Equipment words count double: "Kurzhantel" is what tells two presses apart.
    const weight = alternatives.some((tokens) => tokens.some((t) => EQUIPMENT_TOKENS.has(t)))
      ? 2
      : 1;
    let best = 0;
    for (const field of entry.fields) {
      for (const tokens of alternatives) {
        const score = Math.min(...tokens.map((t) => tokenScore(t, field.tokens)));
        best = Math.max(best, score * field.weight);
      }
    }
    if (best === 0) unmatched += weight;
    total += best * weight;
    weights += weight;
  }
  const enoughWords = matchAllWords ? unmatched === 0 : unmatched <= weights / 2;
  let score = enoughWords ? total / weights : 0;
  // "sit up" / "bizeps curl" against "Sit-Ups" / "Bizepscurls": compare without spaces.
  if (queryCompact.length >= 4) {
    for (const field of entry.fields) {
      if (field.compact.some((c) => c.includes(queryCompact))) {
        score = Math.max(score, 0.85 * field.weight);
      }
    }
  }
  if (score === 0) return 0;
  const folded = entry.names.map(foldSearchText);
  if (folded.includes(queryFolded)) score += 0.3;
  else if (folded.some((n) => n.startsWith(queryFolded))) score += 0.05;
  // Prefer names without many extra words: "Bench Press" before "Bench Press with Chains".
  const queryTokens = query.flat(2);
  const wordMatched = (word: string[][]) =>
    word.some((tokens) =>
      tokens.some((t) => queryTokens.some((q) => t === q || (q.length >= 3 && t.startsWith(q)))),
    );
  const precision = Math.max(
    0,
    ...entry.nameWords.map((words) =>
      words.length ? words.filter(wordMatched).length / words.length : 0,
    ),
  );
  return score + 0.2 * precision;
}

export interface SearchExercisesOptions {
  limit?: number;
  minScore?: number;
  /**
   * `false` also returns exercises that match most (by weight, at least half) of the words —
   * for suggestions like "Did you mean …?" before creating a custom exercise.
   */
  matchAllWords?: boolean;
}

/** Exercises matching `query`, best first. An empty query returns no results. */
export function searchExercises(
  index: ExerciseSearchIndex,
  query: string,
  { limit, minScore = MIN_SCORE, matchAllWords = true }: SearchExercisesOptions = {},
): ExerciseSearchResult[] {
  const alternatives = searchTokenAlternatives(query);
  if (alternatives.length === 0) return [];
  const queryCompact = compact(query);
  const queryFolded = foldSearchText(query);
  const { boost } = index;
  const results = index.entries
    .map((entry) => {
      const score = scoreEntry(entry, alternatives, queryCompact, queryFolded, matchAllWords);
      return { entry, score: score > 0 ? score + (boost?.(entry.exercise) ?? 0) : 0 };
    })
    .filter((r) => r.score >= minScore)
    .sort(
      (a, b) => b.score - a.score || a.entry.exercise.name.length - b.entry.exercise.name.length,
    )
    .map(({ entry, score }) => ({ exercise: entry.exercise, score }));
  return limit ? results.slice(0, limit) : results;
}
