import { Injectable } from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service';

/**
 * Social feature gate. Deny by default: the global switch must be on AND (when a beta
 * allowlist exists) the user must be on it. Every /social, /push and /notifications
 * route is behind `SocialEnabledGuard`, which delegates here.
 */
@Injectable()
export class SocialAccessService {
  constructor(private readonly appSettings: AppSettingsService) {}

  async isEnabledFor(userId: string): Promise<boolean> {
    const settings = await this.appSettings.get();
    if (!settings.socialEnabled) return false;
    return settings.socialBetaUserIds.length === 0 || settings.socialBetaUserIds.includes(userId);
  }
}
