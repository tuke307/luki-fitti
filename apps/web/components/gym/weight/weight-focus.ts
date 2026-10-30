/** Cross-tab hand-off so "Log weight" elsewhere lands in the weight form on the profile tab. */

export const WEIGHT_SECTION_ID = 'weight';
export const WEIGHT_INPUT_ID = 'weight-value';

let focusRequested = false;

/** Call before navigating to the profile tab; the weight section focuses its input on mount. */
export function requestWeightFocus(): void {
  focusRequested = true;
}

export function consumeWeightFocusRequest(): boolean {
  const requested = focusRequested;
  focusRequested = false;
  return requested;
}

/** Scrolls the weight form into view and focuses the weight input. */
export function focusWeightInput(): void {
  const input = document.getElementById(WEIGHT_INPUT_ID);
  if (!input) return;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  input.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
  input.focus({ preventScroll: true });
}
