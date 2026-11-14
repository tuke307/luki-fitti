/**
 * Parses the `?open=` deep link the service worker attaches when a push
 * notification is tapped. `/social/...` opens the social tab (with an optional
 * section); anything else or malformed input falls back to home.
 */
export type OpenTarget =
  | { tab: 'social'; section: 'friends' | 'requests' | 'inbox' | 'duels' | 'raids' | null }
  | { tab: 'profile'; page: 'apiKeys' }
  | { tab: 'home' };

export function parseOpenParam(search: string): OpenTarget | null {
  const value = new URLSearchParams(search).get('open');
  if (!value) return null;
  if (!value.startsWith('/')) return { tab: 'home' };
  if (value === '/profile/api-keys') {
    return { tab: 'profile', page: 'apiKeys' };
  }
  if (value === '/social' || value.startsWith('/social/')) {
    const sub = value.slice('/social'.length).replace(/^\//, '').split('/')[0];
    switch (sub) {
      case 'friends':
        return { tab: 'social', section: 'friends' };
      case 'requests':
        return { tab: 'social', section: 'requests' };
      case 'inbox':
        return { tab: 'social', section: 'inbox' };
      case 'duels':
        return { tab: 'social', section: 'duels' };
      case 'raids':
        return { tab: 'social', section: 'raids' };
      default:
        return { tab: 'social', section: null };
    }
  }
  return { tab: 'home' };
}
