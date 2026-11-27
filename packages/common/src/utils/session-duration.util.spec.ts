import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStatus } from '../enums';
import {
  activeElapsedSeconds,
  pauseSession,
  resumeSession,
  type PauseAwareSessionLike,
} from './session-duration.util';

const START = '2026-11-27T10:00:00.000Z';
const ms = (iso: string) => Date.parse(iso);
const at = (sec: number) => new Date(ms(START) + sec * 1000).toISOString();

const running = (over: Partial<PauseAwareSessionLike> = {}): PauseAwareSessionLike => ({
  status: SessionStatus.IN_PROGRESS,
  startedAt: START,
  ...over,
});

describe('session-duration.util', () => {
  it('counts plain wall time when there are no pauses', () => {
    assert.equal(activeElapsedSeconds(running(), ms(at(600))), 600);
  });

  it('excludes completed pause time after resume', () => {
    let session = running();
    session = { ...session, ...pauseSession(session, at(120)) };
    session = { ...session, ...resumeSession(session, at(120 + 300)) };
    // 5 min paused (120s → 420s); at 720s the active time is 720 - 300.
    assert.equal(session.pausedDurationSeconds, 300);
    assert.equal(session.status, SessionStatus.IN_PROGRESS);
    assert.equal(session.pausedAt, null);
    assert.equal(activeElapsedSeconds(session, ms(at(720))), 420);
  });

  it('stops the clock while paused and folds the open pause on finish', () => {
    let session = running();
    session = { ...session, ...pauseSession(session, at(60)) };
    assert.equal(session.activeDurationSeconds, 60);
    // Still paused 10 min later: the open pause is subtracted live.
    assert.equal(activeElapsedSeconds(session, ms(at(660))), 60);
    session = { ...session, ...resumeSession(session, at(660)) };
    assert.equal(session.pausedDurationSeconds, 600);
  });

  it('clamps at zero for pathological inputs', () => {
    const session = running({ pausedDurationSeconds: 9999 });
    assert.equal(activeElapsedSeconds(session, ms(at(10))), 0);
    // Paused before the start time is clamped, not negative.
    const weird = running({ status: SessionStatus.PAUSED, pausedAt: at(-100) });
    assert.equal(activeElapsedSeconds(weird, ms(at(10))) >= 0, true);
  });

  it('resume without pausedAt adds nothing', () => {
    const patch = resumeSession(running({ pausedDurationSeconds: 30 }), at(500));
    assert.equal(patch.pausedDurationSeconds, 30);
    assert.equal(patch.pausedAt, null);
  });
});
