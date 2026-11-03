import { ApiClientError } from '@/lib/api';

/** window event that asks the shell to open profile → AI key settings. */
export const AI_KEY_NAVIGATE_EVENT = 'luki:open-ai-key-settings';

/** True when the API denied an AI call because the user has no usable OpenRouter key. */
export function isAiKeyRequiredError(err: unknown): boolean {
  return err instanceof ApiClientError && err.code === 'AI_KEY_REQUIRED';
}

export function openAiKeySettings(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(AI_KEY_NAVIGATE_EVENT));
  }
}
