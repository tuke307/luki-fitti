import { Injectable } from '@nestjs/common';
import { FeatureGrant, isFeatureGrant } from '@luki-fitti/common/enums';
import type { AiSettingsDto, UpdateAiSettingsDto } from '@luki-fitti/common/schemas';
import { PrismaService } from '../database/prisma.service';
import {
  OPENROUTER_API_KEY,
  SEAWEEDFS_ACCESS_KEY_API,
  SEAWEEDFS_ENDPOINT,
} from '@/config/env.config';

const SETTINGS_ID = 1;
const CACHE_TTL_MS = 10_000;

export interface AppSettingsRecord {
  aiWorkoutBuilderEnabled: boolean;
  aiMealPhotoEnabled: boolean;
  workoutBuilderModel: string;
  workoutBuilderFallbacks: string[];
  mealPhotoModel: string;
  mealPhotoFallbacks: string[];
  aiDailyRunLimit: number;
  mealPhotoRetentionDays: number | null;
  updatedAt: Date;
}

/**
 * Pure feature resolution: a feature is active only if the user holds the grant, the global
 * switch is on and the AI provider is configured. Exported for unit tests.
 */
export function resolveActiveFeatures(
  grants: readonly string[],
  settings: Pick<AppSettingsRecord, 'aiWorkoutBuilderEnabled' | 'aiMealPhotoEnabled'>,
  providerConfigured: boolean,
): FeatureGrant[] {
  if (!providerConfigured) return [];
  const switches: Record<FeatureGrant, boolean> = {
    [FeatureGrant.AI_WORKOUT_BUILDER]: settings.aiWorkoutBuilderEnabled,
    [FeatureGrant.AI_MEAL_PHOTO]: settings.aiMealPhotoEnabled,
  };
  return [...new Set(grants)].filter(isFeatureGrant).filter((grant) => switches[grant]);
}

@Injectable()
export class AppSettingsService {
  private cache: { value: AppSettingsRecord; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  get providerConfigured(): boolean {
    return OPENROUTER_API_KEY.length > 0;
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

  async resolveActiveFeatures(grants: readonly string[]): Promise<FeatureGrant[]> {
    if (grants.length === 0) return [];
    return resolveActiveFeatures(grants, await this.get(), this.providerConfigured);
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
      },
      update: {
        ...dto,
        workoutBuilderFallbacks: dedupe(dto.workoutBuilderFallbacks),
        mealPhotoFallbacks: dedupe(dto.mealPhotoFallbacks),
      },
    });
    this.cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return this.toDto(value);
  }

  private toDto(value: AppSettingsRecord): AiSettingsDto {
    return {
      aiWorkoutBuilderEnabled: value.aiWorkoutBuilderEnabled,
      aiMealPhotoEnabled: value.aiMealPhotoEnabled,
      workoutBuilderModel: value.workoutBuilderModel,
      workoutBuilderFallbacks: value.workoutBuilderFallbacks,
      mealPhotoModel: value.mealPhotoModel,
      mealPhotoFallbacks: value.mealPhotoFallbacks,
      aiDailyRunLimit: value.aiDailyRunLimit,
      mealPhotoRetentionDays: value.mealPhotoRetentionDays,
      providerConfigured: this.providerConfigured,
      storageConfigured: this.storageConfigured,
      updatedAt: value.updatedAt.toISOString(),
    };
  }
}
