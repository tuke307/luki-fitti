/**
 * Last-commit dates from the GitHub REST API, used by prepare-docs when the build
 * image has no .git (Docker ignores it). Optional token raises the rate limit;
 * it is only ever sent in the Authorization header, never logged. Any failure
 * yields no date — the build must never fail on this.
 */
const API = 'https://api.github.com/repos/tuke307/luki-fitti/commits';
const BATCH = 5;
const TIMEOUT_MS = 5000;

async function lastCommitDate(repoPath, fetchImpl, headers) {
  try {
    const res = await fetchImpl(`${API}?path=${encodeURIComponent(repoPath)}&per_page=1`, {
      headers,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const [commit] = await res.json();
    return commit?.commit?.committer?.date ?? commit?.commit?.author?.date ?? null;
  } catch {
    return null;
  }
}

/**
 * repo paths -> Map<repo path, ISO date | null>, fetched in small batches.
 * @param {string[]} repoPaths
 * @param {{ fetchImpl?: typeof fetch, token?: string }} [options]
 */
export async function githubDatesFor(repoPaths, { fetchImpl = fetch, token } = {}) {
  const headers = { Accept: 'application/vnd.github+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const dates = new Map();
  for (let i = 0; i < repoPaths.length; i += BATCH) {
    const batch = repoPaths.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map((repoPath) => lastCommitDate(repoPath, fetchImpl, headers)),
    );
    batch.forEach((repoPath, j) => dates.set(repoPath, results[j]));
  }
  return dates;
}
