import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import type { ExecutionContext } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard, extractBearerToken } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { generateAccessToken } from '@/utils/jwt.util';
import type { PrismaService } from '../database/prisma.service';
import type { EmailService } from '../email/email.service';
import { EmailTemplateService } from '../email-template/email-template.service';
import { DistanceUnit, EmailTemplateType, WeightUnit } from '@luki-fitti/common/enums';

interface MockUserRecord {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  emailVerified: boolean;
  emailVerificationToken: string | null;
  emailVerificationExpires: Date | null;
  passwordResetToken: string | null;
  passwordResetExpires: Date | null;
  accountDeletionToken: string | null;
  accountDeletionExpires: Date | null;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  preferences: {
    id: string;
    userId: string;
    weightUnit: WeightUnit;
    distanceUnit: DistanceUnit;
    defaultRestSeconds: number;
    theme: string;
    restTimerSound: boolean;
    weeklyGoalSessions: number;
  };
}

function createMockPrisma() {
  const users = new Map<string, MockUserRecord>();
  const refreshTokens: unknown[] = [];

  const prisma = {
    exercise: {
      count: async () => 50,
      upsert: async () => ({}),
    },
    user: {
      findUnique: async ({ where }: { where: Record<string, string | undefined> }) => {
        if (where.email) {
          return Array.from(users.values()).find((u) => u.email === where.email) ?? null;
        }
        if (where.emailVerificationToken) {
          return (
            Array.from(users.values()).find(
              (u) => u.emailVerificationToken === where.emailVerificationToken,
            ) ?? null
          );
        }
        if (where.passwordResetToken) {
          return (
            Array.from(users.values()).find(
              (u) => u.passwordResetToken === where.passwordResetToken,
            ) ?? null
          );
        }
        if (where.accountDeletionToken) {
          return (
            Array.from(users.values()).find(
              (u) => u.accountDeletionToken === where.accountDeletionToken,
            ) ?? null
          );
        }
        if (where.id) {
          return users.get(where.id) ?? null;
        }
        return null;
      },
      create: async ({
        data,
      }: {
        data: {
          email: string;
          name?: string | null;
          passwordHash: string;
          emailVerified?: boolean;
          emailVerificationToken?: string | null;
          emailVerificationExpires?: Date | null;
          passwordResetToken?: string | null;
          passwordResetExpires?: Date | null;
          lastLoginAt?: Date | null;
          preferences?: { create?: { weightUnit?: WeightUnit } };
        };
      }) => {
        const id = `user-${users.size + 1}`;
        const user: MockUserRecord = {
          id,
          email: data.email,
          name: data.name ?? null,
          passwordHash: data.passwordHash,
          emailVerified: data.emailVerified ?? true,
          emailVerificationToken: data.emailVerificationToken ?? null,
          emailVerificationExpires: data.emailVerificationExpires ?? null,
          passwordResetToken: data.passwordResetToken ?? null,
          passwordResetExpires: data.passwordResetExpires ?? null,
          accountDeletionToken: null,
          accountDeletionExpires: null,
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: data.lastLoginAt ?? new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          preferences: {
            id: `pref-${id}`,
            userId: id,
            weightUnit: data.preferences?.create?.weightUnit ?? WeightUnit.KG,
            distanceUnit: DistanceUnit.KM,
            defaultRestSeconds: 90,
            theme: 'dark',
            restTimerSound: true,
            weeklyGoalSessions: 4,
          },
        };
        users.set(id, user);
        return user;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<MockUserRecord>;
      }) => {
        const u = users.get(where.id);
        if (!u) throw new Error('Not found');
        Object.assign(u, data);
        return u;
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const u = users.get(where.id);
        if (!u) throw new Error('Not found');
        users.delete(where.id);
        return u;
      },
    },
    workoutFolder: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'folder-1', ...data }),
    },
    workoutTemplate: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'tpl-1', ...data }),
    },
    workoutTemplateExercise: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'tple-1', ...data }),
    },
    stretchingRoutine: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'sr-1', ...data }),
    },
    stretchingRoutineExercise: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({ id: 'sre-1', ...data }),
    },
    refreshToken: {
      deleteMany: async () => ({ count: refreshTokens.length }),
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(prisma),
  };

  return prisma as unknown as PrismaService;
}

