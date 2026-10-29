import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PERMISSIONS_KEY } from '@/decorators/permissions.decorator';
import type { AuthenticatedUser } from '@/decorators/current-user.decorator';

/**
 * Deny-by-default admin gate. A handler/controller without `@RequirePermissions` metadata is
 * rejected too, so forgetting the decorator on a new admin route can never expose it.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const held = request.user?.permissions ?? [];
    if (!held.some((permission) => required.includes(permission))) {
      throw new ForbiddenException('Insufficient permissions');
    }
    return true;
  }
}
