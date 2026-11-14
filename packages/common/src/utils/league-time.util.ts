/**
 * League week arithmetic in Europe/Berlin (Monday 00:00 → Sunday 24:00).
 * Implemented with Intl.DateTimeFormat only — DST-safe, no date library.
 */

export const LEAGUE_TIME_ZONE = 'Europe/Berlin';

const berlinParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: LEAGUE_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

interface BerlinParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function parts(date: Date): BerlinParts {
  const out = {} as Record<string, number>;
  for (const p of berlinParts.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out as unknown as BerlinParts;
}

/** Berlin calendar date of `date` as `YYYY-MM-DD`. */
export function berlinDayKey(date: Date): string {
  const p = parts(date);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Adds `days` calendar days to a `YYYY-MM-DD` day key (zone-agnostic). */
export function addBerlinDays(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Monday (Berlin) of the week containing `date` as `YYYY-MM-DD`. */
export function berlinWeekKey(date: Date): string {
  const dayKey = berlinDayKey(date);
  const weekday = new Date(`${dayKey}T12:00:00Z`).getUTCDay(); // same weekday in any zone
  return addBerlinDays(dayKey, -((weekday + 6) % 7));
}

export function previousWeekKey(weekKey: string): string {
  return addBerlinDays(weekKey, -7);
}

export function nextWeekKey(weekKey: string): string {
  return addBerlinDays(weekKey, 7);
}

/** Berlin wall-clock offset from UTC for the instant `utc`. */
function berlinOffsetMs(utc: Date): number {
  const p = parts(utc);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - utc.getTime();
}

/** UTC instant of Berlin wall-clock midnight at the start of `dayKey`. */
export function berlinMidnight(dayKey: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d);
  // Iterate: utc = wall - offset(utc). Two passes converge across DST transitions.
  let utc = wall - berlinOffsetMs(new Date(wall));
  utc = wall - berlinOffsetMs(new Date(utc));
  return new Date(utc);
}

/** UTC instants bounding the league week `weekKey` (Berlin Monday → next Monday). */
export function weekBounds(weekKey: string): { start: Date; end: Date } {
  return { start: berlinMidnight(weekKey), end: berlinMidnight(nextWeekKey(weekKey)) };
}
