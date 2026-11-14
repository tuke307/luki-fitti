import { Injectable } from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { PrismaService } from '../database/prisma.service';

/**
 * Social feature gate. Deny by default: the global switch must be on AND (when a beta
 * allowlist exists) the user must be on it. Every /social, /push and /notifications
 * route is behind `SocialEnabledGuard`, which delegates here.
 */
@Injectable()
export class SocialAccessService {
  constructor(
    private readonly appSettings: AppSettingsService,
    private readonly prisma: PrismaService,
  ) {}

  async isEnabledFor(userId: string): Promise<boolean> {
    const settings = await this.appSettings.get();
    if (!settings.socialEnabled) return false;
    return settings.socialBetaUserIds.length === 0 || settings.socialBetaUserIds.includes(userId);
  }

  /**
   * League eligibility: social enabled for the user + a handle + not paused.
   * Paused users keep friends but are invisible to leagues and earn no points.
   */
  async isEligibleForLeagues(userId: string): Promise<boolean> {
    const settings = await this.appSettings.get();
    if (!settings.leaguesEnabled) return false;
    if (!settings.socialEnabled) return false;
    if (settings.socialBetaUserIds.length > 0 && !settings.socialBetaUserIds.includes(userId)) {
      return false;
    }
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { handle: true, socialPaused: true },
    });
    return Boolean(user?.handle && !user.socialPaused);
  }
}
