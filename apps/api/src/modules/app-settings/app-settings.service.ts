import { Injectable } from '@nestjs/common';
import { AiKeySlot, FEATURE_GRANTS, FeatureGrant } from '@luki-fitti/common/enums';
import type {
  AiSettingsDto,
  SocialSettingsDto,
  UpdateAiSettingsDto,
  UpdateSocialSettingsDto,
} from '@luki-fitti/common/schemas';
import { PrismaService } from '../database/prisma.service';
import {
  getAiKeyEncryptionConfig,
  SEAWEEDFS_ACCESS_KEY_API,
  SEAWEEDFS_ENDPOINT,
} from '@/config/env.config';

const SETTINGS_ID = 1;
const CACHE_TTL_MS = 10_000;

export interface AppSettingsRecord {
  aiWorkoutBuilderEnabled: boolean;
  aiMealPhotoEnabled: boolean;
  aiProgressTargetEnabled: boolean;
  workoutBuilderModel: string;
  workoutBuilderFallbacks: string[];
  mealPhotoModel: string;
  mealPhotoFallbacks: string[];
  progressTargetModel: string;
  progressTargetFallbacks: string[];
  aiDailyRunLimit: number;
  mealPhotoRetentionDays: number | null;
  userModelAllowlist: string[];
  socialEnabled: boolean;
  socialBetaUserIds: string[];
  updatedAt: Date;
}

/**
 * Pure feature resolution. AI needs a per-user OpenRouter key (there is no global key):
 *   - own key (USER) or admin key (ADMIN) → every feature whose global switch is on,
 *   - no key                              → nothing.
 * There are no per-user feature grants anymore: a usable key unlocks everything enabled.
 * Exported for unit tests.
 */
export function resolveActiveFeatures(
  settings: Pick<
    AppSettingsRecord,
    'aiWorkoutBuilderEnabled' | 'aiMealPhotoEnabled' | 'aiProgressTargetEnabled'
  >,
  keySource: AiKeySlot | null,
): FeatureGrant[] {
  if (!keySource) return [];
  const switches: Record<FeatureGrant, boolean> = {
    [FeatureGrant.AI_WORKOUT_BUILDER]: settings.aiWorkoutBuilderEnabled,
    [FeatureGrant.AI_MEAL_PHOTO]: settings.aiMealPhotoEnabled,
    [FeatureGrant.AI_PROGRESS_TARGET]: settings.aiProgressTargetEnabled,
  };
  return FEATURE_GRANTS.filter((grant) => switches[grant]);
}

/** Which key would pay for a run: the own key wins over the admin-assigned key. */
export function effectiveKeySource(slots: readonly string[]): AiKeySlot | null {
  if (slots.includes(AiKeySlot.USER)) return AiKeySlot.USER;
  if (slots.includes(AiKeySlot.ADMIN)) return AiKeySlot.ADMIN;
  return null;
}

