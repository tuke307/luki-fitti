import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service';

/** 403 while the duel feature is switched off. Runs after AuthGuard + SocialEnabledGuard. */
@Injectable()
export class DuelsEnabledGuard implements CanActivate {
  constructor(private readonly appSettings: AppSettingsService) {}

  async canActivate(): Promise<boolean> {
    if (!(await this.appSettings.get()).duelsEnabled) {
      throw new ForbiddenException('Duels are not enabled');
    }
    return true;
  }
}
