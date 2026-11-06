import { z } from 'zod';
import { AiKeySlot, AiSkillName } from '../enums';

// ─────────────────────────────────────────────────────────────────────────────
// AI transparency: system prompts on GitHub + per-user model choice
// ─────────────────────────────────────────────────────────────────────────────

export const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/tuke307/luki-fitti/main';
export const GITHUB_BLOB_BASE = 'https://github.com/tuke307/luki-fitti/blob/main';

/** Repo-relative path of each skill's system prompt (the API reads the same files). */
export const AI_PROMPT_FILES: Record<AiSkillName, string> = {
  [AiSkillName.WORKOUT_BUILDER]: 'apps/api/src/modules/ai/prompts/workout-builder.md',
  [AiSkillName.MEAL_ANALYZER]: 'apps/api/src/modules/ai/prompts/meal-analyzer.md',
  [AiSkillName.MEAL_TEXT_ANALYZER]: 'apps/api/src/modules/ai/prompts/meal-text-analyzer.md',
};

export const aiPromptRawUrl = (skill: AiSkillName) =>
  `${GITHUB_RAW_BASE}/${AI_PROMPT_FILES[skill]}`;
export const aiPromptGithubUrl = (skill: AiSkillName) =>
  `${GITHUB_BLOB_BASE}/${AI_PROMPT_FILES[skill]}`;

/**
 * Model ids a user may pick, e.g. `openai/gpt-6.1-terra`, `meta-llama/llama-5:free` or an
 * OpenRouter "latest" alias such as `~anthropic/claude-sonnet-latest` (accepted for chat).
 */
export const AI_MODEL_ID_PATTERN = /^~?[a-z0-9][a-z0-9._-]*\/[a-z0-9._:-]+$/;
export const AI_MODEL_ID_MAX_LENGTH = 100;

export const AiModelIdSchema = z
  .string()
  .max(AI_MODEL_ID_MAX_LENGTH, 'Invalid model id')
  .regex(AI_MODEL_ID_PATTERN, 'Invalid model id');

/** Per-skill model choice (`UserPreferences.aiModels`); a missing skill means the admin default. */
export const AiModelChoicesSchema = z
  .object({
    [AiSkillName.WORKOUT_BUILDER]: AiModelIdSchema.optional(),
    [AiSkillName.MEAL_ANALYZER]: AiModelIdSchema.optional(),
    [AiSkillName.MEAL_TEXT_ANALYZER]: AiModelIdSchema.optional(),
  })
  .strict();

export type AiModelChoicesDto = Partial<Record<AiSkillName, string>>;

export interface AiModelPricingDto {
  /** USD per 1M input tokens. */
  promptPerMTokUsd: number;
  /** USD per 1M output tokens. */
  completionPerMTokUsd: number;
  /** USD per input image, when the provider bills images separately. */
  imageUsd: number | null;
}

export interface AiModelInfoDto {
  id: string;
  name: string;
  contextLength: number | null;
  pricing: AiModelPricingDto;
  supportsTools: boolean;
  supportsImages: boolean;
}

export interface AiModelOptionDto extends AiModelInfoDto {
  /**
   * Average tokens of recent runs × this model's prices, plus its per-image price for skills that
   * send photos (assumed one image per run; runs don't record the count). Null without history.
   */
  estimatedCostPerRunUsd: number | null;
}

export interface AiSkillModelsDto {
  skill: AiSkillName;
  /** Admin default for this skill. */
  defaultModel: string;
  /** The user's saved choice (may be stale/ineligible; then the default is used). */
  selectedModel: string | null;
  /** Model the next run will use: the selection when eligible, else the default. */
  effectiveModel: string;
  /** Catalog entry of `effectiveModel` (null when the catalog does not list it). */
  effectiveModelInfo: AiModelOptionDto | null;
  /** True when the user can only pick from the admin allowlist. */
  restricted: boolean;
  /** Eligible models, sorted by estimated cost, then name. */
  models: AiModelOptionDto[];
}

export interface AiModelsDto {
  /** False when the OpenRouter model catalog could not be loaded. */
  catalogAvailable: boolean;
  keySource: AiKeySlot | null;
  skills: AiSkillModelsDto[];
}

export interface AiModelCatalogDto {
  catalogAvailable: boolean;
  models: AiModelInfoDto[];
}
