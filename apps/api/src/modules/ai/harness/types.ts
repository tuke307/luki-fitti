import type { z } from 'zod';
import type { AiSkillName, SupportedLocale } from '@luki-fitti/common/enums';
import type { ChatContentPart } from '../openrouter.client';
import type { AppSettingsRecord } from '../../app-settings/app-settings.service';

/** Per-run context handed to every tool. The user id always comes from the session, never the model. */
export interface ToolContext {
  userId: string;
  locale: SupportedLocale;
}

/**
 * A capability the model may call. Inputs are validated with `input` before `execute` runs;
 * the returned value is serialized to JSON for the model.
 */
export interface AiTool<TInput extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  input: TInput;
  execute: (ctx: ToolContext, input: z.infer<TInput>) => Promise<unknown>;
}

/**
 * A skill = instructions + the tools it may use + the structured answer it must produce.
 * New AI features are added as skills; the runner stays generic.
 */
export interface AiSkill<TOutput extends z.ZodType = z.ZodType> {
  name: AiSkillName;
  /** Name of the final-answer function the model calls with its result. */
  answerTool: { name: string; description: string };
  output: TOutput;
  toolNames: string[];
  systemPrompt: (ctx: ToolContext) => string;
  model: (settings: AppSettingsRecord) => { primary: string; fallbacks: string[] };
  temperature: number;
  maxSteps: number;
  maxTokens: number;
}

export interface SkillRunInput {
  userId: string;
  locale: SupportedLocale;
  content: string | ChatContentPart[];
}

export interface SkillRunResult<T> {
  runId: string;
  output: T;
  model: string;
  steps: number;
  usage: { promptTokens: number; completionTokens: number; costUsd: number | null };
}
