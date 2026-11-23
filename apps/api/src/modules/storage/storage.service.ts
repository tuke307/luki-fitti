import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { logger } from '@luki-fitti/logger';
import {
  getAiKeyEncryptionConfig,
  SEAWEEDFS_ACCESS_KEY_API,
  SEAWEEDFS_BUCKET,
  SEAWEEDFS_ENDPOINT,
  SEAWEEDFS_PORT,
  SEAWEEDFS_SECRET_KEY_API,
  SEAWEEDFS_USE_SSL,
  type AiKeyEncryptionConfig,
} from '@/config/env.config';
import { decryptObject, encryptObject, isEncryptedObject } from './storage-crypto';

const LEGACY_WARN_CAP = 1000;

/**
 * Private S3-compatible object storage (SeaweedFS in compose). Objects are never public:
 * the API streams them to their owner after an ownership check. Objects are additionally
 * encrypted with AES-256-GCM before upload (see storage-crypto.ts) so nobody with access to
 * the storage server itself — filer UI, S3 credentials, disks, backups — can view them.
 */
@Injectable()
export class StorageService {
  private client: S3Client | null = null;
  private bucketReady: Promise<void> | null = null;
  private legacyWarned = new Set<string>();

  get isConfigured(): boolean {
    return SEAWEEDFS_ENDPOINT.length > 0 && SEAWEEDFS_ACCESS_KEY_API.length > 0;
  }

  /** Overridable in tests so specs don't depend on process env. */
  protected encryptionConfig(): AiKeyEncryptionConfig {
    return getAiKeyEncryptionConfig();
  }

  private getClient(): S3Client {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('Photo storage is not configured');
    }
    this.client ??= new S3Client({
      endpoint: `${SEAWEEDFS_USE_SSL ? 'https' : 'http'}://${SEAWEEDFS_ENDPOINT}:${SEAWEEDFS_PORT}`,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: {
        accessKeyId: SEAWEEDFS_ACCESS_KEY_API,
        secretAccessKey: SEAWEEDFS_SECRET_KEY_API,
      },
    });
    return this.client;
  }

  private ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      const client = this.getClient();
      try {
        await client.send(new HeadBucketCommand({ Bucket: SEAWEEDFS_BUCKET }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: SEAWEEDFS_BUCKET }));
        logger.info(`Created storage bucket ${SEAWEEDFS_BUCKET}`);
      }
    })().catch((err: unknown) => {
      this.bucketReady = null;
      throw err;
    });
    return this.bucketReady;
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const master = this.encryptionConfig().current;
    if (!master) {
      // Never store plaintext: refuse the upload when encryption isn't configured.
      throw new ServiceUnavailableException('Photo storage encryption is not configured');
    }
    await this.ensureBucket();
    await this.putEncrypted(key, encryptObject(body, key, master), contentType);
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string }> {
    const raw = await this.getRaw(key);
    if (isEncryptedObject(raw.body)) {
      const { current, previous } = this.encryptionConfig();
      try {
        const { plaintext } = decryptObject(raw.body, key, current, previous);
        return { body: plaintext, contentType: raw.metadata?.['content-type'] ?? 'image/jpeg' };
      } catch {
        logger.warn(`Failed to decrypt stored object ${key}`);
        throw new ServiceUnavailableException('Photo unavailable');
      }
    }
    // Legacy plaintext object, stored before encryption was rolled out.
    if (this.legacyWarned.size >= LEGACY_WARN_CAP) this.legacyWarned.clear();
    if (!this.legacyWarned.has(key)) {
      this.legacyWarned.add(key);
      logger.warn(`Serving unencrypted legacy object ${key}; run the storage backfill`);
    }
    return { body: raw.body, contentType: raw.contentType ?? 'image/jpeg' };
  }

  /** Best-effort bulk delete; failures are logged, never thrown (DB rows are already gone). */
  async deleteMany(keys: string[]): Promise<void> {
    if (!this.isConfigured || keys.length === 0) return;
    try {
      for (let i = 0; i < keys.length; i += 1000) {
        await this.getClient().send(
          new DeleteObjectsCommand({
            Bucket: SEAWEEDFS_BUCKET,
            Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }
    } catch (err) {
      logger.warn(`Failed to delete ${keys.length} stored object(s): ${String(err)}`);
    }
  }

  // --- Backfill support (scripts/encrypt-storage-objects.ts) ---

  /** Pages through every object key in the bucket. */
  async *listKeys(): AsyncGenerator<string> {
    const client = this.getClient();
    let continuationToken: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: SEAWEEDFS_BUCKET,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of page.Contents ?? []) {
        if (obj.Key) yield obj.Key;
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  async getRaw(key: string): Promise<{
    body: Buffer;
    eTag: string | undefined;
    contentType: string | undefined;
    metadata: Record<string, string> | undefined;
  }> {
    const result = await this.getClient().send(
      new GetObjectCommand({ Bucket: SEAWEEDFS_BUCKET, Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new ServiceUnavailableException('Photo unavailable');
    return {
      body: Buffer.from(bytes),
      eTag: result.ETag,
      contentType: result.ContentType,
      metadata: result.Metadata,
    };
  }

  async headEtag(key: string): Promise<string | undefined> {
    const result = await this.getClient().send(
      new HeadObjectCommand({ Bucket: SEAWEEDFS_BUCKET, Key: key }),
    );
    return result.ETag;
  }

  async putEncrypted(
    key: string,
    blob: Buffer,
    contentType: string,
    ifMatch?: string,
  ): Promise<void> {
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: SEAWEEDFS_BUCKET,
        Key: key,
        Body: blob,
        ContentType: 'application/octet-stream',
        Metadata: { 'content-type': contentType, enc: 'lfe1' },
        ...(ifMatch ? { IfMatch: ifMatch } : {}),
      }),
    );
  }
}
