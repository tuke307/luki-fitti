import { Module } from '@nestjs/common';
import { ThrottlerStorageService } from '@nestjs/throttler';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ImportRateLimitGuard } from './import-rate-limit.guard';
import { SessionModule } from '../session/session.module';
import { ExerciseModule } from '../exercise/exercise.module';

@Module({
  imports: [SessionModule, ExerciseModule],
  controllers: [ImportController],
  providers: [ImportService, ImportRateLimitGuard, ThrottlerStorageService],
})
export class ImportModule {}
