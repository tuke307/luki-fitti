import type { PublicMeDto } from '@luki-fitti/common/schemas';
import { WeightUnit } from '@luki-fitti/common/enums';
import { LukiFittiApiClient } from '../lukifitti-api.client';
import { scopesOf } from './tool-utils';
import type { OutputWeightUnit } from './insights';

/**
 * The user's weight unit when the key may read the profile, kg otherwise —
 * tools always state which unit they answered in.
 */
export async function weightUnitFor(
  api: LukiFittiApiClient,
  req: unknown,
): Promise<OutputWeightUnit> {
  if (!scopesOf(req).includes('read:profile')) return 'kg';
  try {
    const me = await api.get<PublicMeDto>('/v1/me', {}, req);
    return me.weightUnit === WeightUnit.LBS ? 'lbs' : 'kg';
  } catch {
    return 'kg';
  }
}

/** Nutrition goals when the key has `read:profile`, null otherwise. */
export async function nutritionGoalsFor(
  api: LukiFittiApiClient,
  req: unknown,
): Promise<PublicMeDto['goals'] | null> {
  if (!scopesOf(req).includes('read:profile')) return null;
  try {
    return (await api.get<PublicMeDto>('/v1/me', {}, req)).goals;
  } catch {
    return null;
  }
}
