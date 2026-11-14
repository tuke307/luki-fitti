import { Controller, Get, Query, UseFilters, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiKeyScope } from '@luki-fitti/common/enums';
import {
  PublicExerciseQuerySchema,
  PublicListQuerySchema,
  type PublicExerciseDto,
  type PublicExerciseQueryDto,
  type PublicListDto,
  type PublicListQueryDto,
  type PublicStretchingRoutineDto,
  type PublicWorkoutFolderDto,
  type PublicWorkoutTemplateDto,
} from '@luki-fitti/common/schemas';
import { ApiScope } from '@/decorators/api-scope.decorator';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { ApiKeyGuard } from './api-key.guard';
import { ScopesGuard } from './scopes.guard';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';
import { PublicApiExceptionFilter } from './public-api.filter';
import { PublicApiService } from './public-api.service';

@ApiTags('Public API v1')
@ApiBearerAuth()
@Controller('v1')
@UseGuards(ApiKeyGuard, ScopesGuard, ApiKeyRateLimitGuard)
@UseFilters(PublicApiExceptionFilter)
export class PublicWorkoutsController {
  constructor(private readonly publicApi: PublicApiService) {}

  @Get('workouts')
  @ApiScope(ApiKeyScope.READ_WORKOUTS)
  @ApiOperation({ summary: 'Workout templates with their exercises' })
  listWorkouts(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(PublicListQuerySchema)) query: PublicListQueryDto,
  ): Promise<PublicListDto<PublicWorkoutTemplateDto>> {
    return this.publicApi.listWorkouts(user.id, query);
  }

  @Get('folders')
  @ApiScope(ApiKeyScope.READ_WORKOUTS)
  @ApiOperation({ summary: 'Workout folders' })
  listFolders(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(PublicListQuerySchema)) query: PublicListQueryDto,
  ): Promise<PublicListDto<PublicWorkoutFolderDto>> {
    return this.publicApi.listFolders(user.id, query);
  }

  @Get('stretching-routines')
  @ApiScope(ApiKeyScope.READ_WORKOUTS)
  @ApiOperation({ summary: 'Stretching routines with their exercises' })
  listStretchingRoutines(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(PublicListQuerySchema)) query: PublicListQueryDto,
  ): Promise<PublicListDto<PublicStretchingRoutineDto>> {
    return this.publicApi.listStretchingRoutines(user.id, query);
  }

  @Get('exercises')
  @ApiScope(ApiKeyScope.READ_WORKOUTS)
  @ApiOperation({
    summary: 'Exercises: own custom + system catalog (custom=true → custom only)',
  })
  listExercises(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(PublicExerciseQuerySchema)) query: PublicExerciseQueryDto,
  ): Promise<PublicListDto<PublicExerciseDto>> {
    return this.publicApi.listExercises(user.id, query, query.custom === 'true');
  }
}
