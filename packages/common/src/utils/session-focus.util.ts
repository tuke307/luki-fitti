/**
 * Exercise focus ("which exercise is the athlete looking at") is shared across devices and
 * merged independently of the session version: the newest parsable `focusedAt` wins and a
 * missing or invalid incoming timestamp never overwrites the local value.
 */
export interface SessionFocusLike {
  focusedClientExerciseId?: string | null;
  focusedAt?: string | null;
}

export interface SessionFocus {
  focusedClientExerciseId: string | null;
  focusedAt: string | null;
}

const parseFocusMs = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
};

/** Picks the focus with the newer `focusedAt`; `local` wins ties and missing/invalid inputs. */
export function mergeSessionFocus(
  local: SessionFocusLike,
  incoming: SessionFocusLike,
): SessionFocus {
  const localMs = parseFocusMs(local.focusedAt);
  const incomingMs = parseFocusMs(incoming.focusedAt);
  if (incomingMs !== null && (localMs === null || incomingMs > localMs)) {
    return {
      focusedClientExerciseId: incoming.focusedClientExerciseId ?? null,
      focusedAt: incoming.focusedAt ?? null,
    };
  }
  return {
    focusedClientExerciseId: local.focusedClientExerciseId ?? null,
    focusedAt: local.focusedAt ?? null,
  };
}

/** Returns `session` focused on `clientExerciseId` with a fresh timestamp (now or injected). */
export function withSessionFocus<T extends SessionFocusLike>(
  session: T,
  clientExerciseId: string,
  now: Date = new Date(),
): T {
  return {
    ...session,
    focusedClientExerciseId: clientExerciseId,
    focusedAt: now.toISOString(),
  };
}
