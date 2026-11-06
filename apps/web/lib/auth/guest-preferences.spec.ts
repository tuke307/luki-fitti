import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WeightUnit } from '@luki-fitti/common/enums';
import type { UserPreferencesDto } from '@luki-fitti/common/schemas';
import {
  GUEST_PREFERENCES_STORAGE_KEY,
  applyPreferencesPatch,
  buildGuestUser,
  clearGuestPreferences,
  guestPreferencesToSync,
  parseGuestPreferences,
  readGuestPreferences,
  writeGuestPreferences,
} from './guest-preferences';

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const server: UserPreferencesDto = {
  id: 'p1',
  userId: 'u1',
  weightUnit: WeightUnit.KG,
  distanceUnit: 'KM' as UserPreferencesDto['distanceUnit'],
  defaultRestSeconds: 120,
  theme: 'dark',
  restTimerSound: true,
  weeklyGoalSessions: 3,
  dailyKcalGoal: 2400,
  proteinGoalG: null,
};

describe('guest preferences', () => {
  it('drops invalid or unknown stored values instead of trusting them', () => {
    assert.deepEqual(parseGuestPreferences('not json'), {});
    assert.deepEqual(parseGuestPreferences(JSON.stringify({ weeklyGoalSessions: 99 })), {});
    assert.deepEqual(parseGuestPreferences(JSON.stringify({ dailyKcalGoal: 2000, evil: 1 })), {
      dailyKcalGoal: 2000,
    });
  });

  it('merges writes, persists them and never stores a name', () => {
    const storage = memoryStorage();
    writeGuestPreferences({ dailyKcalGoal: 2100, name: 'Someone' }, storage);
    const merged = writeGuestPreferences({ heightCm: 180, weightUnit: WeightUnit.LBS }, storage);
    assert.deepEqual(merged, { dailyKcalGoal: 2100, heightCm: 180, weightUnit: WeightUnit.LBS });
    assert.deepEqual(readGuestPreferences(storage), merged);
    clearGuestPreferences(storage);
    assert.equal(storage.data.has(GUEST_PREFERENCES_STORAGE_KEY), false);
  });

  it('builds the guest user without a fake identity and with stored values', () => {
    const user = buildGuestUser({ weeklyGoalSessions: 5, proteinGoalG: 150 });
    assert.equal(user.name, null);
    assert.equal(user.email, '');
    assert.equal(user.preferences?.weeklyGoalSessions, 5);
    assert.equal(user.preferences?.proteinGoalG, 150);
    assert.equal(user.preferences?.restTimerSound, true);
  });

  it('keeps every preference field when patching, including goals and health details', () => {
    const user = applyPreferencesPatch(
      { id: 'u1', email: 'a@b.c', name: 'A', preferences: server },
      { carbsGoalG: 250, sex: 'female', proteinGoalG: undefined },
    );
    assert.equal(user.preferences?.carbsGoalG, 250);
    assert.equal(user.preferences?.sex, 'female');
    assert.equal(user.preferences?.dailyKcalGoal, 2400);
    assert.equal(user.preferences?.defaultRestSeconds, 120);
  });

  it('lets the server win when both sides are set on sign-in', () => {
    const guest = {
      dailyKcalGoal: 1800,
      proteinGoalG: 140,
      weeklyGoalSessions: 5,
      heightCm: null,
    };
    assert.deepEqual(guestPreferencesToSync(server, guest, 'fill'), { proteinGoalG: 140 });
    assert.deepEqual(guestPreferencesToSync(server, guest, 'replace'), {
      dailyKcalGoal: 1800,
      proteinGoalG: 140,
      weeklyGoalSessions: 5,
    });
    assert.deepEqual(guestPreferencesToSync(null, { heightCm: 175 }, 'fill'), { heightCm: 175 });
  });
});
