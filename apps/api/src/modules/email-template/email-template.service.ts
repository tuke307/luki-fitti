import { Injectable } from '@nestjs/common';
import type { EmailTemplate } from '@luki-fitti/database';
import { EmailTemplateType } from '@luki-fitti/common/enums';
import { logger } from '@luki-fitti/logger';
import { PrismaService } from '../database/prisma.service';
import { EmailTemplateRendererService } from './email-template-renderer.service';

const DEFAULT_TEMPLATES: Record<
  EmailTemplateType,
  { name: string; subject: string; htmlFile: string }
> = {
  [EmailTemplateType.ACCOUNT_CONFIRMATION]: {
    name: 'Account Confirmation',
    subject: 'LukiFitti — Confirm your account ({{ name }})',
    htmlFile: 'account-confirmation.mjml',
  },
  [EmailTemplateType.PASSWORD_RESET]: {
    name: 'Password Reset',
    subject: 'LukiFitti — Reset your password',
    htmlFile: 'password-reset.mjml',
  },
};

@Injectable()
export class EmailTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templateRenderer: EmailTemplateRendererService = new EmailTemplateRendererService(),
  ) {}

  async getEmailTemplateByType(type: EmailTemplateType): Promise<EmailTemplate> {
    if (!this.prisma?.emailTemplate) {
      const fallback = DEFAULT_TEMPLATES[type];
      return {
        id: type === EmailTemplateType.ACCOUNT_CONFIRMATION ? 1 : 2,
        name: fallback.name,
        subject: fallback.subject,
        htmlFile: fallback.htmlFile,
        type,
        updatedAt: new Date(),
      };
    }

    let template = await this.prisma.emailTemplate.findUnique({ where: { type } });
    if (!template) {
      const def = DEFAULT_TEMPLATES[type];
      template = await this.prisma.emailTemplate.upsert({
        where: { type },
        update: {},
        create: {
          name: def.name,
          subject: def.subject,
          htmlFile: def.htmlFile,
          type,
        },
      });
      logger.info(`Auto-seeded default EmailTemplate for ${type}`);
    }
    return template;
  }

  async getPreviewHtml(type: EmailTemplateType): Promise<string> {
    const template = await this.getEmailTemplateByType(type);
    return this.templateRenderer.renderTemplate(template.htmlFile, {
      name: 'GymBuddy',
      email: 'athlete@lukifitti.app',
      confirmation_url: 'http://localhost:3000/verify-email?token=sample-token',
      reset_password_url: 'http://localhost:3000/reset-password?token=sample-token',
      expiry_minutes: 60,
      frontend_url: 'http://localhost:3000',
    });
  }
}
