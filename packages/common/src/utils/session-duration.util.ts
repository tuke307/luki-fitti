import { SessionStatus } from '../enums';

/** Fields the pause math needs — satisfied by `WorkoutSessionDto` and the sync payload. */
export interface PauseAwareSessionLike {
  status: SessionStatus | `${SessionStatus}`;
  startedAt: string;
  pausedAt?: string | null;
  pausedDurationSeconds?: number | null;
}

const elapsedWhole = (fromMs: number, toMs: number) => Math.floor((toMs - fromMs) / 1000);

/**
 * Active seconds actually spent training: wall time since `startedAt` minus all completed
 * pauses (`pausedDurationSeconds`) minus the currently open pause. Never negative.
 */
export function activeElapsedSeconds(session: PauseAwareSessionLike, nowMs: number): number {
  const startedMs = Date.parse(session.startedAt);
  if (Number.isNaN(startedMs)) return 0;
  const pausedMs =
    session.status === SessionStatus.PAUSED && session.pausedAt
      ? Date.parse(session.pausedAt)
      : NaN;
  const openPause = Number.isNaN(pausedMs) ? 0 : elapsedWhole(pausedMs, nowMs);
  const pausedTotal = session.pausedDurationSeconds ?? 0;
  return Math.max(0, elapsedWhole(startedMs, nowMs) - pausedTotal - openPause);
}

/** Field patch for pausing: snapshot the elapsed seconds and open the pause. */
export function pauseSession(session: PauseAwareSessionLike, nowIso: string) {
  return {
    status: SessionStatus.PAUSED,
    pausedAt: nowIso,
    activeDurationSeconds: activeElapsedSeconds(session, Date.parse(nowIso)),
  } as const;
}

/** Field patch for resuming: fold the open pause into `pausedDurationSeconds`. */
export function resumeSession(session: PauseAwareSessionLike, nowIso: string) {
  const nowMs = Date.parse(nowIso);
  const pausedMs = session.pausedAt ? Date.parse(session.pausedAt) : NaN;
  const extra = Number.isNaN(pausedMs) ? 0 : Math.max(0, elapsedWhole(pausedMs, nowMs));
  return {
    status: SessionStatus.IN_PROGRESS,
    pausedAt: null,
    pausedDurationSeconds: (session.pausedDurationSeconds ?? 0) + extra,
  } as const;
}
