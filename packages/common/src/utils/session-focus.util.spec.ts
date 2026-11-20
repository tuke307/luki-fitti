import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mergeSessionFocus, withSessionFocus } from './session-focus.util';

describe('mergeSessionFocus', () => {
  it('keeps the focus with the newer focusedAt', () => {
    const local = { focusedClientExerciseId: 'a', focusedAt: '2026-11-20T10:00:00.000Z' };
    const incoming = { focusedClientExerciseId: 'b', focusedAt: '2026-11-20T11:00:00.000Z' };
    assert.deepEqual(mergeSessionFocus(local, incoming), {
      focusedClientExerciseId: 'b',
      focusedAt: '2026-11-20T11:00:00.000Z',
    });
    assert.deepEqual(mergeSessionFocus(incoming, local), {
      focusedClientExerciseId: 'b',
      focusedAt: '2026-11-20T11:00:00.000Z',
    });
  });

  it('keeps local when the incoming focusedAt is missing or invalid', () => {
    const local = { focusedClientExerciseId: 'a', focusedAt: '2026-11-20T10:00:00.000Z' };
    assert.deepEqual(mergeSessionFocus(local, {}), {
      focusedClientExerciseId: 'a',
      focusedAt: '2026-11-20T10:00:00.000Z',
    });
    assert.deepEqual(
      mergeSessionFocus(local, { focusedClientExerciseId: 'b', focusedAt: 'nope' }),
      {
        focusedClientExerciseId: 'a',
        focusedAt: '2026-11-20T10:00:00.000Z',
      },
    );
  });

  it('uses incoming when local has no timestamp', () => {
    const incoming = { focusedClientExerciseId: 'b', focusedAt: '2026-11-20T11:00:00.000Z' };
    assert.deepEqual(mergeSessionFocus({}, incoming), {
      focusedClientExerciseId: 'b',
      focusedAt: '2026-11-20T11:00:00.000Z',
    });
  });

  it('local wins ties', () => {
    const at = '2026-11-20T10:00:00.000Z';
    const merged = mergeSessionFocus(
      { focusedClientExerciseId: 'a', focusedAt: at },
      { focusedClientExerciseId: 'b', focusedAt: at },
    );
    assert.equal(merged.focusedClientExerciseId, 'a');
  });
});

describe('withSessionFocus', () => {
  it('stamps the exercise id with the given time without mutating the input', () => {
    const session = { clientSessionId: 's1', focusedClientExerciseId: 'a', focusedAt: null };
    const now = new Date('2026-11-20T12:00:00.000Z');
    const focused = withSessionFocus(session, 'b', now);
    assert.equal(focused.focusedClientExerciseId, 'b');
    assert.equal(focused.focusedAt, '2026-11-20T12:00:00.000Z');
    assert.equal(session.focusedClientExerciseId, 'a');
  });
});
