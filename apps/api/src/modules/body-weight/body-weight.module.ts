import { Module } from '@nestjs/common';
import { BodyWeightController } from './body-weight.controller';
import { BodyWeightService } from './body-weight.service';

@Module({
  controllers: [BodyWeightController],
  providers: [BodyWeightService],
  exports: [BodyWeightService],
})
export class BodyWeightModule {}
