import { SetMetadata } from '@nestjs/common';
import type { AdminPermission, FeatureGrant } from '@luki-fitti/common/enums';

export const PERMISSIONS_KEY = 'permissions';
export const FEATURE_KEY = 'feature';

/**
 * Require the authenticated user to hold at least one of the given admin permissions
 * (any-of). Enforced by `PermissionsGuard`, which must run after `AuthGuard`.
 */
export const RequirePermissions = (...permissions: AdminPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Require an opt-in feature: the global switch must be on AND the user must hold the grant.
 * Enforced by `FeatureGuard`, which must run after `AuthGuard`.
 */
export const RequireFeature = (feature: FeatureGrant) => SetMetadata(FEATURE_KEY, feature);
