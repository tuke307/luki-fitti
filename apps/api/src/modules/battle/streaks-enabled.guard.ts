import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service';

/** 403 while friend streaks are switched off. Runs after AuthGuard + SocialEnabledGuard. */
@Injectable()
export class StreaksEnabledGuard implements CanActivate {
  constructor(private readonly appSettings: AppSettingsService) {}

  async canActivate(): Promise<boolean> {
    if (!(await this.appSettings.get()).streaksEnabled) {
      throw new ForbiddenException('Friend streaks are not enabled');
    }
    return true;
  }
}
