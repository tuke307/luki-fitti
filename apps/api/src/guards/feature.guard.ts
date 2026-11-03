import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { FeatureGrant } from '@luki-fitti/common/enums';
import { FEATURE_KEY } from '@/decorators/permissions.decorator';
import type { AuthenticatedUser } from '@/decorators/current-user.decorator';
import { AppSettingsService } from '@/modules/app-settings/app-settings.service';

/** Deny-by-default gate for opt-in features (global switch on AND a usable OpenRouter key). */
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
    if (!request.user?.id) {
      throw new ForbiddenException({ message: 'Feature not available', code: 'FEATURE_DISABLED' });
    }
    const enabled = await this.appSettings.enabledFeatures();
    if (!enabled.includes(feature)) {
      throw new ForbiddenException({ message: 'Feature not available', code: 'FEATURE_DISABLED' });
    }
    if (!(await this.appSettings.hasAiKey(request.user.id))) {
      throw new ForbiddenException({
        message: 'An OpenRouter API key is required',
        code: 'AI_KEY_REQUIRED',
      });
    }
    return true;
  }
}
