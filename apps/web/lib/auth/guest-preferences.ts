import { DistanceUnit, WeightUnit } from '@luki-fitti/common/enums';
import {
  UpdatePreferencesSchema,
  type UpdatePreferencesDto,
  type UserDto,
  type UserPreferencesDto,
} from '@luki-fitti/common/schemas';

/** Id of the local guest user; every guest preference lives on this device only. */
export const GUEST_USER_ID = 'local-athlete';

/** localStorage key holding the guest's preference patch (an `UpdatePreferencesDto`). */
export const GUEST_PREFERENCES_STORAGE_KEY = 'luki_guest_preferences';

type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/**
 * How guest preferences meet the account on sign-in. `fill` (sign in to an existing account)
 * only sets fields the server has no value for, so the server wins when both are set.
 * `replace` (a brand-new account) applies every guest choice.
 */
export type GuestMergeMode = 'fill' | 'replace';

const DEFAULT_PREFERENCES = {
  weightUnit: WeightUnit.KG,
  distanceUnit: DistanceUnit.KM,
  defaultRestSeconds: 90,
  theme: 'system',
  language: 'system',
  restTimerSound: true,
  notificationsEnabled: true,
  exerciseSuggestionsEnabled: true,
  weeklyGoalSessions: 4,
} satisfies Partial<UserPreferencesDto>;

/** The guest has no name or email: nothing pretends to be an account. */
export const GUEST_BASE_USER: UserDto = {
  id: GUEST_USER_ID,
  email: '',
  name: null,
  preferences: { id: 'pref-local', userId: GUEST_USER_ID, ...DEFAULT_PREFERENCES },
};

const definedEntries = (patch: UpdatePreferencesDto) =>
  Object.entries(patch).filter(([key, value]) => key !== 'name' && value !== undefined);

/** Parses a stored patch; anything invalid or unknown is dropped rather than trusted. */
export function parseGuestPreferences(raw: string | null): UpdatePreferencesDto {
  if (!raw) return {};
  try {
    const parsed = UpdatePreferencesSchema.safeParse(JSON.parse(raw));
    return parsed.success ? Object.fromEntries(definedEntries(parsed.data)) : {};
  } catch {
    return {};
  }
}

export function readGuestPreferences(
  storage: KeyValueStorage = localStorage,
): UpdatePreferencesDto {
  return parseGuestPreferences(storage.getItem(GUEST_PREFERENCES_STORAGE_KEY));
}

/** Merges `patch` into the stored guest preferences and returns the result. */
export function writeGuestPreferences(
  patch: UpdatePreferencesDto,
  storage: KeyValueStorage = localStorage,
): UpdatePreferencesDto {
  const merged = parseGuestPreferences(
    JSON.stringify({
      ...readGuestPreferences(storage),
      ...Object.fromEntries(definedEntries(patch)),
    }),
  );
  storage.setItem(GUEST_PREFERENCES_STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function clearGuestPreferences(storage: KeyValueStorage = localStorage): void {
  storage.removeItem(GUEST_PREFERENCES_STORAGE_KEY);
}

/** Returns `user` with `patch` applied on top of its preferences (and defaults). */
export function applyPreferencesPatch(user: UserDto, patch: UpdatePreferencesDto): UserDto {
  return {
    ...user,
    name: patch.name ?? user.name,
    preferences: {
      ...DEFAULT_PREFERENCES,
      ...user.preferences,
      ...(Object.fromEntries(definedEntries(patch)) as Partial<UserPreferencesDto>),
      id: user.preferences?.id ?? 'pref-local',
      userId: user.id,
    },
  };
}

/** The guest user with its stored preferences. */
export function buildGuestUser(guest: UpdatePreferencesDto): UserDto {
  return applyPreferencesPatch(GUEST_BASE_USER, guest);
}

/** The part of the guest preferences that should be sent to the account on sign-in. */
export function guestPreferencesToSync(
  server: UserPreferencesDto | null | undefined,
  guest: UpdatePreferencesDto,
  mode: GuestMergeMode,
): UpdatePreferencesDto {
  return Object.fromEntries(
    definedEntries(guest).filter(
      ([key, value]) =>
        value !== null && (mode === 'replace' || server?.[key as keyof UserPreferencesDto] == null),
    ),
  );
}
