/** API asset URLs (avatars) come back API-relative without the /api prefix
 * (`/social/avatars/...`). Progress photos already carry `/api/`; this prefixes
 * it when missing so both shapes resolve through the app's API proxy. */
export function resolveApiAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith('/api/')) return url;
  if (url.startsWith('/')) return `/api${url}`;
  return url;
}

/** Up to two initials for the avatar fallback circle. */
export function initialsFor(
  name: string | null | undefined,
  handle: string | null | undefined,
): string {
  const source = name?.trim() || handle?.trim() || '';
  return source
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}
