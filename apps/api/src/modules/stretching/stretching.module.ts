import { Module } from '@nestjs/common';
import { StretchingController } from './stretching.controller';
import { StretchingService } from './stretching.service';

@Module({
  controllers: [StretchingController],
  providers: [StretchingService],
  exports: [StretchingService],
})
export class StretchingModule {}
