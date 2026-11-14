/**
 * Quiet hours: social pushes between 22:00 and 08:00 in the device's local time zone
 * are delayed until the next 08:00. Pure functions for unit tests.
 */

const QUIET_START_HOUR = 22;
const QUIET_END_HOUR = 8;

/** Milliseconds offset between UTC and the wall clock in `timeZone` at `date`. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wallAsUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return wallAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function isQuietLocalHour(hour: number): boolean {
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/**
 * Delay in ms until the notification may be pushed. 0 outside quiet hours or when the
 * time zone is unknown/invalid (we then send immediately — better than dropping).
 */
export function quietHoursDelayMs(now: Date, timeZone: string | null | undefined): number {
  if (!timeZone) return 0;
  try {
    const offset = tzOffsetMs(now, timeZone);
    const wallNow = new Date(now.getTime() + offset);
    if (!isQuietLocalHour(wallNow.getUTCHours())) return 0;

    const wallTarget = new Date(wallNow);
    wallTarget.setUTCMinutes(0, 0, 0);
    wallTarget.setUTCHours(QUIET_END_HOUR);
    if (wallTarget.getTime() <= wallNow.getTime()) {
      wallTarget.setUTCDate(wallTarget.getUTCDate() + 1);
    }
    // Refine once for a DST transition inside the quiet window.
    const offsetAtTarget = tzOffsetMs(new Date(wallTarget.getTime() - offset), timeZone);
    return Math.max(0, wallTarget.getTime() - offsetAtTarget - now.getTime());
  } catch {
    return 0;
  }
}
