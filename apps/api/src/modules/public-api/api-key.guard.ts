import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiKeyScope } from '@luki-fitti/common/enums';
import { API_KEY_PREFIX, parseApiKey } from '@luki-fitti/common/utils';
import { logger } from '@luki-fitti/logger';
import { extractBearerToken } from '@/guards/auth.guard';
import { getRedis } from '@/utils/redis.util';
import { incrementUserCounter } from '@/utils/rate-limit.util';
import { PrismaService } from '@/modules/database/prisma.service';
import { AppSettingsService } from '@/modules/app-settings/app-settings.service';
import type { AuthenticatedUser } from '@/decorators/current-user.decorator';
import { verifyApiKeySecret } from '../api-keys/api-key.crypto';

export interface RequestApiKey {
  id: string;
  scopes: ApiKeyScope[];
  /** ISO 8601 expiry, or null for a key without expiry. */
  expiresAt: string | null;
}

/** One generic message: never reveal which check failed (probing defense). */
const INVALID_KEY_MESSAGE = 'Invalid API key';
const FAIL_WINDOW_SECONDS = 600;
const FAIL_LIMIT = 30;
const LAST_USED_MIN_INTERVAL_SECONDS = 60;

const invalidKey = () => new UnauthorizedException(INVALID_KEY_MESSAGE);

function queryContainsApiKey(query: Request['query']): boolean {
  return Object.values(query ?? {}).some((value) => {
    const values = Array.isArray(value) ? value : [value];
    return values.some((v) => typeof v === 'string' && v.includes(API_KEY_PREFIX));
  });
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  /** Overridable in tests (avoids a Redis connection). */
  public countFailure = async (ip: string): Promise<number> =>
    incrementUserCounter(`apikey:fail:${ip}`, FAIL_WINDOW_SECONDS);
  public touchLastUsed = async (keyId: string): Promise<boolean> =>
    Boolean(
      await getRedis().set(`apikey:used:${keyId}`, '1', 'EX', LAST_USED_MIN_INTERVAL_SECONDS, 'NX'),
    );
  public failCount = async (ip: string): Promise<number> =>
    Number((await getRedis().get(`apikey:fail:${ip}`)) ?? 0);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appSettings: AppSettingsService,
  ) {}

  private async registerFailure(ip: string): Promise<void> {
    try {
      await this.countFailure(ip);
    } catch (err) {
      logger.debug(`API-key fail counter unavailable: ${err}`);
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser; apiKey?: RequestApiKey }>();
    const ip = request.ip ?? 'unknown';

    // Keys belong in the Authorization header, never the URL (logs, caches, referers).
    if (queryContainsApiKey(request.query)) {
      throw new BadRequestException({
        message: 'Send the API key in the Authorization header',
        code: 'invalid_request',
      });
    }

    const bearer = extractBearerToken(request);
    const parsed = bearer?.startsWith(API_KEY_PREFIX) ? parseApiKey(bearer) : null;
    if (!parsed) {
      await this.registerFailure(ip);
      throw invalidKey();
    }

    // Failed-attempt counter per IP: short-circuit before the DB lookup.
    if ((await this.failCount(ip)) > FAIL_LIMIT) {
      throw new HttpException(
        { message: 'Too many failed API key attempts', code: 'rate_limited' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const settings = await this.appSettings.get();
    if (!settings.apiKeysEnabled) {
      throw new ForbiddenException({ message: 'API keys are disabled', code: 'api_keys_disabled' });
    }

    const record = await this.prisma.apiKey.findUnique({
      where: { id: parsed.id },
      include: { user: { select: { id: true, email: true, lockedUntil: true } } },
    });

    const now = Date.now();
    const valid =
      record !== null &&
      record.revokedAt === null &&
      (record.expiresAt === null || record.expiresAt.getTime() > now) &&
      (record.user.lockedUntil === null || record.user.lockedUntil.getTime() <= now) &&
      verifyApiKeySecret(parsed.secret, record.secretHash);

    if (!valid) {
      await this.registerFailure(ip);
      throw invalidKey();
    }

    request.user = { id: record.user.id, email: record.user.email, permissions: [] };
    request.apiKey = {
      id: record.id,
      scopes: record.scopes as ApiKeyScope[],
      expiresAt: record.expiresAt?.toISOString() ?? null,
    };

    // lastUsedAt: at most one write per minute per key, fire-and-forget.
    try {
      if (await this.touchLastUsed(record.id)) {
        this.prisma.apiKey
          .update({ where: { id: record.id }, data: { lastUsedAt: new Date() } })
          .catch((err: unknown) => logger.debug(`apiKey.lastUsedAt update failed: ${err}`));
      }
    } catch (err) {
      logger.debug(`apiKey.lastUsedAt throttle check skipped: ${err}`);
    }

    return true;
  }
}
