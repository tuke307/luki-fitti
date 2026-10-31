import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AiKeySlot } from '@luki-fitti/common/enums';
import {
  OpenRouterApiKeySchema,
  type AdminUserAiKeyDto,
  type AiKeySlotStatusDto,
  type AiKeyStatusDto,
} from '@luki-fitti/common/schemas';
import { getAiKeyEncryptionConfig, type AiKeyEncryptionConfig } from '@/config/env.config';
import { PrismaService } from '../database/prisma.service';
import { OpenRouterClient } from './openrouter.client';
import { aiKeyAad, decryptWithRotation, encryptSecret, keyHint } from './ai-key-crypto';

export interface ResolvedAiKey {
  apiKey: string;
  source: AiKeySlot;
}

/** Only metadata columns — ciphertext/iv/authTag are selected exclusively in `resolveForRun`. */
const STATUS_SELECT = { slot: true, last4: true, updatedAt: true } as const;

type StatusRow = { slot: string; last4: string; updatedAt: Date };

const toSlotStatus = (row: StatusRow | undefined): AiKeySlotStatusDto | null =>
  row ? { last4: row.last4, updatedAt: row.updatedAt.toISOString() } : null;

/**
 * Per-user OpenRouter keys (bring-your-own-key), AES-256-GCM encrypted at rest.
 *
 * Two slots per user: USER (set by the user) and ADMIN (assigned by an admin). The user's own
 * key wins. Plaintext keys never leave this service except as the Authorization header of an
 * OpenRouter request; clients only get `{ hasKey, last4, source, updatedAt }`-style status.
 */
@Injectable()
export class AiKeyService implements OnModuleInit {
  private readonly logger = new Logger(AiKeyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly openRouter: OpenRouterClient,
  ) {}

  /** Master key config (overridable in tests). */
  protected encryption(): AiKeyEncryptionConfig {
    return getAiKeyEncryptionConfig();
  }

  /** Validates the master key at startup (throws in production if malformed). */
  onModuleInit(): void {
    this.encryption();
  }

  get available(): boolean {
    return this.encryption().current !== null;
  }

  async status(userId: string): Promise<AiKeyStatusDto> {
    const rows = await this.prisma.userAiKey.findMany({ where: { userId }, select: STATUS_SELECT });
    const own = rows.find((r) => r.slot === AiKeySlot.USER);
    const admin = rows.find((r) => r.slot === AiKeySlot.ADMIN);
    const available = this.available;
    const source = !available ? null : own ? AiKeySlot.USER : admin ? AiKeySlot.ADMIN : null;
    return {
      available,
      hasKey: source !== null,
      source,
      own: toSlotStatus(own),
      adminAssigned: Boolean(admin),
    };
  }

  /** Admin view for many users at once (no N+1). Never includes the USER key hint. */
  async adminStatusMany(userIds: string[]): Promise<Map<string, AdminUserAiKeyDto>> {
    const rows = userIds.length
      ? await this.prisma.userAiKey.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true, ...STATUS_SELECT },
        })
      : [];
    const result = new Map<string, AdminUserAiKeyDto>();
    for (const id of userIds) result.set(id, { hasOwnKey: false, admin: null });
    for (const row of rows) {
      const entry = result.get(row.userId);
      if (!entry) continue;
      if (row.slot === AiKeySlot.USER) entry.hasOwnKey = true;
      if (row.slot === AiKeySlot.ADMIN) entry.admin = toSlotStatus(row);
    }
    return result;
  }

  async adminStatus(userId: string): Promise<AdminUserAiKeyDto> {
    return (await this.adminStatusMany([userId])).get(userId) ?? { hasOwnKey: false, admin: null };
  }

  async setUserKey(userId: string, apiKey: string): Promise<AiKeyStatusDto> {
    await this.store(userId, AiKeySlot.USER, apiKey, null);
    return this.status(userId);
  }

  async clearUserKey(userId: string): Promise<AiKeyStatusDto> {
    await this.prisma.userAiKey.deleteMany({ where: { userId, slot: AiKeySlot.USER } });
    return this.status(userId);
  }

  async setAdminKey(adminId: string, userId: string, apiKey: string): Promise<AdminUserAiKeyDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    await this.store(userId, AiKeySlot.ADMIN, apiKey, adminId);
    this.logger.log(`Admin ${adminId} assigned an AI key to user ${userId}`);
    return this.adminStatus(userId);
  }

  async clearAdminKey(adminId: string, userId: string): Promise<AdminUserAiKeyDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException('User not found');
    await this.prisma.userAiKey.deleteMany({ where: { userId, slot: AiKeySlot.ADMIN } });
    this.logger.log(`Admin ${adminId} removed the AI key of user ${userId}`);
    return this.adminStatus(userId);
  }

  /**
   * Key for an AI run: the user's own key, otherwise the admin-assigned key. Fails closed: if
   * the own key exists but can't be decrypted, no key is returned (no silent fallback that
   * would change grant/quota rules).
   */
  async resolveForRun(userId: string): Promise<ResolvedAiKey | null> {
    const { current, previous } = this.encryption();
    if (!current) return null;
    const rows = await this.prisma.userAiKey.findMany({
      where: { userId },
      select: { id: true, slot: true, ciphertext: true, iv: true, authTag: true, keyVersion: true },
    });
    const row =
      rows.find((r) => r.slot === AiKeySlot.USER) ?? rows.find((r) => r.slot === AiKeySlot.ADMIN);
    if (!row) return null;
    const slot = row.slot as AiKeySlot;
    const aad = aiKeyAad(userId, slot);
    try {
      const { plaintext, stale } = decryptWithRotation(row, aad, current, previous);
      if (stale) {
        // Lazy rotation: re-encrypt with the current master key.
        const reencrypted = encryptSecret(plaintext, current, aad);
        await this.prisma.userAiKey
          .update({ where: { id: row.id }, data: reencrypted })
          .catch(() => this.logger.warn(`Could not re-encrypt AI key ${row.id}`));
      }
      return { apiKey: plaintext, source: slot };
    } catch {
      this.logger.warn(
        `AI key ${row.id} (${slot}) could not be decrypted — check AI_KEY_ENCRYPTION_KEY`,
      );
      return null;
    }
  }

  private async store(userId: string, slot: AiKeySlot, rawKey: string, setByUserId: string | null) {
    const { current } = this.encryption();
    if (!current) {
      throw new ServiceUnavailableException({
        message: 'Storing API keys is not available on this server.',
        code: 'AI_KEY_STORAGE_UNAVAILABLE',
      });
    }
    // Defense in depth: controllers already validate with the same schema.
    const parsed = OpenRouterApiKeySchema.safeParse(rawKey);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'Invalid OpenRouter API key',
        code: 'AI_KEY_INVALID',
      });
    }
    const apiKey = parsed.data;
    if ((await this.openRouter.verifyKey(apiKey)) === 'invalid') {
      throw new BadRequestException({
        message: 'OpenRouter rejected this API key.',
        code: 'AI_KEY_INVALID',
      });
    }
    const encrypted = encryptSecret(apiKey, current, aiKeyAad(userId, slot));
    const data = { ...encrypted, last4: keyHint(apiKey), setByUserId };
    await this.prisma.userAiKey.upsert({
      where: { userId_slot: { userId, slot } },
      create: { userId, slot, ...data },
      update: data,
      select: { id: true },
    });
  }
}
