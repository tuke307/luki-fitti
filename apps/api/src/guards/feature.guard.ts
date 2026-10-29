import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { FeatureGrant } from '@luki-fitti/common/enums';
import { FEATURE_KEY } from '@/decorators/permissions.decorator';
import type { AuthenticatedUser } from '@/decorators/current-user.decorator';
import { AppSettingsService } from '@/modules/app-settings/app-settings.service';

/** Deny-by-default gate for opt-in features (global switch AND per-user grant). */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly appSettings: AppSettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<FeatureGrant | undefined>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) {
      throw new ForbiddenException('Feature not available');
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const active = await this.appSettings.resolveActiveFeatures(request.user?.featureGrants ?? []);
    if (!active.includes(feature)) {
      throw new ForbiddenException({ message: 'Feature not available', code: 'FEATURE_DISABLED' });
    }
    return true;
  }
}
