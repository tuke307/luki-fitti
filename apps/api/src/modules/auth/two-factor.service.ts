import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import type { RecoveryCodesDto, TwoFactorSetupDto } from '@luki-fitti/common/schemas';
import { constantTimeEqual } from '@luki-fitti/common/utils/crypto';
import { incrementUserCounter } from '@/utils/rate-limit.util';
import { decryptSecret, encryptSecret, hashRecoveryCode } from '@/utils/secret-box.util';
import { PrismaService } from '../database/prisma.service';

const ISSUER = 'LukiFitti';
const TOTP_PERIOD_SECONDS = 30;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const MAX_CODE_ATTEMPTS = 5;
const ATTEMPT_WINDOW_SECONDS = 5 * 60;

/** `1234 56` / `123456` → TOTP; anything else is treated as a recovery code. */
const normalizeTotp = (code: string) => code.replace(/\s+/g, '');
const normalizeRecovery = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, '');

export function generateRecoveryCode(): string {
  const chars = Array.from(
    { length: 10 },
    () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)],
  );
  return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
}

@Injectable()
export class TwoFactorService {
  constructor(private readonly prisma: PrismaService) {}

  /** Overridable in tests (avoids a Redis connection). */
  public countAttempt = (key: string, windowSeconds: number) =>
    incrementUserCounter(key, windowSeconds);

  /** Overridable in tests. */
  public now = () => Date.now();

  async isEnabled(userId: string): Promise<boolean> {
    const row = await this.prisma.twoFactor.findUnique({ where: { userId } });
    return !!row?.enabledAt;
  }

  async recoveryCodesRemaining(userId: string): Promise<number> {
    return this.prisma.recoveryCode.count({ where: { userId, usedAt: null } });
  }

  /** Starts (or restarts) setup. 2FA only becomes active after `enable` confirms a code. */
  async setup(user: { id: string; email: string }): Promise<TwoFactorSetupDto> {
    const existing = await this.prisma.twoFactor.findUnique({ where: { userId: user.id } });
    if (existing?.enabledAt) throw new ConflictException('Two-factor authentication is already on');

    const secret = generateSecret();
    const secretEnc = encryptSecret(secret);
    await this.prisma.twoFactor.upsert({
      where: { userId: user.id },
      update: { secretEnc, lastStep: null },
      create: { userId: user.id, secretEnc },
    });
    return { secret, otpauthUrl: generateURI({ issuer: ISSUER, label: user.email, secret }) };
  }

  async enable(userId: string, code: string): Promise<RecoveryCodesDto> {
    const row = await this.prisma.twoFactor.findUnique({ where: { userId } });
    if (!row) throw new BadRequestException('Start the setup first');
    if (row.enabledAt) throw new ConflictException('Two-factor authentication is already on');

    await this.throttle(userId);
    const step = this.matchTotp(decryptSecret(row.secretEnc), code);
    if (step === null) throw new UnauthorizedException('Invalid code');

    await this.prisma.twoFactor.update({
      where: { userId },
      data: { enabledAt: new Date(), lastStep: step },
    });
    return { recoveryCodes: await this.replaceRecoveryCodes(userId) };
  }

  /**
   * Checks a TOTP or a recovery code for the login/step-up flows. Consumes what it accepts so
   * neither a TOTP step nor a recovery code can be replayed.
   */
  async verify(userId: string, code: string): Promise<boolean> {
    const row = await this.prisma.twoFactor.findUnique({ where: { userId } });
    if (!row?.enabledAt) return false;
    await this.throttle(userId);

    if (/^\d{6}$/.test(normalizeTotp(code))) {
      const step = this.matchTotp(decryptSecret(row.secretEnc), code);
      if (step === null) return false;
      const claimed = await this.prisma.twoFactor.updateMany({
        where: { userId, OR: [{ lastStep: null }, { lastStep: { lt: step } }] },
        data: { lastStep: step },
      });
      return claimed.count === 1;
    }
    return this.consumeRecoveryCode(userId, code);
  }

  async disable(userId: string, code: string): Promise<void> {
    if (!(await this.verify(userId, code))) throw new UnauthorizedException('Invalid code');
    await this.prisma.$transaction([
      this.prisma.twoFactor.delete({ where: { userId } }),
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
    ]);
  }

  async regenerateRecoveryCodes(userId: string, code: string): Promise<RecoveryCodesDto> {
    if (!(await this.verify(userId, code))) throw new UnauthorizedException('Invalid code');
    return { recoveryCodes: await this.replaceRecoveryCodes(userId) };
  }

  private matchTotp(secret: string, code: string): number | null {
    const token = normalizeTotp(code);
    if (!/^\d{6}$/.test(token)) return null;
    const epoch = Math.floor(this.now() / 1000);
    const result = verifySync({ secret, token, epoch, epochTolerance: TOTP_PERIOD_SECONDS });
    return result.valid ? Math.floor(epoch / TOTP_PERIOD_SECONDS) + result.delta : null;
  }

  private async consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
    const wanted = hashRecoveryCode(normalizeRecovery(code));
    const candidates = await this.prisma.recoveryCode.findMany({ where: { userId, usedAt: null } });
    const match = candidates.find((c) => constantTimeEqual(c.codeHash, wanted));
    if (!match) return false;
    const claimed = await this.prisma.recoveryCode.updateMany({
      where: { id: match.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return claimed.count === 1;
  }

  private async replaceRecoveryCodes(userId: string): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await this.prisma.$transaction([
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
      this.prisma.recoveryCode.createMany({
        data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(normalizeRecovery(c)) })),
      }),
    ]);
    return codes;
  }

  private async throttle(userId: string): Promise<void> {
    const attempts = await this.countAttempt(`mfa:attempts:${userId}`, ATTEMPT_WINDOW_SECONDS);
    if (attempts > MAX_CODE_ATTEMPTS) {
      throw new HttpException(
        'Too many code attempts. Try again in a few minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
