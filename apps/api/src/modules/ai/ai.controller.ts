import { Body, Controller, Post, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { FeatureGrant, type SupportedLocale } from '@luki-fitti/common/enums';
import {
  MEAL_PHOTO_MAX_BYTES,
  MEAL_PHOTO_MAX_COUNT,
  MEAL_PHOTO_MIME_TYPES,
  MealAnalysisRequestSchema,
  MealTextAnalysisRequestSchema,
  WorkoutBuilderRequestSchema,
  type MealAnalysisRequestDto,
  type MealAnalysisResponseDto,
  type MealTextAnalysisRequestDto,
  type MealTextAnalysisResponseDto,
  type WorkoutBuilderRequestDto,
  type WorkoutBuilderResponseDto,
} from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { FeatureGuard } from '@/guards/feature.guard';
import { RequireFeature } from '@/decorators/permissions.decorator';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { RequestLocale } from '@/decorators/request-locale.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { AiService } from './ai.service';

const ALLOWED_UPLOAD_TYPES = new Set<string>(MEAL_PHOTO_MIME_TYPES);

/** AI features: opt-in per user (admin grant) and behind a global switch. */
@ApiTags('AI')
@Controller('ai')
@UseGuards(AuthGuard, CsrfGuard, FeatureGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('workout-builder')
  @RequireFeature(FeatureGrant.AI_WORKOUT_BUILDER)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Propose a workout from a text request, history and weak points' })
  buildWorkout(
    @CurrentUser() user: AuthenticatedUser,
    @RequestLocale() locale: SupportedLocale,
    @Body(new ZodValidationPipe(WorkoutBuilderRequestSchema)) body: WorkoutBuilderRequestDto,
  ): Promise<WorkoutBuilderResponseDto> {
    return this.aiService.buildWorkout(user.id, locale, body);
  }

  @Post('meal-analysis')
  @RequireFeature(FeatureGrant.AI_MEAL_PHOTO)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Identify foods, portions and nutrients from meal photos' })
  @UseInterceptors(
    FilesInterceptor('photos', MEAL_PHOTO_MAX_COUNT, {
      storage: memoryStorage(),
      limits: { fileSize: MEAL_PHOTO_MAX_BYTES, files: MEAL_PHOTO_MAX_COUNT, fields: 10 },
      // First-line filter only; the real check is magic-byte detection + re-encoding.
      fileFilter: (_req, file, cb) => cb(null, ALLOWED_UPLOAD_TYPES.has(file.mimetype)),
    }),
  )
  analyzeMeal(
    @CurrentUser() user: AuthenticatedUser,
    @RequestLocale() locale: SupportedLocale,
    @Body(new ZodValidationPipe(MealAnalysisRequestSchema)) body: MealAnalysisRequestDto,
    @UploadedFiles() files: Express.Multer.File[] | undefined,
  ): Promise<MealAnalysisResponseDto> {
    return this.aiService.analyzeMeal(user.id, locale, body, files ?? []);
  }

  @Post('meal-text-analysis')
  @RequireFeature(FeatureGrant.AI_MEAL_PHOTO)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Propose foods, portions and nutrients from a written meal description' })
  describeMeal(
    @CurrentUser() user: AuthenticatedUser,
    @RequestLocale() locale: SupportedLocale,
    @Body(new ZodValidationPipe(MealTextAnalysisRequestSchema)) body: MealTextAnalysisRequestDto,
  ): Promise<MealTextAnalysisResponseDto> {
    return this.aiService.describeMeal(user.id, locale, body);
  }
}
