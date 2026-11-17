import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import type { ApiKey } from '@luki-fitti/database';
import { ApiKeyScope } from '@luki-fitti/common/enums';
import type {
  ApiKeyDto,
  ApiKeyListDto,
  CreateApiKeyDto,
  CreatedApiKeyDto,
} from '@luki-fitti/common/schemas';
import { API_KEY_MAX_ACTIVE, apiKeyDisplayPrefix } from '@luki-fitti/common/utils';
import { logger } from '@luki-fitti/logger';
import { PrismaService } from '../database/prisma.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { EmailService } from '../email/email.service';
import {
  formatApiKey,
  generateApiKeyId,
  generateApiKeySecret,
  hashApiKeySecret,
} from './api-key.crypto';

/** Expired keys stay listed for 30 days, then are purged lazily on list. */
const RETENTION_AFTER_END_MS = 30 * 24 * 60 * 60 * 1000;
const ID_COLLISION_RETRIES = 5;

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appSettings: AppSettingsService,
    private readonly emailService: EmailService,
  ) {}

  private toDto(key: ApiKey): ApiKeyDto {
    const now = Date.now();
    const expired = key.expiresAt !== null && key.expiresAt.getTime() <= now;
    return {
      id: key.id,
      prefix: apiKeyDisplayPrefix(key.id),
      name: key.name,
      scopes: key.scopes as ApiKeyScope[],
      createdAt: key.createdAt.toISOString(),
      expiresAt: key.expiresAt?.toISOString() ?? null,
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
      status: expired ? 'expired' : 'active',
    };
  }

  /** No scheduler in the API: purge this user's keys that ended >30 days ago. */
  private async purgeStale(userId: string): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_AFTER_END_MS);
    await this.prisma.apiKey.deleteMany({
      where: {
        userId,
        OR: [{ revokedAt: { lt: cutoff } }, { expiresAt: { lt: cutoff } }],
      },
    });
  }

  async list(userId: string): Promise<ApiKeyListDto> {
    await this.purgeStale(userId);
    const cutoff = new Date(Date.now() - RETENTION_AFTER_END_MS);
    const [settings, keys] = await Promise.all([
      this.appSettings.get(),
      this.prisma.apiKey.findMany({
        where: {
          userId,
          revokedAt: null,
          // Expired keys remain visible for 30 days after expiry, greyed out.
          OR: [{ expiresAt: null }, { expiresAt: { gt: cutoff } }],
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return { enabled: settings.apiKeysEnabled, keys: keys.map((k) => this.toDto(k)) };
  }

  async create(userId: string, dto: CreateApiKeyDto): Promise<CreatedApiKeyDto> {
    const settings = await this.appSettings.get();
    if (!settings.apiKeysEnabled) {
      throw new ForbiddenException({ message: 'API keys are disabled', code: 'API_KEYS_DISABLED' });
    }

    // Re-authentication: same check as AuthService.changePassword.
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const isCurrentValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const now = new Date();
    const active = await this.prisma.apiKey.count({
      where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    });
    if (active >= API_KEY_MAX_ACTIVE) {
      throw new ConflictException({
        message: `At most ${API_KEY_MAX_ACTIVE} active API keys`,
        code: 'API_KEY_LIMIT',
      });
    }

    const secret = generateApiKeySecret();
    const secretHash = hashApiKeySecret(secret);
    const expiresAt =
      dto.expiresInDays === null ? null : new Date(now.getTime() + dto.expiresInDays * 86_400_000);

    let key: ApiKey | null = null;
    for (let attempt = 0; attempt < ID_COLLISION_RETRIES; attempt++) {
      const id = generateApiKeyId();
      try {
        key = await this.prisma.apiKey.create({
          data: {
            id,
            userId,
            name: dto.name,
            secretHash,
            scopes: dto.scopes,
            expiresAt,
          },
        });
        break;
      } catch (err) {
        // Retry only on a PK collision (P2002); anything else is a real failure.
        if ((err as { code?: string }).code !== 'P2002' || attempt === ID_COLLISION_RETRIES - 1) {
          throw err;
        }
      }
    }

    // The email notice must never fail key creation (BullMQ/SMTP can be down).
    try {
      await this.emailService.enqueueApiKeyCreatedEmail(
        { id: userId, email: user.email, name: user.name },
        dto.name,
      );
    } catch (err) {
      logger.warn(`API-key-created email could not be enqueued for user ${userId}: ${err}`);
    }

    return { apiKey: this.toDto(key!), key: formatApiKey(key!.id, secret) };
  }

  /** Works even while the kill switch is off — revoke must always be possible. */
  async revoke(userId: string, id: string): Promise<{ success: boolean }> {
    const updated = await this.prisma.apiKey.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (updated.count === 0) {
      throw new NotFoundException('API key not found');
    }
    return { success: true };
  }
}
