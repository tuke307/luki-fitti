import {
  ConflictException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { OAuthLoginDto, OAuthProviderName } from '@luki-fitti/common/schemas';
import { constantTimeEqual } from '@luki-fitti/common/utils/crypto';
import { APPLE_CLIENT_IDS, GOOGLE_CLIENT_IDS } from '@/config/env.config';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from './auth.service';

type OAuthProvider = 'GOOGLE' | 'APPLE';

interface ProviderConfig {
  issuers: string[];
  jwksUrl: string;
  audiences: () => string[];
  label: string;
  enumValue: OAuthProvider;
}

const PROVIDERS: Record<OAuthProviderName, ProviderConfig> = {
  google: {
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
    jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
    audiences: () => GOOGLE_CLIENT_IDS,
    label: 'Google',
    enumValue: 'GOOGLE',
  },
  apple: {
    issuers: ['https://appleid.apple.com'],
    jwksUrl: 'https://appleid.apple.com/auth/keys',
    audiences: () => APPLE_CLIENT_IDS,
    label: 'Apple',
    enumValue: 'APPLE',
  },
};

export interface OAuthClaims {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
}

const remoteKeySets = new Map<OAuthProviderName, JWTVerifyGetKey>();

const sha256Hex = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

@Injectable()
export class OAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
  ) {}

  /** Signing keys of the provider; overridden in tests so no network is needed. */
  public keySet(provider: OAuthProviderName): JWTVerifyGetKey {
    let keys = remoteKeySets.get(provider);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(PROVIDERS[provider].jwksUrl));
      remoteKeySets.set(provider, keys);
    }
    return keys;
  }

  isConfigured(provider: OAuthProviderName): boolean {
    return PROVIDERS[provider].audiences().length > 0;
  }

  /**
   * Verifies signature, issuer, audience and expiry of the provider's ID token and binds it to
   * the client's nonce (Apple's native flow sends the SHA-256 of the nonce, the web flows the raw one).
   */
  async verifyIdToken(provider: OAuthProviderName, dto: OAuthLoginDto): Promise<OAuthClaims> {
    const config = PROVIDERS[provider];
    const audience = config.audiences();
    if (audience.length === 0) {
      throw new ServiceUnavailableException(`${config.label} sign-in is not configured`);
    }
    try {
      const { payload } = await jwtVerify(dto.idToken, this.keySet(provider), {
        issuer: config.issuers,
        audience,
        algorithms: ['RS256'],
      });
      const claimNonce = typeof payload.nonce === 'string' ? payload.nonce : '';
      if (
        !dto.nonce ||
        !claimNonce ||
        !(
          constantTimeEqual(claimNonce, dto.nonce) ||
          constantTimeEqual(claimNonce, sha256Hex(dto.nonce))
        )
      ) {
        throw new Error('nonce mismatch');
      }
      if (typeof payload.sub !== 'string' || !payload.sub) throw new Error('missing subject');
      return {
        sub: payload.sub,
        email: typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : null,
        emailVerified: payload.email_verified === true || payload.email_verified === 'true',
        name: typeof payload.name === 'string' ? payload.name : (dto.name ?? null),
      };
    } catch {
      throw new UnauthorizedException(`Invalid ${config.label} sign-in`);
    }
  }

  /**
   * Sign in (or up) with a provider. Existing links win; otherwise a verified provider email is
   * linked to the matching account or creates a new one. Unverified emails are never trusted.
   */
  async signIn(provider: OAuthProviderName, dto: OAuthLoginDto) {
    const claims = await this.verifyIdToken(provider, dto);
    const enumValue = PROVIDERS[provider].enumValue;

    const linked = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider: enumValue, providerUserId: claims.sub } },
      include: { user: true },
    });
    let user = linked?.user ?? null;

    if (!user) {
      if (!claims.email || !claims.emailVerified) {
        throw new ForbiddenException('The provider did not return a verified email address');
      }
      const existing = await this.prisma.user.findUnique({ where: { email: claims.email } });
      if (existing && !existing.emailVerified) {
        // Pre-hijacking guard: whoever registered this never-confirmed address chose its
        // password, so it is wiped now that the real owner proved the email via the provider.
        await this.prisma.user.update({
          where: { id: existing.id },
          data: {
            passwordHash: null,
            emailVerificationToken: null,
            emailVerificationExpires: null,
            passwordResetToken: null,
            passwordResetExpires: null,
          },
        });
        await this.prisma.refreshToken.deleteMany({ where: { userId: existing.id } });
      }
      user = existing ?? (await this.authService.createOAuthUser(claims.email, claims.name));
      await this.prisma.oAuthAccount.create({
        data: {
          userId: user.id,
          provider: enumValue,
          providerUserId: claims.sub,
          email: claims.email,
        },
      });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ForbiddenException('Account temporarily locked. Try again later.');
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
        emailVerified: true,
      },
      include: { preferences: true },
    });
    return this.authService.toUserDto(updated);
  }

  /** Links a provider to the signed-in user (Security page). */
  async link(userId: string, provider: OAuthProviderName, dto: OAuthLoginDto): Promise<void> {
    const claims = await this.verifyIdToken(provider, dto);
    const enumValue = PROVIDERS[provider].enumValue;
    const taken = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerUserId: { provider: enumValue, providerUserId: claims.sub } },
    });
    if (taken) {
      if (taken.userId === userId) return;
      throw new ConflictException('This account is already linked to another user');
    }
    const sameProvider = await this.prisma.oAuthAccount.count({
      where: { userId, provider: enumValue },
    });
    if (sameProvider > 0)
      throw new ConflictException(`A ${PROVIDERS[provider].label} account is already linked`);
    await this.prisma.oAuthAccount.create({
      data: { userId, provider: enumValue, providerUserId: claims.sub, email: claims.email },
    });
  }

  /** Refuses to remove the last way to sign in. */
  async unlink(userId: string, provider: OAuthProviderName): Promise<void> {
    const enumValue = PROVIDERS[provider].enumValue;
    const [user, accounts, passkeys] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } }),
      this.prisma.oAuthAccount.findMany({ where: { userId } }),
      this.prisma.passkey.count({ where: { userId } }),
    ]);
    const target = accounts.find((a) => a.provider === enumValue);
    if (!target) return;
    if (!user?.passwordHash && passkeys === 0 && accounts.length === 1) {
      throw new ConflictException('Set a password or add a passkey before unlinking');
    }
    await this.prisma.oAuthAccount.delete({ where: { id: target.id } });
  }
}
