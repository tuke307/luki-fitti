/**
 * Zoned calendar arithmetic for tool `from`/`to` inputs, resolved in the
 * user's time zone (the API has no time zone field on `/v1/me` yet, so callers
 * pass `Europe/Berlin` today — the zone stays a parameter so it can come from
 * the profile later). Implemented with Intl.DateTimeFormat only — DST-safe,
 * no date library. Mirrors `league-time.util.ts` in @luki-fitti/common, which
 * is hardcoded to Berlin.
 */

export const DEFAULT_TIME_ZONE = 'Europe/Berlin';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Accepted relative words plus `YYYY-MM-DD`. */
export const RELATIVE_WORDS = [
  'today',
  'yesterday',
  'this-week',
  'last-week',
  'this-month',
  'last-month',
  'this-year',
  'last-30-days',
  'last-90-days',
] as const;
export type RelativeWord = (typeof RELATIVE_WORDS)[number];

export class DateInputError extends Error {
  constructor(input: string) {
    super(`Invalid date "${input}". Accepted formats: YYYY-MM-DD or ${RELATIVE_WORDS.join(', ')}`);
    this.name = 'DateInputError';
  }
}

const formatters = new Map<string, Intl.DateTimeFormat>();
const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
};

const pad = (n: number) => String(n).padStart(2, '0');

