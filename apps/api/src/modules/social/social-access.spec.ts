import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import { SocialAccessService } from './social-access.service';
import { SocialEnabledGuard } from './social-enabled.guard';

const settings = (socialEnabled: boolean, socialBetaUserIds: string[] = []) =>
  ({
    get: async () => ({ socialEnabled, socialBetaUserIds }),
  }) as unknown as AppSettingsService;

describe('SocialAccessService.isEnabledFor', () => {
  it('deny by default: disabled flag hides everyone', async () => {
    const access = new SocialAccessService(settings(false));
    assert.equal(await access.isEnabledFor('u1'), false);
  });

  it('enabled with empty beta list allows everyone', async () => {
    const access = new SocialAccessService(settings(true));
    assert.equal(await access.isEnabledFor('u1'), true);
  });

  it('enabled with a beta list allows only listed users', async () => {
    const access = new SocialAccessService(settings(true, ['beta-user']));
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
    const guard = new SocialEnabledGuard(new SocialAccessService(settings(false)));
    await assert.rejects(guard.canActivate(ctx({ id: 'u1' })), ForbiddenException);
    await assert.rejects(guard.canActivate(ctx()), ForbiddenException);
  });

  it('passes for allowlisted users when enabled', async () => {
    const guard = new SocialEnabledGuard(new SocialAccessService(settings(true, ['u1'])));
    assert.equal(await guard.canActivate(ctx({ id: 'u1' })), true);
  });
});
