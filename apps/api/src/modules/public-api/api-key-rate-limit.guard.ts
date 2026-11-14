import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { getRedis } from '@/utils/redis.util';
import { incrementUserCounter } from '@/utils/rate-limit.util';
import type { AuthenticatedUser } from '@/decorators/current-user.decorator';
import type { RequestApiKey } from './api-key.guard';

const MINUTE_LIMIT = 60;
const MINUTE_SECONDS = 60;
const DAY_LIMIT_PER_KEY = 5_000;
const DAY_LIMIT_PER_USER = 10_000;
const DAY_SECONDS = 86_400;

/**
 * Per-key and per-user rate limits for `/api/v1` (runs after `ScopesGuard`,
 * which runs after `ApiKeyGuard`). Always emits the per-minute window's
 * `X-RateLimit-*` headers; on exceed, 429 `rate_limited` + `Retry-After`.
 */
@Injectable()
export class ApiKeyRateLimitGuard implements CanActivate {
  /** Overridable in tests (avoids a Redis connection). */
  public increment = async (key: string, windowSeconds: number): Promise<number> =>
    incrementUserCounter(key, windowSeconds);
  public ttl = async (key: string): Promise<number> => getRedis().ttl(key);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<
      Request & { user?: AuthenticatedUser; apiKey?: RequestApiKey }
    >();
    const response = http.getResponse<Response>();
    const keyId = request.apiKey?.id;
    const userId = request.user?.id;
    if (!keyId || !userId) {
      throw new HttpException(
        { message: 'API key required', code: 'invalid_api_key' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const minuteKey = `apikey:rl:m:${keyId}`;
    const dayKey = `apikey:rl:d:${keyId}`;
    const userDayKey = `apikey:rl:ud:${userId}`;

    const [minuteCount, dayCount, userDayCount] = await Promise.all([
      this.increment(minuteKey, MINUTE_SECONDS),
      this.increment(dayKey, DAY_SECONDS),
      this.increment(userDayKey, DAY_SECONDS),
    ]);
    const minuteTtl = Math.max(1, await this.ttl(minuteKey));
    const resetUnix = Math.floor(Date.now() / 1000) + minuteTtl;

    response.setHeader('X-RateLimit-Limit', String(MINUTE_LIMIT));
    response.setHeader('X-RateLimit-Remaining', String(Math.max(0, MINUTE_LIMIT - minuteCount)));
    response.setHeader('X-RateLimit-Reset', String(resetUnix));

    if (minuteCount > MINUTE_LIMIT) {
      response.setHeader('Retry-After', String(minuteTtl));
      throw new HttpException(
        { message: 'Rate limit exceeded', code: 'rate_limited' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (dayCount > DAY_LIMIT_PER_KEY || userDayCount > DAY_LIMIT_PER_USER) {
      const dayTtl = Math.max(
        1,
        dayCount > DAY_LIMIT_PER_KEY ? await this.ttl(dayKey) : await this.ttl(userDayKey),
      );
      response.setHeader('Retry-After', String(dayTtl));
      throw new HttpException(
        { message: 'Rate limit exceeded', code: 'rate_limited' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
