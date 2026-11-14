import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import type { PrismaService } from '../database/prisma.service';
import { SocialAccessService } from './social-access.service';
import { SocialEnabledGuard } from './social-enabled.guard';

const settings = (
  socialEnabled: boolean,
  socialBetaUserIds: string[] = [],
  leaguesEnabled = true,
) =>
  ({
    get: async () => ({ socialEnabled, socialBetaUserIds, leaguesEnabled }),
  }) as unknown as AppSettingsService;

const prismaWith = (users: Record<string, { handle: string | null; socialPaused: boolean }>) =>
  ({
    user: { findUnique: async ({ where }: { where: { id: string } }) => users[where.id] ?? null },
  }) as unknown as PrismaService;

describe('SocialAccessService.isEnabledFor', () => {
  it('deny by default: disabled flag hides everyone', async () => {
    const access = new SocialAccessService(settings(false), prismaWith({}));
    assert.equal(await access.isEnabledFor('u1'), false);
  });

  it('enabled with empty beta list allows everyone', async () => {
    const access = new SocialAccessService(settings(true), prismaWith({}));
    assert.equal(await access.isEnabledFor('u1'), true);
  });

  it('enabled with a beta list allows only listed users', async () => {
    const access = new SocialAccessService(settings(true, ['beta-user']), prismaWith({}));
    assert.equal(await access.isEnabledFor('beta-user'), true);
    assert.equal(await access.isEnabledFor('other'), false);
  });
});

describe('SocialEnabledGuard', () => {
  const ctx = (user?: { id: string }) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  it('rejects with 403 when the feature is off or the user is not allowed', async () => {
    const guard = new SocialEnabledGuard(new SocialAccessService(settings(false), prismaWith({})));
    await assert.rejects(guard.canActivate(ctx({ id: 'u1' })), ForbiddenException);
    await assert.rejects(guard.canActivate(ctx()), ForbiddenException);
  });

  it('passes for allowlisted users when enabled', async () => {
    const guard = new SocialEnabledGuard(
      new SocialAccessService(settings(true, ['u1']), prismaWith({})),
    );
    assert.equal(await guard.canActivate(ctx({ id: 'u1' })), true);
  });
});

describe('SocialAccessService.isEligibleForLeagues', () => {
  const users = { u1: { handle: 'u1', socialPaused: false } };

  it('requires leaguesEnabled, social enabled, a handle and no pause', async () => {
    const prisma = prismaWith(users);
    assert.equal(
      await new SocialAccessService(settings(true), prisma).isEligibleForLeagues('u1'),
      true,
    );
    assert.equal(
      await new SocialAccessService(settings(true, [], false), prisma).isEligibleForLeagues('u1'),
      false,
    );
    assert.equal(
      await new SocialAccessService(settings(false), prisma).isEligibleForLeagues('u1'),
      false,
    );
    assert.equal(
      await new SocialAccessService(
        settings(true),
        prismaWith({ u1: { handle: null, socialPaused: false } }),
      ).isEligibleForLeagues('u1'),
      false,
    );
    assert.equal(
      await new SocialAccessService(
        settings(true),
        prismaWith({ u1: { handle: 'u1', socialPaused: true } }),
      ).isEligibleForLeagues('u1'),
      false,
    );
    assert.equal(
      await new SocialAccessService(settings(true, ['other']), prisma).isEligibleForLeagues('u1'),
      false,
    );
  });
});
