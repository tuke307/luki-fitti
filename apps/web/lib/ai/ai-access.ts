import { FeatureGrant } from '@luki-fitti/common/enums';
import type { UserDto } from '@luki-fitti/common/schemas';
import { GUEST_USER_ID } from '@/lib/auth/guest-preferences';

/**
 * AI entry points stay visible for guests (and before the user object loads) so they can
 * see how a feature works; for signed-in users the account's feature grants — filled from
 * the global switches regardless of key — decide.
 */
export function showsAiFeature(user: UserDto | null | undefined, feature: FeatureGrant): boolean {
  if (!user || user.id === GUEST_USER_ID) return true;
  return user.features?.includes(feature) ?? false;
}
