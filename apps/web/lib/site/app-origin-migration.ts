/** Decision for the PWA origin cutover — pure so it's unit-testable. */
export function shouldMigrateToAppOrigin(
  hostname: string,
  siteHostnames: string[],
): boolean {
  return siteHostnames.includes(hostname);
}

export const MIGRATION_TIMEOUT_MS = 10_000;

/**
 * Flush pending offline work (bounded), then move to the app origin keeping path+query.
 * Returns true when the redirect was initiated.
 */
export async function migrateToAppOrigin(opts: {
  appOrigin: string;
  flush: () => Promise<void>;
  timeoutMs?: number;
  navigate: (url: string) => void;
  path: string;
}): Promise<boolean> {
  const timeout = new Promise<'timeout'>((r) =>
    setTimeout(() => r('timeout'), opts.timeoutMs ?? MIGRATION_TIMEOUT_MS),
  );
  await Promise.race([
    opts
      .flush()
      .then(() => 'flushed' as const)
      .catch(() => 'failed' as const),
    timeout,
  ]);
  opts.navigate(opts.appOrigin + opts.path);
  return true;
}
