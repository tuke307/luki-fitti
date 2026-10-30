/** Locale-aware formatting for body weight values and weigh-in dates. */

export function formatWeight(value: number, bcp47: string): string {
  return value.toLocaleString(bcp47, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Signed change, e.g. "+0.4" / "−1.2" / "0.0". */
export function formatWeightDelta(value: number, bcp47: string): string {
  return new Intl.NumberFormat(bcp47, {
    signDisplay: 'exceptZero',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatWeighInDateTime(value: string | number, bcp47: string): string {
  return new Date(value).toLocaleString(bcp47, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatWeighInDate(value: string | number, bcp47: string): string {
  return new Date(value).toLocaleDateString(bcp47, { dateStyle: 'medium' });
}

/** "today" / "yesterday" / "3 days ago" in the UI language. */
export function formatDaysAgo(days: number, bcp47: string): string {
  return new Intl.RelativeTimeFormat(bcp47, { numeric: 'auto' }).format(-days, 'day');
}
