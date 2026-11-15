import { Module } from '@nestjs/common';
import { BullMQModule } from '../bullmq/bullmq.module';
import { SocialAccessModule } from '../social/social-access.module';
import { NotificationsController } from './notifications.controller';
import { NotificationService } from './notification.service';

@Module({
  imports: [BullMQModule, SocialAccessModule],
  controllers: [NotificationsController],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationsModule {}
