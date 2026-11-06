import { Injectable } from '@nestjs/common';
import { AiKeySlot, AiRunStatus, AiSkillName } from '@luki-fitti/common/enums';
import {
  AiModelChoicesSchema,
  type AiModelChoicesDto,
  type AiModelInfoDto,
  type AiModelOptionDto,
  type AiModelPricingDto,
  type AiModelsDto,
  type AiSkillModelsDto,
} from '@luki-fitti/common/schemas';
import { PrismaService } from '../database/prisma.service';
import { AppSettingsService, type AppSettingsRecord } from '../app-settings/app-settings.service';
import { OpenRouterModelsService } from './openrouter-models.service';

const USER_HISTORY_RUNS = 20;
const GLOBAL_HISTORY_RUNS = 200;

/**
 * What each skill needs from a model. Every skill finishes by calling its answer tool
 * (function calling), so all need tools; the meal photo skill also sends images.
 */
export const SKILL_REQUIREMENTS: Record<AiSkillName, { tools: boolean; images: boolean }> = {
  [AiSkillName.WORKOUT_BUILDER]: { tools: true, images: false },
  [AiSkillName.MEAL_ANALYZER]: { tools: true, images: true },
  [AiSkillName.MEAL_TEXT_ANALYZER]: { tools: true, images: false },
};

/** Admin default per skill (the meal text skill shares the meal photo model). */
export function defaultModelFor(skill: AiSkillName, s: AppSettingsRecord): string {
  return skill === AiSkillName.WORKOUT_BUILDER ? s.workoutBuilderModel : s.mealPhotoModel;
}

export function isCapable(model: AiModelInfoDto, skill: AiSkillName): boolean {
  const req = SKILL_REQUIREMENTS[skill];
  return (!req.tools || model.supportsTools) && (!req.images || model.supportsImages);
}

/**
 * Models a user may choose for a skill: capable ones, further limited to the admin allowlist
 * unless the user pays with their own key (USER slot). Deny by default without a key.
 */
export function eligibleModels(
  catalog: AiModelInfoDto[],
  skill: AiSkillName,
  keySource: AiKeySlot | null,
  allowlist: readonly string[],
): AiModelInfoDto[] {
  const allowed = keySource === AiKeySlot.USER ? null : new Set(allowlist);
  return catalog.filter((m) => isCapable(m, skill) && (!allowed || allowed.has(m.id)));
}

/** The user's choice when it is currently eligible, else the admin default. */
export function resolvePrimaryModel(
  choice: string | null | undefined,
  defaultModel: string,
  eligible: readonly AiModelInfoDto[],
): string {
  return choice && eligible.some((m) => m.id === choice) ? choice : defaultModel;
}

export function estimateCostPerRun(
  avg: { promptTokens: number; completionTokens: number } | null,
  pricing: AiModelPricingDto,
): number | null {
  if (!avg) return null;
  return (
    (avg.promptTokens * pricing.promptPerMTokUsd + avg.completionTokens * pricing.completionPerMTokUsd) /
    1_000_000
  );
}

export function averageTokens(
  runs: Array<{ promptTokens: number; completionTokens: number }>,
): { promptTokens: number; completionTokens: number } | null {
  if (runs.length === 0) return null;
  const sum = runs.reduce(
    (acc, r) => ({ promptTokens: acc.promptTokens + r.promptTokens, completionTokens: acc.completionTokens + r.completionTokens }),
    { promptTokens: 0, completionTokens: 0 },
  );
  return { promptTokens: sum.promptTokens / runs.length, completionTokens: sum.completionTokens / runs.length };
}

/** Sorted by estimated cost (unknown last), then name. */
export function sortOptions(options: AiModelOptionDto[]): AiModelOptionDto[] {
  return [...options].sort((a, b) => {
    const ca = a.estimatedCostPerRunUsd ?? Number.POSITIVE_INFINITY;
    const cb = b.estimatedCostPerRunUsd ?? Number.POSITIVE_INFINITY;
    return ca !== cb ? ca - cb : a.name.localeCompare(b.name);
  });
}

/** Stored choices are re-validated on read; anything malformed is ignored. */
export function parseChoices(raw: unknown): AiModelChoicesDto {
  const parsed = AiModelChoicesSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : {};
}

@Injectable()
export class AiModelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appSettings: AppSettingsService,
    private readonly catalog: OpenRouterModelsService,
  ) {}

  private async choices(userId: string): Promise<AiModelChoicesDto> {
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: { aiModels: true },
    });
    return parseChoices(prefs?.aiModels);
  }

  /** Primary model for a run. Never returns an unvalidated user string. */
  async resolvePrimary(
    userId: string,
    skill: AiSkillName,
    keySource: AiKeySlot,
    defaultModel: string,
  ): Promise<string> {
    const choice = (await this.choices(userId))[skill];
    if (!choice || choice === defaultModel) return defaultModel;
    const [{ models }, settings] = await Promise.all([this.catalog.catalog(), this.appSettings.get()]);
    return resolvePrimaryModel(
      choice,
      defaultModel,
      eligibleModels(models, skill, keySource, settings.userModelAllowlist),
    );
  }

  private async averageFor(userId: string, skill: AiSkillName) {
    const select = { promptTokens: true, completionTokens: true } as const;
    const where = { skill, status: AiRunStatus.SUCCESS };
    const own = await this.prisma.aiRun.findMany({
      where: { ...where, userId },
      orderBy: { createdAt: 'desc' },
      take: USER_HISTORY_RUNS,
      select,
    });
    if (own.length > 0) return averageTokens(own);
    return averageTokens(
      await this.prisma.aiRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: GLOBAL_HISTORY_RUNS,
        select,
      }),
    );
  }

  async forUser(userId: string): Promise<AiModelsDto> {
    const [catalog, settings, keySource, choices] = await Promise.all([
      this.catalog.catalog(),
      this.appSettings.get(),
      this.appSettings.keySource(userId),
      this.choices(userId),
    ]);
    const byId = new Map(catalog.models.map((m) => [m.id, m]));
    const skills = await Promise.all(
      Object.values(AiSkillName).map(async (skill): Promise<AiSkillModelsDto> => {
        const avg = await this.averageFor(userId, skill);
        const option = (m: AiModelInfoDto): AiModelOptionDto => ({
          ...m,
          estimatedCostPerRunUsd: estimateCostPerRun(avg, m.pricing),
        });
        const eligible = eligibleModels(catalog.models, skill, keySource, settings.userModelAllowlist);
        const defaultModel = defaultModelFor(skill, settings);
        const selectedModel = choices[skill] ?? null;
        const effectiveModel = resolvePrimaryModel(selectedModel, defaultModel, eligible);
        const effective = byId.get(effectiveModel);
        return {
          skill,
          defaultModel,
          selectedModel,
          effectiveModel,
          effectiveModelInfo: effective ? option(effective) : null,
          restricted: keySource !== AiKeySlot.USER,
          models: sortOptions(eligible.map(option)),
        };
      }),
    );
    return { catalogAvailable: catalog.available, keySource, skills };
  }
}
