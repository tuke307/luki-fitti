import { Module } from '@nestjs/common';
import { SocialAccessModule } from '../social/social-access.module';
import { PushController } from './push.controller';
import { PushService } from './push.service';
import { PushSenderService } from './push-sender.service';

@Module({
  imports: [SocialAccessModule],
  controllers: [PushController],
  providers: [PushService, PushSenderService],
  exports: [PushSenderService],
})
export class PushModule {}
