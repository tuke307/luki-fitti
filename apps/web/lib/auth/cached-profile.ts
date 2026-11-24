import type { UserDto } from '@luki-fitti/common';

export const PROFILE_CACHE_KEY = 'luki_cached_user_profile';

/**
 * `UserDto` embeds auth tokens (`tokens`) in sign-in responses. The browser's
 * session lives in HttpOnly cookies, so the tokens must never be written to
 * localStorage or kept in React state — this strips them for both uses.
 */
export const toCachedProfile = (user: UserDto): Omit<UserDto, 'tokens'> => {
  const profile = { ...user };
  delete profile.tokens;
  return profile;
};
