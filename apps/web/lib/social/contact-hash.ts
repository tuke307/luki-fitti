/**
 * Contact-sync helpers: emails are normalised and SHA-256 hashed on the device
 * (WebCrypto via `emailLookupHash`), deduped, and chunked to the API's 2000-hash
 * cap. Raw emails never leave the browser and hashes are never logged.
 */
import { emailLookupHash, normalizeEmailForLookup } from '@luki-fitti/common/utils';

export const CONTACT_HASH_BATCH_SIZE = 2000;

/** Dedupe (order-preserving) and split into batches of `size`. */
export function dedupeAndChunk<T>(items: T[], size: number): T[][] {
  const unique = [...new Set(items)];
  const chunks: T[][] = [];
  for (let i = 0; i < unique.length; i += size) {
    chunks.push(unique.slice(i, i + size));
  }
  return chunks;
}

/**
 * Normalise + hash a list of contact emails. Entries that fail normalisation
 * (empty) are skipped; duplicates collapse. Returns at most `max` hashes.
 */
export async function emailsToHashes(
  emails: string[],
  max = CONTACT_HASH_BATCH_SIZE,
): Promise<string[]> {
  const uniqueEmails = [...new Set(emails.map(normalizeEmailForLookup))].filter(Boolean);
  const hashes = await Promise.all(uniqueEmails.map((e) => emailLookupHash(e)));
  return [...new Set(hashes)].slice(0, max);
}
