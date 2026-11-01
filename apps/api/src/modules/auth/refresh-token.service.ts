import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { RefreshToken } from '@luki-fitti/database';
import { PrismaService } from '../database/prisma.service';
import { REFRESH_TOKEN_REUSE_GRACE_MS } from '@/config/env.config';

export type RotateResult =
  | { status: 'ok'; familyId: string; deviceLabel: string | null }
  | { status: 'invalid' }
  | { status: 'reused' };

@Injectable()
export class RefreshTokenService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async create(data: {
    token: string;
    userId: string;
    expiresAt: Date;
    familyId: string;
    deviceLabel?: string | null;
  }): Promise<RefreshToken> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId: data.userId, expiresAt: { lt: new Date() } },
    });
    return this.prisma.refreshToken.create({
      data: {
        token: this.hashToken(data.token),
        userId: data.userId,
        expiresAt: data.expiresAt,
        familyId: data.familyId,
        deviceLabel: data.deviceLabel ?? null,
      },
    });
  }

  /**
   * Marks a refresh token as used. Rotated rows are kept until expiry so a replay outside the
   * grace window can be detected and revokes only that token's family (one device session).
   */
  async rotate(token: string): Promise<RotateResult> {
    const now = new Date();
    const record = await this.prisma.refreshToken.findUnique({
      where: { token: this.hashToken(token) },
    });
    if (!record || record.expiresAt <= now) return { status: 'invalid' };

    const ok = {
      status: 'ok',
      familyId: record.familyId,
      deviceLabel: record.deviceLabel,
    } as const;
    const claimed = await this.prisma.refreshToken.updateMany({
      where: { id: record.id, rotatedAt: null },
      data: { rotatedAt: now, lastUsedAt: now },
    });
    if (claimed.count === 1) return ok;

    const rotatedAt =
      record.rotatedAt ??
      (await this.prisma.refreshToken.findUnique({ where: { id: record.id } }))?.rotatedAt;
    if (rotatedAt && now.getTime() - rotatedAt.getTime() <= REFRESH_TOKEN_REUSE_GRACE_MS) {
      return ok;
    }

    await this.deleteByFamilyId(record.familyId);
    return { status: 'reused' };
  }

  async deleteByFamilyId(familyId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { familyId } });
  }

  async deleteByHashedTokenOf(token: string): Promise<void> {
    const record = await this.prisma.refreshToken.findUnique({
      where: { token: this.hashToken(token) },
      select: { familyId: true },
    });
    if (record) await this.deleteByFamilyId(record.familyId);
  }

  async deleteByUserId(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }
}
