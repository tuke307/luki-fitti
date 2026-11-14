import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SocialAccessModule } from './social-access.module';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';

@Module({
  imports: [SocialAccessModule, NotificationsModule],
  controllers: [SocialController],
  providers: [SocialService],
})
export class SocialModule {}
