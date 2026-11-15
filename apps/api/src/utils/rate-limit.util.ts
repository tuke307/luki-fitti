import { getRedis } from './redis.util';

/**
 * Fixed-window per-user counter in Redis (e.g. `social:req:<userId>` for 24 h).
 * Fails closed: when Redis is unreachable the request errors out rather than
 * silently losing the abuse limit. Returns the new count.
 */
export async function incrementUserCounter(key: string, windowSeconds: number): Promise<number> {
  const redis = getRedis();
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);
  return count;
}