interface ZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zoneParts(date: Date, timeZone: string): ZoneParts {
  const out = {} as Record<string, number>;
  for (const p of formatterFor(timeZone).formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return out as unknown as ZoneParts;
}

/** Calendar date of `date` in `timeZone` as `YYYY-MM-DD`. */
export function dayKeyInZone(date: Date, timeZone: string): string {
  const p = zoneParts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Adds `days` calendar days to a `YYYY-MM-DD` day key (zone-agnostic). */
export function addDaysToDayKey(dayKey: string, days: number): string {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** ISO week Monday of the week containing `dayKey` as `YYYY-MM-DD`. */
export function weekStartDayKey(dayKey: string): string {
  const weekday = new Date(`${dayKey}T12:00:00Z`).getUTCDay();
  return addDaysToDayKey(dayKey, -((weekday + 6) % 7));
}

/** The zone's wall-clock offset from UTC for the instant `utc`. */
function zoneOffsetMs(utc: Date, timeZone: string): number {
  const p = zoneParts(utc, timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - utc.getTime();
}

/** UTC instant of zoned wall-clock midnight at the start of `dayKey`. */
export function zoneMidnight(dayKey: string, timeZone: string): Date {
  const [y, m, d] = dayKey.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d);
  // Iterate: utc = wall - offset(utc). Two passes converge across DST transitions.
  let utc = wall - zoneOffsetMs(new Date(wall), timeZone);
  utc = wall - zoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc);
}

interface DayRange {
  startDayKey: string;
  endDayKey: string;
}

/** Day-key span of a relative word, evaluated "today" in `timeZone` at `now`. */
export function relativeDayRange(word: RelativeWord, timeZone: string, now: Date): DayRange {
  const today = dayKeyInZone(now, timeZone);
  switch (word) {
    case 'today':
      return { startDayKey: today, endDayKey: today };
    case 'yesterday':
      return { startDayKey: addDaysToDayKey(today, -1), endDayKey: addDaysToDayKey(today, -1) };
    case 'this-week': {
      const monday = weekStartDayKey(today);
      return { startDayKey: monday, endDayKey: addDaysToDayKey(monday, 6) };
    }
    case 'last-week': {
      const monday = addDaysToDayKey(weekStartDayKey(today), -7);
      return { startDayKey: monday, endDayKey: addDaysToDayKey(monday, 6) };
    }
    case 'this-month': {
      const [y, m] = today.split('-');
      return { startDayKey: `${y}-${m}-01`, endDayKey: lastOfMonth(y!, m!) };
    }
    case 'last-month': {
      const [y, m] = today.split('-').map(Number) as [number, number];
      const prev = new Date(Date.UTC(y, m - 2, 1));
      const py = prev.getUTCFullYear();
      const pm = pad(prev.getUTCMonth() + 1);
      return { startDayKey: `${py}-${pm}-01`, endDayKey: lastOfMonth(String(py), pm) };
    }
    case 'this-year': {
      const y = today.slice(0, 4);
      return { startDayKey: `${y}-01-01`, endDayKey: `${y}-12-31` };
    }
    case 'last-30-days':
      return { startDayKey: addDaysToDayKey(today, -29), endDayKey: today };
    case 'last-90-days':
      return { startDayKey: addDaysToDayKey(today, -89), endDayKey: today };
  }
}

const lastOfMonth = (year: string, month: string): string =>
  addDaysToDayKey(addDaysToDayKey(`${year}-${month}-01`, 40).slice(0, 8) + '01', -1);

function toDayRange(value: string, timeZone: string, now: Date): DayRange {
  if (DATE_ONLY.test(value)) return { startDayKey: value, endDayKey: value };
  if ((RELATIVE_WORDS as readonly string[]).includes(value)) {
    return relativeDayRange(value as RelativeWord, timeZone, now);
  }
  throw new DateInputError(value);
}

export interface ResolvedRange {
  /** UTC ISO instant of the start of the from-day in `timeZone`. */
  from: string;
  /** UTC ISO instant of the end of the to-day in `timeZone` (inclusive). */
  to: string;
  /** Berlin-zone style day keys the range covers (for per-day grouping). */
  fromDayKey: string;
  toDayKey: string;
}

/**
 * Resolves tool `from`/`to` inputs to exact UTC ISO datetimes. Each side may
 * be `YYYY-MM-DD` or a relative word; a word used on `from` takes the span's
 * start, on `to` its end. Defaults: from = 30 days back, to = today.
 */
export function resolveRange(
  input: { from?: string; to?: string },
  timeZone: string = DEFAULT_TIME_ZONE,
  now: Date = new Date(),
): ResolvedRange {
  const today = dayKeyInZone(now, timeZone);
  const fromRange = input.from
    ? toDayRange(input.from, timeZone, now)
    : { startDayKey: addDaysToDayKey(today, -29), endDayKey: addDaysToDayKey(today, -29) };
  const toRange = input.to
    ? toDayRange(input.to, timeZone, now)
    : { startDayKey: today, endDayKey: today };
  if (fromRange.startDayKey > toRange.endDayKey) {
    throw new DateInputError(`${input.from}..${input.to} (from after to)`);
  }
  const start = zoneMidnight(fromRange.startDayKey, timeZone);
  const endExclusive = zoneMidnight(addDaysToDayKey(toRange.endDayKey, 1), timeZone);
  return {
    from: start.toISOString(),
    to: new Date(endExclusive.getTime() - 1).toISOString(),
    fromDayKey: fromRange.startDayKey,
    toDayKey: toRange.endDayKey,
  };
}

/** All `YYYY-MM-DD` day keys in [fromDayKey, toDayKey] — for per-day grouping. */
export function dayKeysBetween(fromDayKey: string, toDayKey: string): string[] {
  const keys: string[] = [];
  for (let d = fromDayKey; d <= toDayKey && keys.length < 400; d = addDaysToDayKey(d, 1)) {
    keys.push(d);
  }
  return keys;
}

export type SummaryPeriod = 'week' | 'month' | 'year';

/**
 * Day-key span of `period` shifted back by `offset` (0 = current), evaluated in
 * `timeZone`. Weeks are ISO weeks (Monday start).
 */
export function periodDayRange(
  period: SummaryPeriod,
  offset: number,
  timeZone: string,
  now: Date,
): { startDayKey: string; endDayKey: string } {
  const today = dayKeyInZone(now, timeZone);
  if (period === 'week') {
    const monday = weekStartDayKey(addDaysToDayKey(today, -7 * offset));
    return { startDayKey: monday, endDayKey: addDaysToDayKey(monday, 6) };
  }
  if (period === 'month') {
    const [y, m] = today.split('-').map(Number) as [number, number];
    const t = new Date(Date.UTC(y, m - 1 - offset, 1));
    const ty = String(t.getUTCFullYear());
    const tm = pad(t.getUTCMonth() + 1);
    return { startDayKey: `${ty}-${tm}-01`, endDayKey: lastOfMonth(ty, tm) };
  }
  const y = Number(today.slice(0, 4)) - offset;
  return { startDayKey: `${y}-01-01`, endDayKey: `${y}-12-31` };
}
