import { Module } from '@nestjs/common';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { WorkoutModule } from '../workout/workout.module';
import { PointsModule } from '../points/points.module';

@Module({
  imports: [WorkoutModule, PointsModule],
  controllers: [SessionController],
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
