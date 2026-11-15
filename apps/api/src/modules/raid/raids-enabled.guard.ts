import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service';

/** 403 while raids are switched off. Runs after AuthGuard + SocialEnabledGuard. */
@Injectable()
export class RaidsEnabledGuard implements CanActivate {
  constructor(private readonly appSettings: AppSettingsService) {}

  async canActivate(): Promise<boolean> {
    if (!(await this.appSettings.get()).raidsEnabled) {
      throw new ForbiddenException('Raids are not enabled');
    }
    return true;
  }
}
