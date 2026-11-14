import type { PublicMeDto } from '@luki-fitti/common/schemas';
import { WeightUnit } from '@luki-fitti/common/enums';
import { LukiFittiApiClient } from '../lukifitti-api.client';
import { scopesOf } from './tool-utils';
import type { OutputWeightUnit } from './insights';

/**
 * `/v1/me` once per tool call: several helpers need the same profile (unit,
 * goals), so the response is memoised on the request object. Returns null
 * without `read:profile` and on any API error — profile data is optional
 * everywhere it is used.
 */
const profileCache = new WeakMap<object, Promise<PublicMeDto | null>>();

export function profileFor(api: LukiFittiApiClient, req: unknown): Promise<PublicMeDto | null> {
  if (!scopesOf(req).includes('read:profile')) return Promise.resolve(null);
  const key = typeof req === 'object' && req !== null ? req : undefined;
  const cached = key ? profileCache.get(key) : undefined;
  if (cached) return cached;
  const pending = api.get<PublicMeDto>('/v1/me', {}, req).catch(() => null);
  if (key) profileCache.set(key, pending);
  return pending;
}

/**
 * The user's weight unit when the key may read the profile, kg otherwise —
 * tools always state which unit they answered in.
 */
export async function weightUnitFor(
  api: LukiFittiApiClient,
  req: unknown,
): Promise<OutputWeightUnit> {
  const me = await profileFor(api, req);
  return me?.weightUnit === WeightUnit.LBS ? 'lbs' : 'kg';
}

/** Nutrition goals when the key has `read:profile`, null otherwise. */
export async function nutritionGoalsFor(
  api: LukiFittiApiClient,
  req: unknown,
): Promise<PublicMeDto['goals'] | null> {
  return (await profileFor(api, req))?.goals ?? null;
}
