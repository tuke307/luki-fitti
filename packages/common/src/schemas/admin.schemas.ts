import { z } from 'zod';
import { AdminPermission, AiSkillName, FeatureGrant } from '../enums';

// ─────────────────────────────────────────────────────────────────────────────
// Admin portal: users, access grants, AI settings & usage
// ─────────────────────────────────────────────────────────────────────────────

export const AdminUserQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const UpdateUserAccessSchema = z
  .object({
    permissions: z.array(z.enum(AdminPermission)).max(20).optional(),
    featureGrants: z.array(z.enum(FeatureGrant)).max(20).optional(),
  })
  .refine((v) => v.permissions !== undefined || v.featureGrants !== undefined, {
    message: 'Provide permissions and/or featureGrants',
  });

/** OpenRouter model id, e.g. `openai/gpt-6.1-terra` or `google/gemini-3.8-flash`. */
export const OpenRouterModelIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/i, 'Invalid OpenRouter model id');

export const UpdateAiSettingsSchema = z.object({
  aiWorkoutBuilderEnabled: z.boolean().optional(),
  aiMealPhotoEnabled: z.boolean().optional(),
  workoutBuilderModel: OpenRouterModelIdSchema.optional(),
  workoutBuilderFallbacks: z.array(OpenRouterModelIdSchema).max(3).optional(),
  mealPhotoModel: OpenRouterModelIdSchema.optional(),
  mealPhotoFallbacks: z.array(OpenRouterModelIdSchema).max(3).optional(),
  aiDailyRunLimit: z.number().int().min(0).max(1000).optional(),
  mealPhotoRetentionDays: z.number().int().min(1).max(3650).nullable().optional(),
});

export const AiUsageQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export type AdminUserQueryDto = z.infer<typeof AdminUserQuerySchema>;
export type UpdateUserAccessDto = z.infer<typeof UpdateUserAccessSchema>;
export type UpdateAiSettingsDto = z.infer<typeof UpdateAiSettingsSchema>;
export type AiUsageQueryDto = z.infer<typeof AiUsageQuerySchema>;

export interface AdminUserDto {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  permissions: AdminPermission[];
  featureGrants: FeatureGrant[];
  completedSessions: number;
  mealEntries: number;
  aiRunsLast30Days: number;
}

export interface AdminUserListDto {
  items: AdminUserDto[];
  total: number;
  page: number;
  limit: number;
}

export interface AiSettingsDto {
  aiWorkoutBuilderEnabled: boolean;
  aiMealPhotoEnabled: boolean;
  workoutBuilderModel: string;
  workoutBuilderFallbacks: string[];
  mealPhotoModel: string;
  mealPhotoFallbacks: string[];
  aiDailyRunLimit: number;
  mealPhotoRetentionDays: number | null;
  /** Whether OPENROUTER_API_KEY is configured on the server (the key itself is never exposed). */
  providerConfigured: boolean;
  /** Whether photo storage (S3/SeaweedFS) is configured on the server. */
  storageConfigured: boolean;
  updatedAt: string;
}

export interface AiUsageSummaryDto {
  days: number;
  totalRuns: number;
  failedRuns: number;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  avgDurationMs: number;
  bySkill: Array<{ skill: AiSkillName | string; runs: number; failed: number; costUsd: number }>;
  byDay: Array<{ date: string; runs: number; costUsd: number }>;
  topUsers: Array<{ userId: string; email: string; runs: number; costUsd: number }>;
}

export interface AdminDashboardDto {
  totalUsers: number;
  newUsersLast30Days: number;
  activeUsersLast7Days: number;
  completedSessionsLast30Days: number;
  mealEntriesLast30Days: number;
  usersWithAiAccess: number;
  aiRunsLast30Days: number;
}
