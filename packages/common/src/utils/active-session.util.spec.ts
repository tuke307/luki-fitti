import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionExerciseStatus } from '../enums';
import { resolveFocusedExerciseIndex } from './active-session.util';

const ex = (
  id: string,
  sets: Array<string | null>,
  status: SessionExerciseStatus = SessionExerciseStatus.PENDING,
) => ({
  clientExerciseId: id,
  status,
  sets: sets.map((completedAt) => ({ completed: completedAt !== null, completedAt })),
});

describe('resolveFocusedExerciseIndex', () => {
  it('returns 0 for an empty workout', () => {
    assert.equal(resolveFocusedExerciseIndex([]), 0);
  });

  it('keeps the exercise the user last opened, even when it is finished', () => {
    const exercises = [
      ex('a', [null, null]),
      ex('b', ['2026-10-28T10:00:00Z', '2026-10-28T10:03:00Z'], SessionExerciseStatus.COMPLETED),
      ex('c', [null]),
    ];
    assert.equal(resolveFocusedExerciseIndex(exercises, 'b'), 1);
  });

  it('ignores a remembered exercise that no longer exists', () => {
    const exercises = [ex('a', ['2026-10-28T10:00:00Z']), ex('b', [null])];
    assert.equal(resolveFocusedExerciseIndex(exercises, 'gone'), 1);
  });

  it('falls back to the exercise with the latest logged set while it has open sets', () => {
    const exercises = [
      ex('a', ['2026-10-28T10:00:00Z', null]),
      ex('b', ['2026-10-28T10:10:00Z', null]),
      ex('c', [null]),
    ];
    assert.equal(resolveFocusedExerciseIndex(exercises), 1);
  });

  it('moves to the first unfinished exercise once the latest one is done', () => {
    const exercises = [
      ex('a', ['2026-10-28T10:00:00Z', '2026-10-28T10:02:00Z'], SessionExerciseStatus.COMPLETED),
      ex('b', [null, null]),
      ex('c', [null]),
    ];
    assert.equal(resolveFocusedExerciseIndex(exercises), 1);
  });

  it('skips skipped exercises when looking for the first unfinished one', () => {
    const exercises = [ex('a', [null], SessionExerciseStatus.SKIPPED), ex('b', [null])];
    assert.equal(resolveFocusedExerciseIndex(exercises), 1);
  });

  it('returns 0 when every exercise is finished', () => {
    const exercises = [
      ex('a', ['2026-10-28T10:00:00Z'], SessionExerciseStatus.COMPLETED),
      ex('b', ['2026-10-28T10:05:00Z'], SessionExerciseStatus.COMPLETED),
    ];
    assert.equal(resolveFocusedExerciseIndex(exercises), 0);
  });
});