@Injectable()
export class AppSettingsService {
  private cache: { value: AppSettingsRecord; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Whether per-user OpenRouter keys can be stored/decrypted (AI_KEY_ENCRYPTION_KEY set). */
  get encryptionConfigured(): boolean {
    return getAiKeyEncryptionConfig().current !== null;
  }

  get storageConfigured(): boolean {
    return SEAWEEDFS_ENDPOINT.length > 0 && SEAWEEDFS_ACCESS_KEY_API.length > 0;
  }

  async get(): Promise<AppSettingsRecord> {
    if (this.cache && this.cache.expiresAt > Date.now()) return this.cache.value;
    const value = await this.prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
    this.cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  }

  /** Key source for a user (slot presence only — ciphertext is never selected here). */
  async keySource(userId: string): Promise<AiKeySlot | null> {
    if (!this.encryptionConfigured) return null;
    const rows = await this.prisma.userAiKey.findMany({
      where: { userId },
      select: { slot: true },
    });
    return effectiveKeySource(rows.map((r) => r.slot));
  }

  async resolveActiveFeatures(user: { id: string }): Promise<FeatureGrant[]> {
    const source = await this.keySource(user.id);
    return resolveActiveFeatures(await this.get(), source);
  }

  /** Features whose global switch is on (encryption must be configured to offer AI at all). */
  async enabledFeatures(): Promise<FeatureGrant[]> {
    if (!this.encryptionConfigured) return [];
    return resolveActiveFeatures(await this.get(), AiKeySlot.USER);
  }

  /** Whether the user has a usable key slot (own or admin-assigned). */
  async hasAiKey(userId: string): Promise<boolean> {
    return (await this.keySource(userId)) !== null;
  }

  async getAiSettings(): Promise<AiSettingsDto> {
    return this.toDto(await this.get());
  }

  async updateAiSettings(dto: UpdateAiSettingsDto): Promise<AiSettingsDto> {
    const dedupe = (list?: string[]) => (list ? [...new Set(list)] : undefined);
    const value = await this.prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        ...dto,
        workoutBuilderFallbacks: dedupe(dto.workoutBuilderFallbacks),
        mealPhotoFallbacks: dedupe(dto.mealPhotoFallbacks),
        progressTargetFallbacks: dedupe(dto.progressTargetFallbacks),
        userModelAllowlist: dedupe(dto.userModelAllowlist),
      },
      update: {
        ...dto,
        workoutBuilderFallbacks: dedupe(dto.workoutBuilderFallbacks),
        mealPhotoFallbacks: dedupe(dto.mealPhotoFallbacks),
        progressTargetFallbacks: dedupe(dto.progressTargetFallbacks),
        userModelAllowlist: dedupe(dto.userModelAllowlist),
      },
    });
    this.cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return this.toDto(value);
  }

  async getSocialSettings(): Promise<SocialSettingsDto> {
    const value = await this.get();
    return { socialEnabled: value.socialEnabled, socialBetaUserIds: value.socialBetaUserIds };
  }

  async updateSocialSettings(dto: UpdateSocialSettingsDto): Promise<SocialSettingsDto> {
    const value = await this.prisma.appSettings.upsert({
      where: { id: SETTINGS_ID },
      create: {
        id: SETTINGS_ID,
        ...dto,
        socialBetaUserIds: dto.socialBetaUserIds ? [...new Set(dto.socialBetaUserIds)] : undefined,
      },
      update: {
        ...dto,
        socialBetaUserIds: dto.socialBetaUserIds ? [...new Set(dto.socialBetaUserIds)] : undefined,
      },
    });
    this.cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return this.getSocialSettings();
  }

  private async toDto(value: AppSettingsRecord): Promise<AiSettingsDto> {
    const [usersWithOwnKey, usersWithAdminKey] = await Promise.all([
      this.prisma.userAiKey.count({ where: { slot: AiKeySlot.USER } }),
      this.prisma.userAiKey.count({ where: { slot: AiKeySlot.ADMIN } }),
    ]);
    return {
      aiWorkoutBuilderEnabled: value.aiWorkoutBuilderEnabled,
      aiMealPhotoEnabled: value.aiMealPhotoEnabled,
      workoutBuilderModel: value.workoutBuilderModel,
      workoutBuilderFallbacks: value.workoutBuilderFallbacks,
      mealPhotoModel: value.mealPhotoModel,
      mealPhotoFallbacks: value.mealPhotoFallbacks,
      aiProgressTargetEnabled: value.aiProgressTargetEnabled,
      progressTargetModel: value.progressTargetModel,
      progressTargetFallbacks: value.progressTargetFallbacks,
      aiDailyRunLimit: value.aiDailyRunLimit,
      mealPhotoRetentionDays: value.mealPhotoRetentionDays,
      userModelAllowlist: value.userModelAllowlist,
      encryptionConfigured: this.encryptionConfigured,
      usersWithOwnKey,
      usersWithAdminKey,
      storageConfigured: this.storageConfigured,
      updatedAt: value.updatedAt.toISOString(),
    };
  }
}
