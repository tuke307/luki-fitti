import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminPermission, AiKeySlot, FeatureGrant } from '@luki-fitti/common/enums';
import { PermissionsGuard } from './permissions.guard';
import { FeatureGuard } from './feature.guard';
import { FEATURE_KEY, PERMISSIONS_KEY } from '@/decorators/permissions.decorator';
import {
  effectiveKeySource,
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
  const settings = (enabled: FeatureGrant[], hasKey: boolean) =>
    ({
      enabledFeatures: async () => enabled,
      hasAiKey: async () => hasKey,
    }) as unknown as AppSettingsService;

  it('grants when the feature is enabled and the user has a key', async () => {
    const guard = new FeatureGuard(new Reflector(), settings([FeatureGrant.AI_MEAL_PHOTO], true));
    const ctx = contextWith({ id: 'u1' }, { [FEATURE_KEY]: FeatureGrant.AI_MEAL_PHOTO });
    assert.equal(await guard.canActivate(ctx), true);
  });

  it('denies disabled features and routes without metadata', async () => {
    const guard = new FeatureGuard(new Reflector(), settings([], true));
    await assert.rejects(
      guard.canActivate(contextWith({ id: 'u1' }, { [FEATURE_KEY]: FeatureGrant.AI_MEAL_PHOTO })),
      ForbiddenException,
    );
    await assert.rejects(guard.canActivate(contextWith({ id: 'u1' }, {})), ForbiddenException);
  });

  it('denies an enabled feature without a key as AI_KEY_REQUIRED', async () => {
    const guard = new FeatureGuard(new Reflector(), settings([FeatureGrant.AI_MEAL_PHOTO], false));
    const ctx = contextWith({ id: 'u1' }, { [FEATURE_KEY]: FeatureGrant.AI_MEAL_PHOTO });
    await assert.rejects(guard.canActivate(ctx), (err: ForbiddenException) => {
      const body = err.getResponse() as { code?: string };
      assert.equal(body.code, 'AI_KEY_REQUIRED');
      return true;
    });
  });
});

describe('resolveActiveFeatures', () => {
  const on = {
    aiWorkoutBuilderEnabled: true,
    aiMealPhotoEnabled: true,
    aiProgressTargetEnabled: true,
  };
  const { USER, ADMIN } = AiKeySlot;

  it('any usable key enables every globally switched-on feature', () => {
    assert.deepEqual(resolveActiveFeatures(on, USER), [
      FeatureGrant.AI_WORKOUT_BUILDER,
      FeatureGrant.AI_MEAL_PHOTO,
      FeatureGrant.AI_PROGRESS_TARGET,
    ]);
    assert.deepEqual(resolveActiveFeatures(on, ADMIN), [
      FeatureGrant.AI_WORKOUT_BUILDER,
      FeatureGrant.AI_MEAL_PHOTO,
      FeatureGrant.AI_PROGRESS_TARGET,
    ]);
  });

  it('respects the global switches', () => {
    assert.deepEqual(resolveActiveFeatures({ ...on, aiMealPhotoEnabled: false }, USER), [
      FeatureGrant.AI_WORKOUT_BUILDER,
      FeatureGrant.AI_PROGRESS_TARGET,
    ]);
    assert.deepEqual(resolveActiveFeatures({ ...on, aiWorkoutBuilderEnabled: false }, ADMIN), [
      FeatureGrant.AI_MEAL_PHOTO,
      FeatureGrant.AI_PROGRESS_TARGET,
    ]);
  });

  it('enables nothing without a key (no global provider key)', () => {
    assert.deepEqual(resolveActiveFeatures(on, null), []);
  });

  it('prefers the own key over the admin-assigned key', () => {
    assert.equal(effectiveKeySource([ADMIN, USER]), USER);
    assert.equal(effectiveKeySource([ADMIN]), ADMIN);
    assert.equal(effectiveKeySource([]), null);
  });
});
