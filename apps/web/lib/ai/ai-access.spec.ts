import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FeatureGrant } from '@luki-fitti/common/enums';
import type { UserDto } from '@luki-fitti/common/schemas';
import { GUEST_USER_ID } from '@/lib/auth/guest-preferences';
import { showsAiFeature } from './ai-access';

const signedIn = (features: FeatureGrant[] | undefined): UserDto =>
  ({ id: 'user-1', email: 'a@b.c', name: 'A', features }) as UserDto;

describe('showsAiFeature', () => {
  it('shows AI entry points to guests', () => {
    const guest = { id: GUEST_USER_ID, email: '', name: null } as UserDto;
    assert.equal(showsAiFeature(guest, FeatureGrant.AI_MEAL_PHOTO), true);
  });

  it('shows AI entry points while no user is loaded', () => {
    assert.equal(showsAiFeature(null, FeatureGrant.AI_WORKOUT_BUILDER), true);
    assert.equal(showsAiFeature(undefined, FeatureGrant.AI_WORKOUT_BUILDER), true);
  });

  it('follows the feature grant for signed-in users', () => {
    assert.equal(
      showsAiFeature(signedIn([FeatureGrant.AI_MEAL_PHOTO]), FeatureGrant.AI_MEAL_PHOTO),
      true,
    );
    assert.equal(showsAiFeature(signedIn([]), FeatureGrant.AI_MEAL_PHOTO), false);
    assert.equal(showsAiFeature(signedIn(undefined), FeatureGrant.AI_MEAL_PHOTO), false);
  });
});
