import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { PublicExerciseDto, PublicSessionDto } from '@luki-fitti/common/schemas';
import {
  e1rmTrend,
  exerciseIndex,
  exerciseStatInSession,
  resolveExercise,
  weeklyGoalStreak,
  weightInUnit,
} from './insights';

const exercise = (id: string, name: string): PublicExerciseDto =>
  ({
    id,
    name,
    description: '',
    instructions: [],
    category: 'COMPOUND',
    exerciseType: 'STRENGTH',
    primaryMuscleGroup: 'CHEST',
    muscleGroups: ['CHEST'],
    equipment: 'BARBELL',
    tags: [],
    custom: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }) as PublicExerciseDto;

const EXERCISES = [
  exercise('e1', 'Bench Press (Barbell)'),
  exercise('e2', 'Bench Press (Dumbbell)'),
  exercise('e3', 'Squat (Barbell)'),
];

const session = (exerciseId: string, sets: object[], startedAt = '2026-11-10T10:00:00Z') =>
  ({
    id: `s-${startedAt}`,
    status: 'COMPLETED',
    startedAt,
    workoutName: 'Push',
    exercises: [
      {
        id: 'se1',
        exerciseId,
        exerciseName: 'Bench Press (Barbell)',
        primaryMuscle: 'CHEST',
        exerciseType: 'STRENGTH',
        sets,
      },
    ],
  }) as unknown as PublicSessionDto;

const set = (n: number, setType: string, weightKg: number | null, reps: number | null) => ({
  setNumber: n,
  setType,
  weightKg,
  reps,
  completed: true,
  rpe: null,
});

describe('resolveExercise', () => {
  const index = exerciseIndex(EXERCISES);

  it('resolves an exact folded-name match even when siblings exist', () => {
    const r = resolveExercise(index, 'bench press barbell');
    assert.equal(r.kind, 'resolved');
    if (r.kind === 'resolved') assert.equal(r.exercise.id, 'e1');
    const exact = resolveExercise(index, 'Bench Press (Dumbbell)');
    assert.equal(exact.kind, 'resolved');
    if (exact.kind === 'resolved') assert.equal(exact.exercise.id, 'e2');
  });

  it('returns ambiguous candidates when no clear winner exists', () => {
    const r = resolveExercise(index, 'bench press');
    assert.equal(r.kind, 'ambiguous');
    if (r.kind === 'ambiguous') {
      assert.ok(r.candidates.length >= 2);
      assert.ok(r.candidates.length <= 5);
    }
  });

  it('resolves a clearly-ahead top hit', () => {
    const r = resolveExercise(index, 'squat');
    assert.equal(r.kind, 'resolved');
  });

  it('returns none when nothing matches', () => {
    assert.equal(resolveExercise(index, 'zzz-no-such-lift').kind, 'none');
  });
});

describe('exerciseStatInSession / e1rmTrend', () => {
  const s = session('e1', [
    set(1, 'WARMUP', 60, 10),
    set(2, 'WORKING', 100, 5),
    set(3, 'WORKING', 110, 3),
    set(4, 'WORKING', 110, 8),
  ]);

  it('picks the heaviest completed working set, e1RM and volume', () => {
    const stat = exerciseStatInSession(s, 'e1', 'kg')!;
    assert.deepEqual(stat.bestSet, { weight: 110, reps: 3 });
    assert.ok(stat.e1rm! > 110 && stat.e1rm! < 130);
    // volume excludes the warmup: 100*5 + 110*3 + 110*8 = 1710
    assert.equal(stat.volume, 1710);
  });

  it('converts to lbs when the user uses them', () => {
    const stat = exerciseStatInSession(s, 'e1', 'lbs')!;
    assert.ok(Math.abs(stat.bestSet!.weight - 110 / 0.45359237) < 0.1);
    assert.equal(weightInUnit(100, 'kg'), 100);
  });

  it('returns null when the exercise is not in the session', () => {
    assert.equal(exerciseStatInSession(s, 'e2', 'kg'), null);
  });

  it('computes the first-vs-last e1RM trend in percent', () => {
    const stats = [
      {
        sessionId: 'a',
        date: '2026-11-01',
        bestSet: { weight: 100, reps: 5 },
        e1rm: 100,
        volume: 500,
      },
      {
        sessionId: 'b',
        date: '2026-11-10',
        bestSet: { weight: 110, reps: 5 },
        e1rm: 110,
        volume: 550,
      },
    ];
    assert.deepEqual(e1rmTrend(stats), { firstE1rm: 100, lastE1rm: 110, changePercent: 10 });
    assert.deepEqual(e1rmTrend([]), { firstE1rm: null, lastE1rm: null, changePercent: null });
  });
});

describe('weeklyGoalStreak', () => {
  // now = Wed 2026-11-18; the current week (Mon 16) is skipped as incomplete.
  const now = new Date('2026-11-18T12:00:00Z');
  const periodEnd = new Date('2026-11-22T12:00:00Z');
  const inWeek = (mondayDay: number, day: number) =>
    `2026-11-${String(day).padStart(2, '0')}T10:00:00Z`;

  it('counts consecutive weeks meeting the goal, skipping the current week', () => {
    const ats = [
      inWeek(9, 9),
      inWeek(9, 11),
      inWeek(9, 13), // week of Nov 9: 3 sessions
      inWeek(2, 3),
      inWeek(2, 5), // week of Nov 2: 2 sessions → streak stops
      inWeek(16, 17), // current week: ignored
    ];
    assert.equal(weeklyGoalStreak(ats, 3, periodEnd, 'Europe/Berlin', now), 1);
  });

  it('extends the streak across earlier weeks and caps the lookback', () => {
    const ats: string[] = [];
    // 4 straight weeks of 3 sessions ending 2026-11-15.
    for (const monday of ['2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09']) {
      const base = new Date(`${monday}T10:00:00Z`).getTime();
      for (let i = 0; i < 3; i++) ats.push(new Date(base + i * 86400_000).toISOString());
    }
    assert.equal(weeklyGoalStreak(ats, 3, periodEnd, 'Europe/Berlin', now), 4);
    assert.equal(weeklyGoalStreak(ats, 0, periodEnd, 'Europe/Berlin', now), 0);
  });
});
