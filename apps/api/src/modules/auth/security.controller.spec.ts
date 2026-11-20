import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SecurityController } from './security.controller';
import { generateMfaToken, generateAccessToken } from '@/utils/jwt.util';
import type { PrismaService } from '../database/prisma.service';
import type { AuthService } from './auth.service';
import type { RefreshTokenService } from './refresh-token.service';
import type { OAuthService } from './oauth.service';
import type { PasskeyService } from './passkey.service';
import type { TwoFactorService } from './two-factor.service';

const user = { id: 'u1', email: 'u1@example.com', name: null };

function createReq() {
  const headers: Record<string, string> = {};
  return {
    headers,
    cookies: {},
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

function createRes() {
  const res = { cookie: () => undefined, clearCookie: () => undefined } as unknown as Response;
  return res;
}

function createController(opts: { twoFactorEnabled?: boolean; verifyResult?: boolean } = {}) {
  const sessionCreates: unknown[] = [];
  const prisma = {} as unknown as PrismaService;
  const authService = {
    getUserById: async (id: string) => (id === user.id ? user : null),
  } as unknown as AuthService;
  const refreshTokens = {
    create: async (data: unknown) => {
      sessionCreates.push(data);
      return {};
    },
  } as unknown as RefreshTokenService;
  const oauth = {
    signIn: async () => user,
  } as unknown as OAuthService;
  const passkeys = {
    verifyLogin: async () => user.id,
  } as unknown as PasskeyService;
  const twoFactor = {
    isEnabled: async () => opts.twoFactorEnabled ?? false,
    verify: async () => opts.verifyResult ?? true,
  } as unknown as TwoFactorService;

  const controller = new SecurityController(
    prisma,
    authService,
    refreshTokens,
    oauth,
    passkeys,
    twoFactor,
  );
  return { controller, sessionCreates };
}

describe('SecurityController.verifyTwoFactor', () => {
  it('rejects a garbage mfaToken', async () => {
    const { controller } = createController();
    await assert.rejects(
      () =>
        controller.verifyTwoFactor(
          { mfaToken: 'garbage-token-value', code: '123456' },
          createReq(),
          createRes(),
        ),
      UnauthorizedException,
    );
  });

  it('rejects an access token presented as an mfaToken', async () => {
    const { controller } = createController();
    const access = generateAccessToken(user);
    await assert.rejects(
      () =>
        controller.verifyTwoFactor({ mfaToken: access, code: '123456' }, createReq(), createRes()),
      UnauthorizedException,
    );
  });

  it('rejects a valid mfaToken when the second factor fails', async () => {
    const { controller, sessionCreates } = createController({ verifyResult: false });
    await assert.rejects(
      () =>
        controller.verifyTwoFactor(
          { mfaToken: generateMfaToken(user.id), code: '000000' },
          createReq(),
          createRes(),
        ),
      UnauthorizedException,
    );
    assert.equal(sessionCreates.length, 0);
  });

  it('issues a session for a valid mfaToken + code', async () => {
    const { controller, sessionCreates } = createController({ verifyResult: true });
    const result = await controller.verifyTwoFactor(
      { mfaToken: generateMfaToken(user.id), code: '123456' },
      createReq(),
      createRes(),
    );
    assert.equal(sessionCreates.length, 1);
    assert.ok((result as { tokens?: { accessToken: string } }).tokens?.accessToken);
  });
});

describe('SecurityController oauth/passkey login MFA handling', () => {
  it('oauthLogin returns mfaRequired instead of a session when 2FA is on', async () => {
    const { controller, sessionCreates } = createController({ twoFactorEnabled: true });
    const result = await controller.oauthLogin(
      'google',
      { idToken: 'x'.repeat(30), nonce: 'nonce-1234' },
      createReq(),
      createRes(),
    );
    assert.deepEqual(Object.keys(result as object).sort(), ['mfaRequired', 'mfaToken']);
    assert.equal((result as { mfaRequired: boolean }).mfaRequired, true);
    assert.equal(sessionCreates.length, 0);
  });

  it('oauthLogin issues a session when 2FA is off', async () => {
    const { controller, sessionCreates } = createController({ twoFactorEnabled: false });
    const result = await controller.oauthLogin(
      'google',
      { idToken: 'x'.repeat(30), nonce: 'nonce-1234' },
      createReq(),
      createRes(),
    );
    assert.equal(sessionCreates.length, 1);
    assert.ok((result as { tokens?: unknown }).tokens);
  });

  it('passkeyLoginVerify skips MFA even when 2FA is enabled', async () => {
    const { controller, sessionCreates } = createController({ twoFactorEnabled: true });
    const result = await controller.passkeyLoginVerify(
      { challengeId: 'c'.repeat(20), response: { id: 'cred' } },
      createReq(),
      createRes(),
    );
    assert.equal(sessionCreates.length, 1);
    assert.ok((result as { tokens?: unknown }).tokens);
  });
});
