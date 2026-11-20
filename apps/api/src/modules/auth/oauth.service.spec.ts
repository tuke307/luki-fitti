import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'crypto';
import { ConflictException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import type { PrismaService } from '../database/prisma.service';
import type { AuthService } from './auth.service';

// The provider client ids are read into module constants — set them before importing.
process.env.GOOGLE_CLIENT_IDS = 'test-google-client';
process.env.APPLE_CLIENT_IDS = 'test-apple-client';

const { OAuthService } = await import('./oauth.service');

const GOOGLE_ISS = 'https://accounts.google.com';
const APPLE_ISS = 'https://appleid.apple.com';
const sha256Hex = (v: string) => createHash('sha256').update(v, 'utf8').digest('hex');

interface UserRow {
  id: string;
  email: string;
  passwordHash: string | null;
  emailVerified: boolean;
  lockedUntil: Date | null;
  [k: string]: unknown;
}

interface OAuthRow {
  id: string;
  userId: string;
  provider: 'GOOGLE' | 'APPLE';
  providerUserId: string;
  email: string | null;
}

function createOAuthPrisma(users: UserRow[] = [], links: OAuthRow[] = []) {
  const oAuthAccounts = [...links];
  const deletedRefreshFor: string[] = [];
  let seq = links.length;

  const prisma = {
    oAuthAccount: {
      findUnique: async ({
        where,
        include,
      }: {
        where: { provider_providerUserId: { provider: string; providerUserId: string } };
        include?: { user: boolean };
      }) => {
        const w = where.provider_providerUserId;
        const row =
          oAuthAccounts.find(
            (a) => a.provider === w.provider && a.providerUserId === w.providerUserId,
          ) ?? null;
        if (row && include?.user) {
          return { ...row, user: users.find((u) => u.id === row.userId) ?? null };
        }
        return row;
      },
      findMany: async ({ where }: { where: { userId: string } }) =>
        oAuthAccounts.filter((a) => a.userId === where.userId),
      count: async ({ where }: { where: { userId: string; provider?: string } }) =>
        oAuthAccounts.filter(
          (a) => a.userId === where.userId && (!where.provider || a.provider === where.provider),
        ).length,
      create: async ({ data }: { data: Omit<OAuthRow, 'id'> }) => {
        const row = { id: `oa-${++seq}`, ...data };
        oAuthAccounts.push(row);
        return row;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const i = oAuthAccounts.findIndex((a) => a.id === where.id);
        return oAuthAccounts.splice(i, 1)[0];
      },
    },
    user: {
      findUnique: async ({ where }: { where: { email?: string; id?: string } }) => {
        if (where.email) return users.find((u) => u.email === where.email) ?? null;
        return users.find((u) => u.id === where.id) ?? null;
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const u = users.find((x) => x.id === where.id);
        if (!u) throw new Error('Not found');
        Object.assign(u, data);
        return u;
      },
    },
    passkey: {
      count: async () => 0,
    },
    refreshToken: {
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        deletedRefreshFor.push(where.userId);
        return { count: 1 };
      },
    },
  };

  return {
    prisma: prisma as unknown as PrismaService,
    users,
    oAuthAccounts,
    deletedRefreshFor,
  };
}

function createService(users: UserRow[] = [], links: OAuthRow[] = []) {
  const db = createOAuthPrisma(users, links);
  const created: Array<[string, string | null]> = [];
  const authService = {
    createOAuthUser: async (email: string, name: string | null) => {
      created.push([email, name]);
      const u: UserRow = {
        id: `new-${users.length + 1}`,
        email,
        passwordHash: null,
        emailVerified: true,
        lockedUntil: null,
      };
      users.push(u);
      return u;
    },
    toUserDto: async (u: UserRow) => ({ id: u.id, email: u.email }),
  } as unknown as AuthService;
  const service = new OAuthService(db.prisma, authService);
  return { service, db, created };
}

type PrivateKey = Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];

let privateKey: PrivateKey;
let otherPrivateKey: PrivateKey;
let publicJwk: Awaited<ReturnType<typeof exportJWK>>;

before(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  publicJwk = await exportJWK(pair.publicKey);
  publicJwk.kid = 'test-key';
  publicJwk.alg = 'RS256';
  otherPrivateKey = (await generateKeyPair('RS256')).privateKey;
});

