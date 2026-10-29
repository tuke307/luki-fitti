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
  S3_ACCESS_KEY_ID,
  S3_BUCKET,
  S3_ENDPOINT,
  S3_FORCE_PATH_STYLE,
  S3_REGION,
  S3_SECRET_ACCESS_KEY,
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
    return S3_ENDPOINT.length > 0 && S3_ACCESS_KEY_ID.length > 0;
  }

  private getClient(): S3Client {
    if (!this.isConfigured) {
      throw new ServiceUnavailableException('Photo storage is not configured');
    }
    this.client ??= new S3Client({
      endpoint: S3_ENDPOINT,
      region: S3_REGION,
      forcePathStyle: S3_FORCE_PATH_STYLE,
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    });
    return this.client;
  }

  private ensureBucket(): Promise<void> {
    this.bucketReady ??= (async () => {
      const client = this.getClient();
      try {
        await client.send(new HeadBucketCommand({ Bucket: S3_BUCKET }));
      } catch {
        await client.send(new CreateBucketCommand({ Bucket: S3_BUCKET }));
        logger.info(`Created storage bucket ${S3_BUCKET}`);
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
      new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async get(key: string): Promise<{ body: Buffer; contentType: string }> {
    const result = await this.getClient().send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: key }));
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
            Bucket: S3_BUCKET,
            Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
          }),
        );
      }
    } catch (err) {
      logger.warn(`Failed to delete ${keys.length} stored object(s): ${String(err)}`);
    }
  }
}
