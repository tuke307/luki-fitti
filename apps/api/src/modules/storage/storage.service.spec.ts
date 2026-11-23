import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import type { AiKeyEncryptionConfig } from '@/config/env.config';
import { StorageService } from './storage.service';
import { encryptObject, isEncryptedObject } from './storage-crypto';

const master = { version: 1, key: crypto.randomBytes(32) };
const WITH_KEY: AiKeyEncryptionConfig = { current: master, previous: null };
const NO_KEY: AiKeyEncryptionConfig = { current: null, previous: null };

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);

interface SentCommand {
  name: string;
  input: Record<string, unknown>;
}

function fakeS3(getResult?: {
  body: Buffer;
  contentType?: string;
  metadata?: Record<string, string>;
  eTag?: string;
}) {
  const sent: SentCommand[] = [];
  const client = {
    sent,
    send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      sent.push({ name: command.constructor.name, input: command.input });
      if (command instanceof GetObjectCommand) {
        return {
          Body: { transformToByteArray: async () => new Uint8Array(getResult?.body ?? JPEG) },
          ContentType: getResult?.contentType,
          Metadata: getResult?.metadata,
          ETag: getResult?.eTag,
        };
      }
      if (command instanceof ListObjectsV2Command) return { Contents: [], IsTruncated: false };
      if (command instanceof HeadObjectCommand) return { ETag: getResult?.eTag };
      return {};
    },
  };
  return client;
}

function makeService(config: AiKeyEncryptionConfig, client: ReturnType<typeof fakeS3>) {
  class TestStorageService extends StorageService {
    override get isConfigured() {
      return true;
    }
    protected override encryptionConfig() {
      return config;
    }
  }
  const service = new TestStorageService();
  // Bypass S3 client construction and bucket creation.
  (service as unknown as { client: unknown }).client = client;
  (service as unknown as { bucketReady: Promise<void> }).bucketReady = Promise.resolve();
  return service;
}

describe('StorageService', () => {
  it('put() uploads an encrypted blob with octet-stream type and metadata', async () => {
    const client = fakeS3();
    const service = makeService(WITH_KEY, client);
    await service.put('meals/u1/p.jpg', JPEG, 'image/jpeg');
    const put = client.sent.find((c) => c.name === 'PutObjectCommand');
    assert.ok(put);
    assert.equal(put.input['ContentType'], 'application/octet-stream');
    assert.deepEqual(put.input['Metadata'], { 'content-type': 'image/jpeg', enc: 'lfe1' });
    const body = put.input['Body'] as Buffer;
    assert.ok(isEncryptedObject(body));
    assert.ok(!body.equals(JPEG));
  });

  it('put() refuses to store plaintext when no encryption key is configured', async () => {
    const client = fakeS3();
    const service = makeService(NO_KEY, client);
    await assert.rejects(
      () => service.put('meals/u1/p.jpg', JPEG, 'image/jpeg'),
      ServiceUnavailableException,
    );
    assert.equal(client.sent.length, 0);
  });

  it('get() decrypts encrypted objects and returns the metadata content type', async () => {
    const blob = encryptObject(JPEG, 'meals/u1/p.jpg', master);
    const client = fakeS3({
      body: blob,
      contentType: 'application/octet-stream',
      metadata: { 'content-type': 'image/png', enc: 'lfe1' },
    });
    const service = makeService(WITH_KEY, client);
    const result = await service.get('meals/u1/p.jpg');
    assert.deepEqual(result.body, JPEG);
    assert.equal(result.contentType, 'image/png');
  });

  it('get() passes legacy plaintext objects through with their content type', async () => {
    const client = fakeS3({ body: JPEG, contentType: 'image/jpeg' });
    const service = makeService(WITH_KEY, client);
    const result = await service.get('meals/u1/old.jpg');
    assert.deepEqual(result.body, JPEG);
    assert.equal(result.contentType, 'image/jpeg');
  });

  it('get() maps decryption failures to a generic 503', async () => {
    // Encrypted under a different key.
    const blob = encryptObject(JPEG, 'meals/u1/p.jpg', {
      version: 9,
      key: crypto.randomBytes(32),
    });
    const client = fakeS3({ body: blob });
    const service = makeService(WITH_KEY, client);
    await assert.rejects(() => service.get('meals/u1/p.jpg'), ServiceUnavailableException);
  });
});
