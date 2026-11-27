import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { exportPKCS8, generateKeyPair } from 'jose';
import type { PrismaService } from '../database/prisma.service';
import { decryptSecret } from '@/utils/secret-box.util';

// env.config reads these at import time — set before importing the service.
process.env.TWO_FACTOR_ENCRYPTION_KEY ??= 'test-only-two-factor-key-not-a-real-secret';
const { AppleTokenService } = await import('./apple-token.service');

interface UpdateCall {
  id: string;
  data: { refreshTokenEnc?: string; tokenClientId?: string };
}

function prismaMock() {
  const updates: UpdateCall[] = [];
  const prisma = {
    oAuthAccount: {
      update: async ({ where, data }: { where: { id: string }; data: UpdateCall['data'] }) => {
        updates.push({ id: where.id, data });
        return { id: where.id, ...data };
      },
    },
  } as unknown as PrismaService;
  return { prisma, updates };
}

async function configuredService(prisma: PrismaService) {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  const p8 = await exportPKCS8(privateKey);
  const service = new AppleTokenService(prisma);
  service.config = {
    teamId: 'TEAMID1234',
    keyId: 'KEYID12345',
    keyP8Base64: Buffer.from(p8).toString('base64'),
  };
  return service;
}

function fakeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as Response;
}

describe('AppleTokenService', () => {
  it('exchanges the authorization code and stores an encrypted refresh token + client id', async () => {
    const { prisma, updates } = prismaMock();
    const service = await configuredService(prisma);
    const calls: { url: string; form: URLSearchParams }[] = [];
    service.fetchImpl = async (url, init) => {
      calls.push({
        url: String(url),
        form: new URLSearchParams(String((init as RequestInit).body)),
      });
      return fakeResponse({ refresh_token: 'FAKE-REFRESH-TOKEN-123' });
    };

    await service.storeFromCode('oauth-1', 'FAKE-AUTH-CODE', 'com.lukifitti.ios');

    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.url, 'https://appleid.apple.com/auth/token');
    assert.equal(calls[0]!.form.get('grant_type'), 'authorization_code');
    assert.equal(calls[0]!.form.get('code'), 'FAKE-AUTH-CODE');
    assert.equal(calls[0]!.form.get('client_id'), 'com.lukifitti.ios');
    assert.ok(calls[0]!.form.get('client_secret'));

    assert.equal(updates.length, 1);
    assert.equal(updates[0]!.id, 'oauth-1');
    assert.equal(updates[0]!.data.tokenClientId, 'com.lukifitti.ios');
    const enc = updates[0]!.data.refreshTokenEnc!;
    assert.notEqual(enc, 'FAKE-REFRESH-TOKEN-123');
    assert.ok(enc.startsWith('v1.'));
    assert.equal(decryptSecret(enc), 'FAKE-REFRESH-TOKEN-123');
  });

  it('posts the decrypted refresh token to the revoke endpoint with the stored client id', async () => {
    const { prisma, updates } = prismaMock();
    const service = await configuredService(prisma);
    const calls: { url: string; form: URLSearchParams }[] = [];
    service.fetchImpl = async (url, init) => {
      calls.push({
        url: String(url),
        form: new URLSearchParams(String((init as RequestInit).body)),
      });
      return fakeResponse(
        String(url).endsWith('/auth/token') ? { refresh_token: 'FAKE-REFRESH-TOKEN-123' } : {},
      );
    };

    await service.storeFromCode('oauth-1', 'FAKE-AUTH-CODE', 'com.lukifitti.ios');
    const enc = updates[0]!.data.refreshTokenEnc!;

    await service.revokeFor({ refreshTokenEnc: enc, tokenClientId: 'com.lukifitti.ios' });

    assert.equal(calls.length, 2);
    assert.equal(calls[1]!.url, 'https://appleid.apple.com/auth/revoke');
    assert.equal(calls[1]!.form.get('token'), 'FAKE-REFRESH-TOKEN-123');
    assert.equal(calls[1]!.form.get('token_type_hint'), 'refresh_token');
    assert.equal(calls[1]!.form.get('client_id'), 'com.lukifitti.ios');
    assert.ok(calls[1]!.form.get('client_secret'));
  });

  it('never throws on exchange or revoke failures', async () => {
    const { prisma, updates } = prismaMock();
    const service = await configuredService(prisma);
    service.fetchImpl = async () => {
      throw new Error('network down');
    };

    await service.storeFromCode('oauth-1', 'FAKE-AUTH-CODE', 'com.lukifitti.ios');
    assert.equal(updates.length, 0);

    await service.revokeFor({ refreshTokenEnc: 'v1.invalid', tokenClientId: 'x' });
    // decrypt throws inside the try -> logged, swallowed
    await service.revokeFor({ refreshTokenEnc: null, tokenClientId: null });
  });

  it('is unconfigured without all three env values', () => {
    const service = new AppleTokenService(prismaMock().prisma);
    service.config = { teamId: '', keyId: 'k', keyP8Base64: 'k' };
    assert.equal(service.isConfigured(), false);
  });
});