describe('AuthService — Registration, Authentication & Brute-Force Protection', () => {
  it('registers a new account, hashes password with bcrypt, and initializes preferences', async () => {
    const prisma = createMockPrisma();
    const service = new AuthService(prisma);

    const registered = await service.registerUser({
      email: 'GymBuddy@LukiFitti.de',
      password: 'FAKE-PASSWORD-TEST-123',
      name: 'GymBuddy',
      weightUnit: WeightUnit.KG,
    });

    assert.equal(registered.email, 'gymbuddy@lukifitti.de');
    assert.equal(registered.name, 'GymBuddy');
    assert.equal(registered.preferences?.weightUnit, WeightUnit.KG);

    const dbUser = await prisma.user.findUnique({ where: { id: registered.id } });
    assert.ok(dbUser);
    assert.notEqual(dbUser.passwordHash, 'FAKE-PASSWORD-TEST-123');
    const valid = await bcrypt.compare('FAKE-PASSWORD-TEST-123', dbUser.passwordHash);
    assert.equal(valid, true);
  });

  it('rejects duplicate email registration with ConflictException', async () => {
    const prisma = createMockPrisma();
    const service = new AuthService(prisma);

    await service.registerUser({
      email: 'gymbuddy@example.com',
      password: 'FAKE-PASSWORD-TEST-123',
    });

    await assert.rejects(
      () =>
        service.registerUser({
          email: 'GYMBUDDY@example.com',
          password: 'FAKE-PASSWORD-TEST-456',
        }),
      /already exists/i,
    );
  });

  it('locks the account after 5 consecutive failed login attempts to prevent brute force', async () => {
    const prisma = createMockPrisma();
    const service = new AuthService(prisma);

    await service.registerUser({
      email: 'athlete@example.com',
      password: 'FAKE-PASSWORD-TEST-123',
    });

    for (let i = 0; i < 5; i++) {
      await assert.rejects(
        () => service.authenticateUser('athlete@example.com', 'WRONG-PASSWORD-999'),
        /Invalid email or password/i,
      );
    }

    // 6th attempt even with correct password must be rejected while locked
    await assert.rejects(
      () => service.authenticateUser('athlete@example.com', 'FAKE-PASSWORD-TEST-123'),
      /Account temporarily locked/i,
    );
  });

  it('requires email confirmation before sign-in and supports password reset via token', async () => {
    const prisma = createMockPrisma();
    let capturedVerificationToken = '';
    let capturedResetToken = '';
    const mockEmailService = {
      enqueueAccountConfirmationEmail: async (_user: unknown, rawToken: string) => {
        capturedVerificationToken = rawToken;
      },
      enqueuePasswordResetEmail: async (_user: unknown, rawToken: string) => {
        capturedResetToken = rawToken;
      },
    } as unknown as EmailService;

    const service = new AuthService(prisma, mockEmailService);

    const registered = await service.registerUser({
      email: 'newathlete@lukifitti.de',
      password: 'FAKE-PASSWORD-TEST-123',
      name: 'NewAthlete',
    });

    assert.equal(registered.requiresEmailConfirmation, true);
    assert.equal(registered.emailVerified, false);
    assert.equal(capturedVerificationToken.length > 20, true);

    // Sign in before email confirmation is rejected
    await assert.rejects(
      () => service.authenticateUser('newathlete@lukifitti.de', 'FAKE-PASSWORD-TEST-123'),
      /confirm your email address/i,
    );

    // Confirm email with raw token
    const verifiedUser = await service.verifyEmail(capturedVerificationToken);
    assert.equal(verifiedUser.emailVerified, true);

    // Sign in now succeeds
    const loggedIn = await service.authenticateUser(
      'newathlete@lukifitti.de',
      'FAKE-PASSWORD-TEST-123',
    );
    assert.equal(loggedIn.email, 'newathlete@lukifitti.de');

    // Forgot password + Reset password flow
    await service.requestPasswordReset('newathlete@lukifitti.de');
    assert.equal(capturedResetToken.length > 20, true);

    await service.resetPassword(capturedResetToken, 'NEW-FAKE-PASS-789');

    // Old password rejected, new password succeeds
    await assert.rejects(
      () => service.authenticateUser('newathlete@lukifitti.de', 'FAKE-PASSWORD-TEST-123'),
      /Invalid email or password/i,
    );
    const loggedInWithNewPass = await service.authenticateUser(
      'newathlete@lukifitti.de',
      'NEW-FAKE-PASS-789',
    );
    assert.equal(loggedInWithNewPass.email, 'newathlete@lukifitti.de');
  });

  it('requires password to request account deletion email and only deletes account after token confirmation', async () => {
    const prisma = createMockPrisma();
    let capturedDeletionToken = '';
    let deletionEmailRecipient = '';
    const mockEmailService = {
      enqueueAccountConfirmationEmail: async () => undefined,
      enqueueAccountDeletionEmail: async (
        user: { id: string; email: string; name?: string | null },
        rawToken: string,
      ) => {
        deletionEmailRecipient = user.email;
        capturedDeletionToken = rawToken;
      },
    } as unknown as EmailService;

    const service = new AuthService(prisma, mockEmailService);

    const registered = await service.registerUser({
      email: 'delete-me@lukifitti.de',
      password: 'FAKE-PASSWORD-TEST-123',
      name: 'DeleteMe',
    });

    // Reject account deletion request with wrong password
    await assert.rejects(
      () => service.requestAccountDeletion(registered.id, 'WRONG-PASSWORD-999'),
      /Current password is incorrect/i,
    );

    // Request account deletion with valid password -> sends email with token, does NOT delete yet
    const requested = await service.requestAccountDeletion(registered.id, 'FAKE-PASSWORD-TEST-123');
    assert.equal(requested.success, true);
    assert.equal(deletionEmailRecipient, 'delete-me@lukifitti.de');
    assert.equal(capturedDeletionToken.length > 20, true);

    // User STILL exists before clicking email link and confirming
    const stillExistsBeforeConfirm = await service.getUserById(registered.id);
    assert.equal(stillExistsBeforeConfirm?.email, 'delete-me@lukifitti.de');

    // Reject invalid confirmation token
    await assert.rejects(
      () => service.confirmAccountDeletion('invalid-deletion-token-12345'),
      /invalid or has expired/i,
    );

    // Confirm account deletion with valid token from email -> permanently deletes user
    const confirmed = await service.confirmAccountDeletion(capturedDeletionToken);
    assert.equal(confirmed.success, true);

    // User no longer exists in DB
    const afterConfirm = await service.getUserById(registered.id);
    assert.equal(afterConfirm, null);

    // Verify account-deletion.mjml template renders cleanly with confirmation link
    const templateService = new EmailTemplateService(undefined as unknown as PrismaService);
    const previewHtml = await templateService.getPreviewHtml(EmailTemplateType.ACCOUNT_DELETION);
    assert.equal(previewHtml.includes('Confirm Account Deletion'), true);
    assert.equal(previewHtml.includes('/delete-account?token='), true);
  });

  it('supports Authorization: Bearer tokens in AuthGuard and bypasses CsrfGuard only for Bearer transport', async () => {
    const prisma = createMockPrisma();
    const service = new AuthService(prisma);
    const registered = await service.registerUser({
      email: 'mobile-apple@lukifitti.de',
      password: 'FAKE-PASSWORD-TEST-123',
      name: 'AppleAthlete',
    });

    const token = generateAccessToken({ id: registered.id, email: registered.email });
    const authGuard = new AuthGuard(prisma);
    authGuard.checkDenylist = async () => false;
    const csrfGuard = new CsrfGuard();

    const bearerReq: Record<string, unknown> = {
      headers: { authorization: `Bearer ${token}` },
      cookies: {},
    };
    const bearerCtx = {
      switchToHttp: () => ({ getRequest: () => bearerReq }),
    } as unknown as ExecutionContext;

    assert.equal(extractBearerToken(bearerReq as never), token);
    const canActivateBearer = await authGuard.canActivate(bearerCtx);
    assert.equal(canActivateBearer, true);
    assert.equal(bearerReq.authTransport, 'bearer');
    assert.deepEqual(bearerReq.user, { id: registered.id, email: registered.email });

    // CsrfGuard skips cookie CSRF checks when authenticated via Bearer token
    assert.equal(csrfGuard.canActivate(bearerCtx), true);

    // Cookie-authenticated requests STILL strictly enforce CsrfGuard
    const cookieReq: Record<string, unknown> = {
      headers: {},
      cookies: { accessToken: token },
    };
    const cookieCtx = {
      switchToHttp: () => ({ getRequest: () => cookieReq }),
    } as unknown as ExecutionContext;

    assert.equal(await authGuard.canActivate(cookieCtx), true);
    assert.equal(cookieReq.authTransport, 'cookie');
    assert.throws(() => csrfGuard.canActivate(cookieCtx), /CSRF token missing/i);
  });
});
