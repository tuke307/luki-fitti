import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { SocialAccessService } from '../social/social-access.service';
import type { AuthenticatedUser } from '@/decorators/current-user.decorator';

/**
 * Deny-by-default gate for league endpoints: the rollout flag must be on and
 * the user must be an eligible league participant (social enabled for them,
 * handle set, not paused).
 */
@Injectable()
export class LeaguesEnabledGuard implements CanActivate {
  constructor(
    private readonly appSettings: AppSettingsService,
    private readonly socialAccess: SocialAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>().user;
    if (!user) throw new ForbiddenException('Authentication required');
    const settings = await this.appSettings.get();
    if (!settings.leaguesEnabled) throw new ForbiddenException('Leagues are not enabled');
    if (!(await this.socialAccess.isEligibleForLeagues(user.id))) {
      throw new ForbiddenException('Leagues are not available for this user');
    }
    return true;
  }
}
