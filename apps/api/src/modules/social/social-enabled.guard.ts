import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthenticatedUser } from '@/decorators/current-user.decorator';
import { SocialAccessService } from './social-access.service';

/**
 * 403 for users outside the social rollout. Must run after `AuthGuard`
 * (reads `request.user`).
 */
@Injectable()
export class SocialEnabledGuard implements CanActivate {
  constructor(private readonly access: SocialAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const userId = request.user?.id;
    if (!userId || !(await this.access.isEnabledFor(userId))) {
      throw new ForbiddenException('Social features are not enabled for this account');
    }
    return true;
  }
}
