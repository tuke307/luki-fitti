import { Body, Controller, Delete, Get, NotFoundException, Param, Put, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ExerciseFeedbackVerdict } from '@luki-fitti/common/enums';
import {
  UpsertExerciseFeedbackSchema,
  type ExerciseFeedbackDto,
  type UpsertExerciseFeedbackDto,
} from '@luki-fitti/common/schemas';
import { AuthGuard } from '@/guards/auth.guard';
import { CsrfGuard } from '@/guards/csrf.guard';
import { CurrentUser, type AuthenticatedUser } from '@/decorators/current-user.decorator';
import { ZodValidationPipe } from '@/pipes/zod-validation.pipe';
import { PrismaService } from '../database/prisma.service';

type FeedbackRecord = {
  exerciseId: string;
  verdict: string;
  note: string | null;
  updatedAt: Date;
  exercise: { name: string };
};

const toDto = (f: FeedbackRecord): ExerciseFeedbackDto => ({
  exerciseId: f.exerciseId,
  exerciseName: f.exercise.name,
  verdict: f.verdict as ExerciseFeedbackVerdict,
  note: f.note,
  updatedAt: f.updatedAt.toISOString(),
});

/** "This exercise doesn't work for me" marks; used to steer AI suggestions. */
@ApiTags('Exercise Feedback')
@Controller('exercise-feedback')
@UseGuards(AuthGuard)
export class ExerciseFeedbackController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: "List the user's exercise feedback" })
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ExerciseFeedbackDto[]> {
    const rows = await this.prisma.exerciseFeedback.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      include: { exercise: { select: { name: true } } },
    });
    return rows.map(toDto);
  }

  @Put(':exerciseId')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Mark an exercise as not working / painful / disliked' })
  async upsert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('exerciseId') exerciseId: string,
    @Body(new ZodValidationPipe(UpsertExerciseFeedbackSchema)) body: UpsertExerciseFeedbackDto,
  ): Promise<ExerciseFeedbackDto> {
    const exercise = await this.prisma.exercise.findFirst({
      where: { id: exerciseId, OR: [{ isSystem: true }, { userId: user.id }] },
      select: { id: true },
    });
    if (!exercise) throw new NotFoundException('Exercise not found');
    const saved = await this.prisma.exerciseFeedback.upsert({
      where: { userId_exerciseId: { userId: user.id, exerciseId } },
      create: { userId: user.id, exerciseId, verdict: body.verdict, note: body.note ?? null },
      update: { verdict: body.verdict, note: body.note ?? null },
      include: { exercise: { select: { name: true } } },
    });
    return toDto(saved);
  }

  @Delete(':exerciseId')
  @UseGuards(CsrfGuard)
  @ApiOperation({ summary: 'Remove feedback for an exercise' })
  async remove(@CurrentUser() user: AuthenticatedUser, @Param('exerciseId') exerciseId: string) {
    await this.prisma.exerciseFeedback.deleteMany({ where: { userId: user.id, exerciseId } });
    return { success: true };
  }
}
