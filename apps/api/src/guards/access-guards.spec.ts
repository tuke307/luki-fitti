import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminPermission, FeatureGrant } from '@luki-fitti/common/enums';
import { PermissionsGuard } from './permissions.guard';
import { FeatureGuard } from './feature.guard';
import { FEATURE_KEY, PERMISSIONS_KEY } from '@/decorators/permissions.decorator';
import {
  resolveActiveFeatures,
  type AppSettingsService,
} from '@/modules/app-settings/app-settings.service';

function contextWith(user: unknown, metadata: Record<string, unknown>) {
  const handler = () => undefined;
  for (const [key, value] of Object.entries(metadata)) {
    Reflect.defineMetadata(key, value, handler);
  }
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('grants when the user holds one of the required permissions', () => {
    const ctx = contextWith(
      { id: 'u1', permissions: [AdminPermission.USERS_MANAGE] },
      { [PERMISSIONS_KEY]: [AdminPermission.DASHBOARD_VIEW, AdminPermission.USERS_MANAGE] },
    );
    assert.equal(guard.canActivate(ctx), true);
  });

  it('denies users without the permission', () => {
    const ctx = contextWith(
      { id: 'u1', permissions: [AdminPermission.DASHBOARD_VIEW] },
      { [PERMISSIONS_KEY]: [AdminPermission.USERS_MANAGE] },
    );
    assert.throws(() => guard.canActivate(ctx), ForbiddenException);
  });

  it('denies by default when a route has no permission metadata', () => {
    const ctx = contextWith({ id: 'u1', permissions: [AdminPermission.USERS_MANAGE] }, {});
    assert.throws(() => guard.canActivate(ctx), ForbiddenException);
  });
});

describe('FeatureGuard', () => {
  const settings = (active: FeatureGrant[]) =>
    ({ resolveActiveFeatures: async () => active }) as unknown as AppSettingsService;

  it('grants when the feature is active for the user', async () => {
    const guard = new FeatureGuard(new Reflector(), settings([FeatureGrant.AI_MEAL_PHOTO]));
    const ctx = contextWith(
      { id: 'u1', featureGrants: [FeatureGrant.AI_MEAL_PHOTO] },
      { [FEATURE_KEY]: FeatureGrant.AI_MEAL_PHOTO },
    );
    assert.equal(await guard.canActivate(ctx), true);
  });

  it('denies inactive features and routes without metadata', async () => {
    const guard = new FeatureGuard(new Reflector(), settings([]));
    await assert.rejects(
      guard.canActivate(contextWith({ id: 'u1' }, { [FEATURE_KEY]: FeatureGrant.AI_MEAL_PHOTO })),
      ForbiddenException,
    );
    await assert.rejects(guard.canActivate(contextWith({ id: 'u1' }, {})), ForbiddenException);
  });
});

describe('resolveActiveFeatures', () => {
  const on = { aiWorkoutBuilderEnabled: true, aiMealPhotoEnabled: true };

  it('requires grant, global switch and a configured provider', () => {
    assert.deepEqual(resolveActiveFeatures([FeatureGrant.AI_WORKOUT_BUILDER], on, true), [
      FeatureGrant.AI_WORKOUT_BUILDER,
    ]);
    assert.deepEqual(
      resolveActiveFeatures(
        [FeatureGrant.AI_WORKOUT_BUILDER],
        { ...on, aiWorkoutBuilderEnabled: false },
        true,
      ),
      [],
    );
    assert.deepEqual(resolveActiveFeatures([FeatureGrant.AI_WORKOUT_BUILDER], on, false), []);
  });

  it('drops unknown and duplicate grants', () => {
    assert.deepEqual(
      resolveActiveFeatures(['BOGUS', FeatureGrant.AI_MEAL_PHOTO, FeatureGrant.AI_MEAL_PHOTO], on, true),
      [FeatureGrant.AI_MEAL_PHOTO],
    );
  });
});
