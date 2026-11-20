export interface AppleAppSiteAssociation {
  applinks: { details: { appIDs: string[]; components: { '/': string }[] }[] };
}

/**
 * Builds the apple-app-site-association document for the `/invite/*` universal links from
 * the comma-separated `APPLE_APP_IDS` (`TEAMID.bundle.id`). Returns null when none are
 * configured so the route 404s instead of serving a half-configured file.
 */
export function buildAppleAppSiteAssociation(
  rawAppIds: string | undefined,
): AppleAppSiteAssociation | null {
  const appIDs = (rawAppIds ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (appIDs.length === 0) return null;
  return { applinks: { details: [{ appIDs, components: [{ '/': '/invite/*' }] }] } };
}
