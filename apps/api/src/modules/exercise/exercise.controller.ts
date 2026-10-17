import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ExerciseService } from './exercise.service';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import {
  ExerciseQuerySchema,
  CreateExerciseSchema,
  UpdateExerciseSchema,
  type ExerciseQueryDto,
  type CreateExerciseDto,
  type UpdateExerciseDto,
  type ExerciseDto,
} from '@luki-fitti/common/schemas';

@ApiTags('Exercise Library')
@Controller('exercises')
@UseGuards(AuthGuard)
export class ExerciseController {
  constructor(private readonly exerciseService: ExerciseService) {}

  @Get()
  @ApiOperation({ summary: 'Search and filter the exercise and stretching library' })
  async getAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(ExerciseQuerySchema)) query: ExerciseQueryDto,
  ): Promise<ExerciseDto[]> {
    return this.exerciseService.findAll(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get single exercise details with muscle groups and alternatives' })
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ExerciseDto> {
    return this.exerciseService.findById(user.id, id);
  }

  @Post()
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Create a custom user exercise' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(CreateExerciseSchema)) body: CreateExerciseDto,
  ): Promise<ExerciseDto> {
    return this.exerciseService.createCustom(user.id, body);
  }

  @Put(':id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Update a custom user exercise' })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(UpdateExerciseSchema)) body: UpdateExerciseDto,
  ): Promise<ExerciseDto> {
    return this.exerciseService.updateCustom(user.id, id, body);
  }

  @Delete(':id')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Delete a custom user exercise' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.exerciseService.deleteCustom(user.id, id);
  }
}
