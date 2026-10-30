import { z } from 'zod';
import {
  AiRunStatus,
  AiSkillName,
  ExerciseFeedbackVerdict,
  MealType,
  MuscleGroup,
  EquipmentType,
} from '../enums';
import type { MealEntryDto } from './nutrition.schemas';

// ─────────────────────────────────────────────────────────────────────────────
// AI usage & cost (USD exactly as reported by OpenRouter; null when unknown)
// ─────────────────────────────────────────────────────────────────────────────

export interface AiRunUsageDto {
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
}

export const AI_USAGE_RANGE_DAYS = [7, 30, 90] as const;

export const MyAiUsageQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((v) => (AI_USAGE_RANGE_DAYS as readonly number[]).includes(v), 'Use 7, 30 or 90')
    .default(30),
});

export type MyAiUsageQueryDto = z.infer<typeof MyAiUsageQuerySchema>;

export interface AiUsageRunDto {
  id: string;
  skill: AiSkillName | string;
  status: AiRunStatus;
  createdAt: string;
  promptTokens: number;
  completionTokens: number;
  costUsd: number | null;
  durationMs: number;
}

export interface MyAiUsageDto {
  days: number;
  totalRuns: number;
  failedRuns: number;
  promptTokens: number;
  completionTokens: number;
  /** Sum of runs with a known cost. */
  costUsd: number;
  unknownCostRuns: number;
  bySkill: Array<{ skill: AiSkillName | string; runs: number; costUsd: number }>;
  byDay: Array<{ date: string; runs: number; costUsd: number }>;
  recent: AiUsageRunDto[];
  today: { used: number; limit: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// AI workout builder
// ─────────────────────────────────────────────────────────────────────────────

export const AI_PROMPT_MAX_LENGTH = 1000;

export const WorkoutBuilderRequestSchema = z.object({
  prompt: z.string().trim().min(3, 'Describe the workout you want').max(AI_PROMPT_MAX_LENGTH),
  durationMinutes: z.number().int().min(10).max(180).optional(),
  equipment: z.array(z.enum(EquipmentType)).max(13).optional(),
});

/**
 * Structured answer the `workout-builder` skill must return (validated server-side;
 * every exercise id is additionally checked against the catalog).
 */
export const WorkoutProposalSchema = z.object({
  name: z.string().min(1).max(100),
  summary: z.string().max(600),
  focusMuscleGroups: z.array(z.enum(MuscleGroup)).max(6),
  estimatedDurationMinutes: z.number().int().min(10).max(240),
  exercises: z
    .array(
      z.object({
        exerciseId: z.string().min(1).max(120),
        warmupSets: z.number().int().min(0).max(5),
        workingSets: z.number().int().min(1).max(10),
        repsMin: z.number().int().min(1).max(100),
        repsMax: z.number().int().min(1).max(100),
        restSeconds: z.number().int().min(15).max(600),
        rationale: z.string().max(300),
        /** Exercise from the user's history this one deliberately replaces (it did not work). */
        replacesExerciseId: z.string().max(120).nullable(),
        alternativeExerciseIds: z.array(z.string().max(120)).max(3),
      }),
    )
    .min(1)
    .max(12),
  notes: z.array(z.string().max(300)).max(5),
});

export type WorkoutBuilderRequestDto = z.infer<typeof WorkoutBuilderRequestSchema>;
export type WorkoutProposalDto = z.infer<typeof WorkoutProposalSchema>;

export interface WorkoutProposalExerciseView {
  exerciseId: string;
  name: string;
  primaryMuscleGroup: MuscleGroup;
  equipment: EquipmentType;
  warmupSets: number;
  workingSets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  rationale: string;
  replaces: { exerciseId: string; name: string } | null;
  alternatives: Array<{ exerciseId: string; name: string }>;
}

export interface WorkoutBuilderResponseDto {
  runId: string;
  name: string;
  summary: string;
  focusMuscleGroups: MuscleGroup[];
  estimatedDurationMinutes: number;
  exercises: WorkoutProposalExerciseView[];
  notes: string[];
  /** Proposal ids that were not in the catalog and therefore dropped. */
  droppedExerciseIds: string[];
  usage: AiRunUsageDto;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI meal photo analysis
// ─────────────────────────────────────────────────────────────────────────────

export const MEAL_PHOTO_MAX_COUNT = 5;
export const MEAL_PHOTO_MAX_BYTES = 8 * 1024 * 1024;
/** Accepted upload types (HEIC is converted to JPEG on the device before upload). */
export const MEAL_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Multipart text fields sent with the photos (`photos[]`). */
export const MealAnalysisRequestSchema = z.object({
  hint: z.string().trim().max(500).optional(),
  /** Existing entry to add the photos/items to; otherwise a new entry is created. */
  clientEntryId: z.string().min(8).max(64),
  eatenAt: z.iso.datetime({ offset: true }),
  mealType: z.enum(MealType).optional(),
});

/** Structured answer the `meal-analyzer` skill must return. */
export const MealAnalysisSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        /** Portion in `unit`: grams for solids, millilitres for drinks and liquids. */
        estimatedAmount: z.number().min(0).max(5000),
        unit: z.enum(['g', 'ml']),
        kcal: z.number().min(0).max(10000),
        proteinG: z.number().min(0).max(1000),
        carbsG: z.number().min(0).max(1000),
        fatG: z.number().min(0).max(1000),
        fiberG: z.number().min(0).max(500).nullable(),
        sugarG: z.number().min(0).max(1000).nullable(),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(30),
  mealTypeGuess: z.enum(MealType).nullable(),
  uncertaintyNote: z.string().max(400),
  /** False when the photos do not show food; items are then empty. */
  containsFood: z.boolean(),
});

export type MealAnalysisRequestDto = z.infer<typeof MealAnalysisRequestSchema>;
export type MealAnalysisDto = z.infer<typeof MealAnalysisSchema>;

export interface MealAnalysisResponseDto {
  runId: string;
  /** The saved entry: AI items replace earlier AI items, manual items are kept. */
  entry: MealEntryDto;
  analysis: MealAnalysisDto;
  /** Whether photos were kept (false when server photo storage is not configured). */
  photosStored: boolean;
  usage: AiRunUsageDto;
}

// ─────────────────────────────────────────────────────────────────────────────
// Exercise feedback ("this exercise doesn't work for me")
// ─────────────────────────────────────────────────────────────────────────────

export const UpsertExerciseFeedbackSchema = z.object({
  verdict: z.enum(ExerciseFeedbackVerdict),
  note: z.string().trim().max(300).nullable().optional(),
});

export type UpsertExerciseFeedbackDto = z.infer<typeof UpsertExerciseFeedbackSchema>;

export interface ExerciseFeedbackDto {
  exerciseId: string;
  exerciseName: string;
  verdict: ExerciseFeedbackVerdict;
  note: string | null;
  updatedAt: string;
}
