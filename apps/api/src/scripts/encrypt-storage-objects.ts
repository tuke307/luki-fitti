/**
 * Backfill: encrypt every stored object with the current storage key.
 *
 * - Plaintext objects (pre-encryption rollout) are encrypted in place.
 * - Objects encrypted with a stale (non-current) key are re-encrypted.
 * - Already-current objects are skipped; the script is idempotent.
 *
 * Race guard: before rewriting an object, its ETag is re-checked and the write is made
 * conditional on it (S3 IfMatch). If the object changed underneath us it is reported as
 * 'changed' and left alone — rerun the script to pick it up.
 *
 * Usage:
 *   node --import tsx --env-file .env.local src/scripts/encrypt-storage-objects.ts [--dry-run]
 *   node dist/src/scripts/encrypt-storage-objects.js [--dry-run]   (prod image)
 *
 * Logs only counts and object keys — never object content.
 */
import { S3ServiceException } from '@aws-sdk/client-s3';
import { getAiKeyEncryptionConfig } from '../config/env.config';
import {
  decryptObject,
  encryptObject,
  isEncryptedObject,
  StorageDecryptionError,
  type MasterKey,
} from '../modules/storage/storage-crypto';
import { StorageService } from '../modules/storage/storage.service';
import { logger } from '@luki-fitti/logger';

const dryRun = process.argv.includes('--dry-run');
const storage = new StorageService();

type Outcome = 'encrypted' | 'rotated' | 'skipped' | 'changed' | 'failed';
const counts: Record<Outcome, number> = {
  encrypted: 0,
  rotated: 0,
  skipped: 0,
  changed: 0,
  failed: 0,
};

// Some S3-compatible servers (older SeaweedFS) reject IfMatch on PutObject; detected once.
let ifMatchUsable = true;

function httpStatus(err: unknown): number | undefined {
  return err instanceof S3ServiceException ? err.$metadata.httpStatusCode : undefined;
}

function isPreconditionFailed(err: unknown): boolean {
  return httpStatus(err) === 412;
}

function isUnsupportedConditional(err: unknown): boolean {
  const status = httpStatus(err);
  const name = err instanceof S3ServiceException ? err.name : '';
  return (
    status === 400 ||
    status === 501 ||
    /NotImplemented|InvalidArgument|InvalidRequest|HeaderNotSupported/.test(name)
  );
}

async function processObject(
  key: string,
  current: MasterKey,
  previous: MasterKey | null,
): Promise<Outcome> {
  const raw = await storage.getRaw(key);
  let blob: Buffer;
  let contentType: string;
  let outcome: 'encrypted' | 'rotated';

  if (!isEncryptedObject(raw.body)) {
    blob = encryptObject(raw.body, key, current);
    contentType = raw.contentType ?? 'application/octet-stream';
    outcome = 'encrypted';
  } else {
    const { plaintext, stale } = decryptObject(raw.body, key, current, previous);
    if (!stale) return 'skipped';
    blob = encryptObject(plaintext, key, current);
    contentType = raw.metadata?.['content-type'] ?? 'application/octet-stream';
    outcome = 'rotated';
  }

  if (dryRun) return outcome;

  // Race guard: object must not have changed since we read it.
  const head = await storage.headEtag(key);
  if (head !== raw.eTag) return 'changed';

  const ifMatch = ifMatchUsable ? raw.eTag : undefined;
  try {
    await storage.putEncrypted(key, blob, contentType, ifMatch);
  } catch (err) {
    if (isPreconditionFailed(err)) return 'changed';
    if (ifMatch && isUnsupportedConditional(err)) {
      ifMatchUsable = false;
      logger.warn(
        'S3 server does not support IfMatch on PutObject; falling back to ETag pre-check only',
      );
      await storage.putEncrypted(key, blob, contentType);
    } else {
      throw err;
    }
  }
  return outcome;
}

async function main(): Promise<number> {
  if (!storage.isConfigured) {
    logger.error('Storage is not configured (SEAWEEDFS_* env missing).');
    return 1;
  }
  const { current, previous } = getAiKeyEncryptionConfig();
  if (!current) {
    logger.error('AI_KEY_ENCRYPTION_KEY is not set — cannot encrypt stored objects.');
    return 1;
  }
  logger.info(
    dryRun ? 'Dry run: reporting changes without writing.' : 'Encrypting stored objects…',
  );

  for await (const key of storage.listKeys()) {
    try {
      const outcome = await processObject(key, current, previous);
      counts[outcome] += 1;
      if (outcome === 'changed') logger.warn(`Skipped ${key}: changed while processing`);
    } catch (err) {
      counts.failed += 1;
      if (err instanceof StorageDecryptionError) {
        logger.warn(`Failed ${key}: object could not be decrypted`);
      } else {
        logger.warn(`Failed ${key}: ${String(err)}`);
      }
    }
  }

  logger.info(`Summary: ${JSON.stringify(counts)}`);
  return counts.failed > 0 ? 1 : 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error('Storage encryption backfill failed:', err);
    process.exitCode = 1;
  });
