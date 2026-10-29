import { Module } from '@nestjs/common';
import { ExerciseController } from './exercise.controller';
import { ExerciseService } from './exercise.service';
import { ExerciseFeedbackController } from './exercise-feedback.controller';

@Module({
  controllers: [ExerciseController, ExerciseFeedbackController],
  providers: [ExerciseService],
  exports: [ExerciseService],
})
export class ExerciseModule {}
