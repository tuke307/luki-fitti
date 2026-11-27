import { Injectable } from '@nestjs/common';
import { importPKCS8, SignJWT } from 'jose';
import { logger } from '@luki-fitti/logger';
import {
  APPLE_SIGN_IN_KEY_ID,
  APPLE_SIGN_IN_KEY_P8_BASE64,
  APPLE_TEAM_ID,
} from '@/config/env.config';
import { decryptSecret, encryptSecret } from '@/utils/secret-box.util';
import { PrismaService } from '../database/prisma.service';

const TOKEN_URL = 'https://appleid.apple.com/auth/token';
const REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const APPLE_AUDIENCE = 'https://appleid.apple.com';
/** Apple rejects client secrets valid longer than 6 months; 5 minutes is plenty. */
const CLIENT_SECRET_TTL_SECONDS = 300;

export interface AppleSignInKeyConfig {
  teamId: string;
  keyId: string;
  /** Base64 of the .p8 file (same convention as APNS_KEY_P8_BASE64). */
  keyP8Base64: string;
}

/**
 * Sign in with Apple token exchange + revocation. Exchanging the one-shot authorization
 * code yields a refresh token, stored encrypted on the OAuthAccount row; unlink and account
 * deletion send it to Apple's revoke endpoint so the app disappears from the user's
 * Apple ID settings. Every Apple call is best-effort: failures are logged, never thrown.
 */
@Injectable()
export class AppleTokenService {
  constructor(private readonly prisma: PrismaService) {}

  /** Overridable for tests — normally the env config. */
  public config: AppleSignInKeyConfig = {
    teamId: APPLE_TEAM_ID,
    keyId: APPLE_SIGN_IN_KEY_ID,
    keyP8Base64: APPLE_SIGN_IN_KEY_P8_BASE64,
  };

  /** Overridable for tests so no network is needed. */
  public fetchImpl: typeof fetch = (...args) => fetch(...args);

  private keyPromise?: Promise<CryptoKey>;

  isConfigured(): boolean {
    return Boolean(this.config.teamId && this.config.keyId && this.config.keyP8Base64);
  }

  /** ES256 client-secret JWT for Apple's token endpoints, `sub` = the app's client id. */
  private async clientSecret(clientId: string): Promise<string> {
    this.keyPromise ??= importPKCS8(
      Buffer.from(this.config.keyP8Base64, 'base64').toString('utf8'),
      'ES256',
    );
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.config.keyId })
      .setIssuer(this.config.teamId)
      .setIssuedAt(now)
      .setExpirationTime(now + CLIENT_SECRET_TTL_SECONDS)
      .setAudience(APPLE_AUDIENCE)
      .setSubject(clientId)
      .sign(await this.keyPromise);
  }

  private async postForm(url: string, fields: Record<string, string>): Promise<Response> {
    return this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(fields).toString(),
      signal: AbortSignal.timeout(10_000),
    });
  }

  /**
   * Exchanges the authorization code and stores the refresh token encrypted. Only the
   * first consent returns a refresh token, so later codes may yield none — that's fine.
   */
  async storeFromCode(oauthAccountId: string, code: string, clientId: string): Promise<void> {
    try {
      const res = await this.postForm(TOKEN_URL, {
        client_id: clientId,
        client_secret: await this.clientSecret(clientId),
        code,
        grant_type: 'authorization_code',
      });
      const body = (await res.json().catch(() => null)) as { refresh_token?: unknown } | null;
      const refreshToken = typeof body?.refresh_token === 'string' ? body.refresh_token : null;
      if (!res.ok || !refreshToken) {
        logger.warn(
          `Apple token exchange for OAuthAccount ${oauthAccountId} returned no refresh token (status ${res.status})`,
        );
        return;
      }
      await this.prisma.oAuthAccount.update({
        where: { id: oauthAccountId },
        data: { refreshTokenEnc: encryptSecret(refreshToken), tokenClientId: clientId },
      });
    } catch (error) {
      logger.warn(`Apple token exchange failed for OAuthAccount ${oauthAccountId}: ${error}`);
    }
  }

  /** Best-effort revoke of the stored refresh token; silently no-ops when none exists. */
  async revokeFor(account: {
    refreshTokenEnc: string | null;
    tokenClientId: string | null;
  }): Promise<void> {
    if (!account.refreshTokenEnc || !account.tokenClientId || !this.isConfigured()) return;
    try {
      const token = decryptSecret(account.refreshTokenEnc);
      const res = await this.postForm(REVOKE_URL, {
        client_id: account.tokenClientId,
        client_secret: await this.clientSecret(account.tokenClientId),
        token,
        token_type_hint: 'refresh_token',
      });
      if (!res.ok) {
        logger.warn(`Apple token revoke answered status ${res.status}`);
      }
    } catch (error) {
      logger.warn(`Apple token revoke failed: ${error}`);
    }
  }
}
