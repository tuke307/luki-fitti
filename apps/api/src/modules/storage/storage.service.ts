import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { logger } from '@luki-fitti/logger';
import {
  SEAWEEDFS_ACCESS_KEY_API,
  SEAWEEDFS_BUCKET,
  SEAWEEDFS_ENDPOINT,
  SEAWEEDFS_PORT,
  SEAWEEDFS_SECRET_KEY_API,
  SEAWEEDFS_USE_SSL,
} from '@/config/env.config';

/**
 * Private S3-compatible object storage (SeaweedFS in compose). Objects are never public:
 * the API streams them to their owner after an ownership check.
 */
@Injectable()
export class StorageService {
  private client: S3Client | null = null;
  private bucketReady: Promise<void> | null = null;

  get isConfigured(): boolean {
    return SEAWEEDFS_ENDPOINT.length > 0 && SEAWEEDFS_ACCESS_KEY_API.length > 0;
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
    await this.ensureBucket();
    await this.getClient().send(
      new PutObjectCommand({
        Bucket: SEAWEEDFS_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string }> {
    const result = await this.getClient().send(
      new GetObjectCommand({ Bucket: SEAWEEDFS_BUCKET, Key: key }),
    );
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new ServiceUnavailableException('Photo unavailable');
    return { body: Buffer.from(bytes), contentType: result.ContentType ?? 'image/jpeg' };
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
}
