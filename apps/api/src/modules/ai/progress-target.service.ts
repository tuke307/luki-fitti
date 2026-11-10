import crypto from 'crypto';
import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  AiRunStatus,
  AiSkillName,
  BodyGoal,
  type SupportedLocale,
} from '@luki-fitti/common/enums';
import type { ProgressTargetRequestDto, ProgressTargetResponseDto } from '@luki-fitti/common/schemas';
import { PrismaService } from '../database/prisma.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { AiKeyService } from './ai-key.service';
import { AiModelsService } from './ai-models.service';
import { AgentRunnerService } from './harness/agent-runner.service';
import { OpenRouterClient, AiProviderError } from './openrouter.client';
import { renderPrompt } from './prompts/prompt-loader';
import { AI_UNAVAILABLE } from './harness/agent-runner.service';
import { normalizeImage } from '../../utils/image.util';

const MIN_AGE_YEARS = 18;
const TRAINING_WEEKS = 8;

/** The AI progress target: a photo edit, never persisted server-side (AiRun has no payload). */
@Injectable()
export class ProgressTargetService {
  private readonly logger = new Logger(ProgressTargetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appSettings: AppSettingsService,
    private readonly aiKeys: AiKeyService,
    private readonly models: AiModelsService,
    private readonly runner: AgentRunnerService,
    private readonly client: OpenRouterClient,
  ) {}

  async grantConsent(userId: string): Promise<{ progressAiConsentAt: string }> {
    const value = await this.prisma.userPreferences.update({
      where: { userId },
      data: { progressAiConsentAt: new Date() },
      select: { progressAiConsentAt: true },
    });
    return { progressAiConsentAt: value.progressAiConsentAt!.toISOString() };
  }

  async generate(userId: string, locale: SupportedLocale, dto: ProgressTargetRequestDto): Promise<ProgressTargetResponseDto> {
    const prefs = await this.prisma.userPreferences.findUnique({ where: { userId } });
    if (!prefs?.progressAiConsentAt) {
      throw new HttpException(
        { message: 'Consent for the AI progress target is required first.', code: 'AI_CONSENT_REQUIRED' },
        HttpStatus.PRECONDITION_FAILED,
      );
    }
    const age = prefs.birthYear ? new Date().getUTCFullYear() - prefs.birthYear : 0;
    if (age < MIN_AGE_YEARS) {
      throw new HttpException(
        { message: 'The AI progress target is only available to adults.', code: 'AGE_RESTRICTED' },
        HttpStatus.FORBIDDEN,
      );
    }
    const key = await this.runner.assertWithinQuota(userId);

    // EXIF-free, bounded reference image for the data URL.
    const image = await normalizeImage(Buffer.from(dto.imageBase64, 'base64'));
    const dataUrl = `data:${image.mimeType};base64,${image.buffer.toString('base64')}`;

    const ctx = await this.promptContext(userId);
    const prompt = renderPrompt(AiSkillName.PROGRESS_TARGET, {
      goal: GOAL_LABELS[dto.goal],
      horizonMonths: String(dto.horizonMonths),
      sex: ctx.sex,
      age: ctx.age,
      heightCm: ctx.heightCm,
      weightKg: ctx.weightKg,
      bodyFatPct: ctx.bodyFatPct,
      sessionsPerWeek: ctx.sessionsPerWeek,
    });

    const settings = await this.appSettings.get();
    const primary = await this.models.resolvePrimary(
      userId,
      AiSkillName.PROGRESS_TARGET,
      key.source,
      settings.progressTargetModel,
    );
    const userHash = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 32);
    const started = Date.now();
    let usedModel = primary;

    const recordRun = async (status: AiRunStatus, costUsd: number | null, errorCode?: string) => {
      const run = await this.prisma.aiRun.create({
        data: {
          userId,
          skill: AiSkillName.PROGRESS_TARGET,
          model: usedModel,
          status,
          steps: 1,
          promptTokens: 0,
          completionTokens: 0,
          costUsd,
          durationMs: Date.now() - started,
          errorCode: errorCode ?? null,
          keySource: key.source,
        },
        select: { id: true },
      });
      return run.id;
    };

    try {
      const response = await this.client.generateImage(
        {
          model: primary,
          fallbackModels: settings.progressTargetFallbacks,
          prompt,
          referenceImageDataUrl: dataUrl,
          aspectRatio: '2:3',
          user: userHash,
        },
        key.apiKey,
      );
      usedModel = response.model;
      const runId = await recordRun(AiRunStatus.SUCCESS, response.costUsd);
      return {
        imageBase64: response.imageBase64,
        mimeType: response.mimeType,
        model: response.model,
        costUsd: response.costUsd,
        runId,
      };
    } catch (err) {
      const code = err instanceof AiProviderError ? `PROVIDER_${err.status ?? 'ERROR'}` : 'INTERNAL';
      if (err instanceof AiProviderError) {
        this.logger.warn(
          `AI provider error (${err.status ?? '-'}): ${err.upstreamMessage ?? err.message}`,
        );
      } else {
        this.logger.error(`Progress target run failed: ${String(err)}`);
      }
      await recordRun(AiRunStatus.ERROR, null, code).catch(() => undefined);
      // Key problems are actionable for the user; never echo upstream text.
      if (err instanceof AiProviderError && err.status === 401) {
        throw new ForbiddenException({
          message: 'OpenRouter rejected the API key. Check or replace it in your profile.',
          code: 'AI_KEY_INVALID',
        });
      }
      if (err instanceof AiProviderError && err.status === 402) {
        throw new HttpException(
          { message: 'The OpenRouter account has insufficient credits.', code: 'AI_KEY_NO_CREDITS' },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
      throw new ServiceUnavailableException(AI_UNAVAILABLE);
    }
  }

  /** Server-side prompt context; the client never sends these values. */
  private async promptContext(userId: string) {
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: {
        heightCm: true,
        bodyWeightKg: true,
        bodyFatPct: true,
        sex: true,
        birthYear: true,
      },
    });
    const latestWeight = await this.prisma.bodyWeightEntry.findFirst({
      where: { userId },
      orderBy: { measuredAt: 'desc' },
      select: { weightKg: true },
    });
    const since = new Date(Date.now() - TRAINING_WEEKS * 7 * 24 * 60 * 60 * 1000);
    const sessions = await this.prisma.workoutSession.count({
      where: { userId, status: 'COMPLETED', completedAt: { gte: since } },
    });
    const age = prefs?.birthYear ? new Date().getUTCFullYear() - prefs.birthYear : null;
    return {
      sex: prefs?.sex ?? 'unknown',
      age: age ? String(age) : 'unknown',
      heightCm: prefs?.heightCm != null ? `${prefs.heightCm} cm` : 'unknown',
      weightKg: latestWeight?.weightKg ?? prefs?.bodyWeightKg
        ? `${latestWeight?.weightKg ?? prefs?.bodyWeightKg} kg`
        : 'unknown',
      bodyFatPct: prefs?.bodyFatPct != null ? `${prefs.bodyFatPct}%` : 'unknown',
      sessionsPerWeek: String(Math.round((sessions / TRAINING_WEEKS) * 10) / 10),
    };
  }
}

const GOAL_LABELS: Record<BodyGoal, string> = {
  BUILD_MUSCLE: 'muscle building',
  LOSE_FAT: 'fat loss',
  RECOMP: 'body recomposition',
  MAINTAIN: 'maintenance',
};