function installKeySet(service: InstanceType<typeof OAuthService>) {
  const jwks = createLocalJWKSet({ keys: [publicJwk] });
  service.keySet = () => jwks;
}

function idToken(
  opts: {
    iss?: string;
    aud?: string;
    sub?: string;
    nonce?: string;
    email?: string;
    emailVerified?: boolean;
    expired?: boolean;
    key?: PrivateKey;
  } = {},
) {
  const { iss, aud, expired, key, emailVerified, ...claims } = opts;
  const jwt = new SignJWT({
    nonce: 'raw-nonce-123',
    sub: 'provider-user-1',
    email: 'person@example.com',
    email_verified: emailVerified ?? true,
    ...claims,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(iss ?? GOOGLE_ISS)
    .setAudience(aud ?? 'test-google-client')
    .setIssuedAt()
    .setExpirationTime(expired ? '1s ago' : '5m');
  if (expired) jwt.setIssuedAt(Math.floor(Date.now() / 1000) - 3600);
  return jwt.sign(key ?? privateKey);
}

const dto = (token: string, nonce = 'raw-nonce-123') => ({ idToken: token, nonce });

describe('OAuthService.verifyIdToken', () => {
  it('accepts a valid Google token with a raw nonce', async () => {
    const { service } = createService();
    installKeySet(service);
    const claims = await service.verifyIdToken('google', dto(await idToken()));
    assert.equal(claims.sub, 'provider-user-1');
    assert.equal(claims.email, 'person@example.com');
    assert.equal(claims.emailVerified, true);
  });

  it('accepts an Apple token whose nonce claim is the sha256 of the dto nonce', async () => {
    const { service } = createService();
    installKeySet(service);
    const token = await idToken({
      iss: APPLE_ISS,
      aud: 'test-apple-client',
      nonce: sha256Hex('raw-nonce-123'),
    });
    const claims = await service.verifyIdToken('apple', dto(token));
    assert.equal(claims.sub, 'provider-user-1');
  });

  it('rejects missing or mismatched nonces', async () => {
    const { service } = createService();
    installKeySet(service);
    const noNonce = await idToken({ nonce: undefined });
    const token = await new SignJWT({ sub: 'x', email_verified: true })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer(GOOGLE_ISS)
      .setAudience('test-google-client')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(privateKey);
    await assert.rejects(() => service.verifyIdToken('google', dto(token)), UnauthorizedException);
    await assert.rejects(
      () => service.verifyIdToken('google', { idToken: noNonce as never, nonce: 'other-nonce-xx' }),
      UnauthorizedException,
    );
  });

  it('rejects wrong audience, wrong issuer, expired and foreign-key tokens', async () => {
    const { service } = createService();
    installKeySet(service);
    await assert.rejects(
      () => idToken({ aud: 'someone-else' }).then((t) => service.verifyIdToken('google', dto(t))),
      UnauthorizedException,
    );
    await assert.rejects(
      () =>
        idToken({ iss: 'https://evil.example.com' }).then((t) =>
          service.verifyIdToken('google', dto(t)),
        ),
      UnauthorizedException,
    );
    await assert.rejects(
      () => idToken({ expired: true }).then((t) => service.verifyIdToken('google', dto(t))),
      UnauthorizedException,
    );
    await assert.rejects(
      () => idToken({ key: otherPrivateKey }).then((t) => service.verifyIdToken('google', dto(t))),
      UnauthorizedException,
    );
  });
});

describe('OAuthService.signIn', () => {
  it('returns the already-linked user without creating anything', async () => {
    const user: UserRow = {
      id: 'u1',
      email: 'person@example.com',
      passwordHash: 'hash',
      emailVerified: true,
      lockedUntil: null,
    };
    const link: OAuthRow = {
      id: 'oa-1',
      userId: 'u1',
      provider: 'GOOGLE',
      providerUserId: 'provider-user-1',
      email: 'person@example.com',
    };
    const { service, db } = createService([user], [link]);
    installKeySet(service);
    const result = await service.signIn('google', dto(await idToken()));
    assert.equal(result.id, 'u1');
    assert.equal(db.oAuthAccounts.length, 1);
  });

  it('rejects sign-in when the provider email is unverified and no link exists', async () => {
    const { service } = createService();
    installKeySet(service);
    const token = await idToken({ emailVerified: false });
    await assert.rejects(() => service.signIn('google', dto(token)), ForbiddenException);
  });

  it('links a verified provider email to a matching verified user and keeps the password', async () => {
    const user: UserRow = {
      id: 'u1',
      email: 'person@example.com',
      passwordHash: 'hash',
      emailVerified: true,
      lockedUntil: null,
    };
    const { service, db } = createService([user]);
    installKeySet(service);
    const result = await service.signIn('google', dto(await idToken()));
    assert.equal(result.id, 'u1');
    assert.equal(db.oAuthAccounts.length, 1);
    assert.equal(db.oAuthAccounts[0]!.userId, 'u1');
    assert.equal(db.users[0]!.passwordHash, 'hash');
    assert.equal(db.deletedRefreshFor.length, 0);
  });

  it('wipes password + sessions of an unverified user before linking (pre-hijacking)', async () => {
    const user: UserRow = {
      id: 'u1',
      email: 'person@example.com',
      passwordHash: 'hash',
      emailVerified: false,
      emailVerificationToken: 'tok',
      passwordResetToken: 'rst',
      lockedUntil: null,
    };
    const { service, db } = createService([user]);
    installKeySet(service);
    await service.signIn('google', dto(await idToken()));
    assert.equal(db.users[0]!.passwordHash, null);
    assert.equal(db.users[0]!.emailVerificationToken, null);
    assert.equal(db.users[0]!.passwordResetToken, null);
    assert.deepEqual(db.deletedRefreshFor, ['u1']);
    assert.equal(db.oAuthAccounts[0]!.userId, 'u1');
  });

  it('creates a user via authService.createOAuthUser when nothing matches', async () => {
    const { service, created } = createService();
    installKeySet(service);
    const result = await service.signIn('google', dto(await idToken()));
    assert.deepEqual(created, [['person@example.com', null]]);
    assert.equal(result.email, 'person@example.com');
  });

  it('rejects sign-in for a locked account', async () => {
    const user: UserRow = {
      id: 'u1',
      email: 'person@example.com',
      passwordHash: 'hash',
      emailVerified: true,
      lockedUntil: new Date(Date.now() + 60_000),
    };
    const link: OAuthRow = {
      id: 'oa-1',
      userId: 'u1',
      provider: 'GOOGLE',
      providerUserId: 'provider-user-1',
      email: 'person@example.com',
    };
    const { service } = createService([user], [link]);
    installKeySet(service);
    const token = await idToken();
    await assert.rejects(() => service.signIn('google', dto(token)), ForbiddenException);
  });
});

describe('OAuthService.link / unlink', () => {
  const sub = 'provider-user-1';

  it('throws Conflict when the account is linked to another user; no-ops for the same user', async () => {
    const link: OAuthRow = {
      id: 'oa-1',
      userId: 'other-user',
      provider: 'GOOGLE',
      providerUserId: sub,
      email: null,
    };
    const { service } = createService([], [link]);
    installKeySet(service);
    const token = await idToken();
    await assert.rejects(() => service.link('u1', 'google', dto(token)), ConflictException);
    link.userId = 'u1';
    await service.link('u1', 'google', dto(token));
  });

  it('rejects a second account of the same provider', async () => {
    const link: OAuthRow = {
      id: 'oa-1',
      userId: 'u1',
      provider: 'GOOGLE',
      providerUserId: 'another-sub',
      email: null,
    };
    const { service } = createService([], [link]);
    installKeySet(service);
    const token = await idToken();
    await assert.rejects(() => service.link('u1', 'google', dto(token)), /already linked/i);
  });

  it('unlink refuses to remove the last sign-in method but allows it with a password', async () => {
    const user: UserRow = {
      id: 'u1',
      email: 'p@x.c',
      passwordHash: null,
      emailVerified: true,
      lockedUntil: null,
    };
    const link: OAuthRow = {
      id: 'oa-1',
      userId: 'u1',
      provider: 'GOOGLE',
      providerUserId: sub,
      email: null,
    };
    const { service, db } = createService([user], [link]);
    await assert.rejects(() => service.unlink('u1', 'google'), ConflictException);

    user.passwordHash = 'hash';
    await service.unlink('u1', 'google');
    assert.equal(db.oAuthAccounts.length, 0);
  });
});
