const MIN_SHOWN_USD = 0.0001;

/** USD exactly as reported by the provider (no conversion), up to 4 fraction digits. */
export function formatUsd(value: number, bcp47: string): string {
  const usd = new Intl.NumberFormat(bcp47, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
  return value > 0 && value < MIN_SHOWN_USD ? `< ${usd.format(MIN_SHOWN_USD)}` : usd.format(value);
}

export function formatCount(value: number, bcp47: string): string {
  return new Intl.NumberFormat(bcp47).format(value);
}
