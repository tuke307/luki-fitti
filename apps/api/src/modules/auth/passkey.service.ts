import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import type { PasskeyDto, PasskeyLoginOptionsDto } from '@luki-fitti/common/schemas';
import { WEBAUTHN_ORIGINS, WEBAUTHN_RP_ID, WEBAUTHN_RP_NAME } from '@/config/env.config';
import { getRedis } from '@/utils/redis.util';
import { PrismaService } from '../database/prisma.service';

const CHALLENGE_TTL_SECONDS = 5 * 60;
const MAX_PASSKEYS = 10;

export interface ChallengeStore {
  put(key: string, challenge: string): Promise<void>;
  /** Returns and deletes in one step so a challenge can only be used once. */
  take(key: string): Promise<string | null>;
}

const redisChallenges: ChallengeStore = {
  put: async (key, challenge) => {
    await getRedis().set(`webauthn:${key}`, challenge, 'EX', CHALLENGE_TTL_SECONDS);
  },
  take: async (key) => getRedis().getdel(`webauthn:${key}`),
};

type PasskeyRow = {
  id: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: Date;
  lastUsedAt: Date | null;
};

const toDto = (p: PasskeyRow): PasskeyDto => ({
  id: p.id,
  name: p.name,
  deviceType: p.deviceType,
  backedUp: p.backedUp,
  createdAt: p.createdAt.toISOString(),
  lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
});

@Injectable()
export class PasskeyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Overridable in tests (avoids a Redis connection). */
  public challenges: ChallengeStore = redisChallenges;

  async list(userId: string): Promise<PasskeyDto[]> {
    const rows = await this.prisma.passkey.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDto);
  }

  async registrationOptions(user: { id: string; email: string; name: string | null }) {
    const existing = await this.prisma.passkey.findMany({ where: { userId: user.id } });
    if (existing.length >= MAX_PASSKEYS) {
      throw new ConflictException(`At most ${MAX_PASSKEYS} passkeys per account`);
    }
    const options = await generateRegistrationOptions({
      rpName: WEBAUTHN_RP_NAME,
      rpID: WEBAUTHN_RP_ID,
      userName: user.email,
      userDisplayName: user.name ?? user.email,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: existing.map((p) => ({
        id: p.credentialId,
        transports: p.transports,
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    });
    await this.challenges.put(`reg:${user.id}`, options.challenge);
    return options;
  }

  async verifyRegistration(
    userId: string,
    response: Record<string, unknown>,
    name?: string,
  ): Promise<PasskeyDto> {
    const expectedChallenge = await this.challenges.take(`reg:${userId}`);
    if (!expectedChallenge) throw new BadRequestException('Passkey request expired');

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: response as unknown as RegistrationResponseJSON,
        expectedChallenge,
        expectedOrigin: WEBAUTHN_ORIGINS,
        expectedRPID: WEBAUTHN_RP_ID,
        requireUserVerification: true,
      });
    } catch {
      throw new BadRequestException('Passkey could not be verified');
    }
    if (!verification.verified) throw new BadRequestException('Passkey could not be verified');

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const count = await this.prisma.passkey.count({ where: { userId } });
    const row = await this.prisma.passkey
      .create({
        data: {
          userId,
          credentialId: credential.id,
          publicKey: Buffer.from(credential.publicKey),
          counter: BigInt(credential.counter),
          transports: credential.transports ?? [],
          deviceType: credentialDeviceType,
          backedUp: credentialBackedUp,
          name: name?.trim() || `Passkey ${count + 1}`,
        },
      })
      .catch((err: unknown) => {
        if ((err as { code?: unknown }).code === 'P2002') {
          throw new ConflictException('This passkey is already registered');
        }
        throw err;
      });
    return toDto(row);
  }

  /** Discoverable-credential login: no username needed, the authenticator picks the account. */
  async loginOptions(): Promise<PasskeyLoginOptionsDto> {
    const options = await generateAuthenticationOptions({
      rpID: WEBAUTHN_RP_ID,
      userVerification: 'required',
    });
    const challengeId = randomBytes(24).toString('base64url');
    await this.challenges.put(`auth:${challengeId}`, options.challenge);
    return { challengeId, options: options as unknown as Record<string, unknown> };
  }

  /** Returns the id of the user the verified passkey belongs to. */
  async verifyLogin(challengeId: string, response: Record<string, unknown>): Promise<string> {
    const expectedChallenge = await this.challenges.take(`auth:${challengeId}`);
    if (!expectedChallenge) throw new UnauthorizedException('Passkey request expired');

    const credentialId = typeof response.id === 'string' ? response.id : '';
    const passkey = credentialId
      ? await this.prisma.passkey.findUnique({
          where: { credentialId },
          include: { user: { select: { id: true, emailVerified: true, lockedUntil: true } } },
        })
      : null;
    if (!passkey) throw new UnauthorizedException('Unknown passkey');

    const userHandle = (response.response as { userHandle?: string } | undefined)?.userHandle;
    if (userHandle && Buffer.from(userHandle, 'base64url').toString('utf8') !== passkey.userId) {
      throw new UnauthorizedException('Passkey does not match the account');
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: response as unknown as AuthenticationResponseJSON,
        expectedChallenge,
        expectedOrigin: WEBAUTHN_ORIGINS,
        expectedRPID: WEBAUTHN_RP_ID,
        requireUserVerification: true,
        credential: {
          id: passkey.credentialId,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: Number(passkey.counter),
          transports: passkey.transports,
        },
      });
    } catch {
      throw new UnauthorizedException('Passkey could not be verified');
    }
    if (!verification.verified) throw new UnauthorizedException('Passkey could not be verified');

    if (passkey.user.lockedUntil && passkey.user.lockedUntil > new Date()) {
      throw new ForbiddenException('Account temporarily locked');
    }
    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: {
        counter: BigInt(verification.authenticationInfo.newCounter),
        backedUp: verification.authenticationInfo.credentialBackedUp,
        lastUsedAt: new Date(),
      },
    });
    return passkey.userId;
  }

  async rename(userId: string, id: string, name: string): Promise<PasskeyDto> {
    const owned = await this.prisma.passkey.findFirst({ where: { id, userId } });
    if (!owned) throw new NotFoundException('Passkey not found');
    return toDto(await this.prisma.passkey.update({ where: { id }, data: { name } }));
  }

  /** Refuses to remove the last way to sign in. */
  async remove(userId: string, id: string): Promise<void> {
    const owned = await this.prisma.passkey.findFirst({ where: { id, userId } });
    if (!owned) throw new NotFoundException('Passkey not found');
    const [user, otherPasskeys, oauthAccounts] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } }),
      this.prisma.passkey.count({ where: { userId, id: { not: id } } }),
      this.prisma.oAuthAccount.count({ where: { userId } }),
    ]);
    if (!user?.passwordHash && otherPasskeys === 0 && oauthAccounts === 0) {
      throw new ConflictException('Keep at least one way to sign in');
    }
    await this.prisma.passkey.delete({ where: { id } });
  }
}
