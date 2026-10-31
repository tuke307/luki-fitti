/** Cross-tab hand-off so "Log weight" elsewhere lands in the weight form on the profile tab. */

export const WEIGHT_SECTION_ID = 'weight';
export const WEIGHT_INPUT_ID = 'weight-value';

type WeightFocusRequest = 'input' | 'section';

let focusRequested: WeightFocusRequest | null = null;

/** Call before navigating to the profile tab; the weight section focuses its input on mount. */
export function requestWeightFocus(): void {
  focusRequested = 'input';
}

/** Call before navigating to the profile tab to scroll to the weight history without typing. */
export function requestWeightSection(): void {
  focusRequested = 'section';
}

/** Lets the profile tab open the page that hosts the weight section before it mounts. */
export function hasPendingWeightFocusRequest(): boolean {
  return focusRequested !== null;
}

export function consumeWeightFocusRequest(): WeightFocusRequest | null {
  const requested = focusRequested;
  focusRequested = null;
  return requested;
}

const prefersReducedMotion = () =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Scrolls the weight form into view and focuses the weight input. */
export function focusWeightInput(): void {
  const input = document.getElementById(WEIGHT_INPUT_ID);
  if (!input) return;
  input.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'center' });
  input.focus({ preventScroll: true });
}

/** Scrolls the weight section into view and moves focus to it (for screen readers). */
export function scrollToWeightSection(): void {
  const section = document.getElementById(WEIGHT_SECTION_ID);
  if (!section) return;
  section.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  section.focus({ preventScroll: true });
}
