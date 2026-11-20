import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import type { AuthTokensDto } from '@luki-fitti/common/schemas';
import { ACCESS_TOKEN_EXPIRY_MS, REFRESH_TOKEN_EXPIRY_MS } from '@/config/env.config';
import { generateAccessToken, generateCsrfToken, generateRefreshToken } from '@/utils/jwt.util';
import {
  accessTokenCookieOptions,
  csrfCookieOptions,
  refreshTokenCookieOptions,
  setCookie,
} from '@/utils/cookie.util';
import type { RefreshTokenService } from './refresh-token.service';

export interface IssueSessionOptions {
  familyId?: string;
  deviceLabel?: string | null;
  setCookies?: boolean;
}

/** Creates a device session (refresh-token family) and, for browsers, sets the session cookies. */
export async function issueSession(
  refreshTokens: RefreshTokenService,
  user: { id: string; email: string },
  res: Response,
  opts: IssueSessionOptions = {},
): Promise<AuthTokensDto> {
  const familyId = opts.familyId ?? randomUUID();
  const accessToken = generateAccessToken(user, familyId);
  const refreshToken = generateRefreshToken(user, familyId);

  await refreshTokens.create({
    token: refreshToken,
    userId: user.id,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
    familyId,
    deviceLabel: opts.deviceLabel ?? null,
  });

  if (opts.setCookies ?? true) {
    setCookie(res, 'accessToken', accessToken, accessTokenCookieOptions);
    setCookie(res, 'refreshToken', refreshToken, refreshTokenCookieOptions);
    setCookie(res, 'csrfToken', generateCsrfToken(), csrfCookieOptions);
  }

  return {
    accessToken,
    refreshToken,
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_EXPIRY_MS).toISOString(),
  };
}

export function resolveDeviceLabel(req: Request): string {
  const raw = (req.header('x-device-label') ?? req.header('x-client-platform') ?? 'web')
    .trim()
    .toLowerCase();
  return /^[a-z0-9-]{1,32}$/.test(raw) ? raw : 'unknown';
}
