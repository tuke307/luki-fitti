import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { logger } from '@luki-fitti/logger';
import { EmailService } from '@luki-fitti/api/services/email.service';
import { BullMQService } from '@luki-fitti/api/services/bullmq.service';
import { PrismaService } from '@luki-fitti/api/services/prisma.service';
import { PushSenderService } from '@luki-fitti/api/services/push-sender.service';
import { LeagueService } from '@luki-fitti/api/services/league.service';
import { SocialAccessService } from '@luki-fitti/api/services/social-access.service';
import { NotificationService } from '@luki-fitti/api/services/notification.service';
import { AppSettingsService } from '@luki-fitti/api/services/app-settings.service';

@Injectable()
export class WorkerService implements OnModuleDestroy {
  private readonly bullmqService: BullMQService;
  private readonly emailService: EmailService;
  private readonly pushSender: PushSenderService;
  private readonly leagueService: LeagueService;

  constructor(private readonly prismaService: PrismaService) {
    this.bullmqService = BullMQService.getInstance();
    this.emailService = new EmailService(this.prismaService, this.bullmqService);
    this.pushSender = new PushSenderService(this.prismaService);
    const appSettings = new AppSettingsService(this.prismaService);
    const socialAccess = new SocialAccessService(appSettings, this.prismaService);
    const notifications = new NotificationService(
      this.prismaService,
      this.bullmqService,
      socialAccess,
    );
    this.leagueService = new LeagueService(this.prismaService, appSettings, notifications);
  }

  async startWorker(): Promise<void> {
    logger.info('Starting email worker...');

    this.bullmqService.startEmailWorker(async (emailId) => {
      await this.processEmailJob(emailId);
    });

    this.bullmqService.startPushWorker(async (notificationId) => {
      await this.pushSender.sendNotification(notificationId);
    });

    await this.bullmqService.ensureLeagueSchedulers();
    this.bullmqService.startLeagueWorker(async (kind) => {
      if (kind === 'rollover') {
        await this.leagueService.rollover();
      } else {
        await this.leagueService.reminder();
      }
    });

    logger.info('Email worker started successfully');
  }

  private async processEmailJob(emailId: number): Promise<void> {
    try {
      const email = await this.emailService.findEmailById(emailId);

      if (!email) {
        logger.error(`Email ${emailId} not found`);
        throw new Error(`Email ${emailId} not found`);
      }

      await this.emailService.sendEmail(email);
    } catch (error) {
      logger.error(`Error processing email job ${emailId}:`, error);
      throw error;
    }
  }

  async getQueueStats() {
    return this.bullmqService.getQueueStats();
  }

  async onModuleDestroy() {
    logger.info('Shutting down email worker...');
    this.pushSender.close();
    await this.bullmqService.close();
    logger.info('Email worker shut down successfully');
  }
}
