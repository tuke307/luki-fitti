import type { SettingsPage } from '@/components/gym/profile-import-view';

/** window event that asks the shell to open Settings on a given sub-page. */
export const OPEN_SETTINGS_EVENT = 'luki:open-settings';

/** Opens the profile Settings view (desktop page or mobile drawer) on `page`. */
export function openSettingsPage(page: SettingsPage): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(OPEN_SETTINGS_EVENT, { detail: { page } }));
  }
}
