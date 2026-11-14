import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ApiKeyScope } from '@luki-fitti/common/enums';
import { API_SCOPE_KEY } from '@/decorators/api-scope.decorator';
import type { RequestApiKey } from './api-key.guard';

/**
 * Checks `@ApiScope(...)` metadata against the key's granted scopes. Deny by
 * default: a route without the decorator throws 403, so a public route can
 * never be reached unscoped by accident.
 */
@Injectable()
export class ScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<ApiKeyScope | undefined>(API_SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) {
      throw new ForbiddenException({
        message: 'This route requires an API scope declaration',
        code: 'insufficient_scope',
      });
    }

    const request = context.switchToHttp().getRequest<Request & { apiKey?: RequestApiKey }>();
    if (!request.apiKey?.scopes.includes(required)) {
      throw new ForbiddenException({
        message: 'Missing required scope',
        code: 'insufficient_scope',
        required,
      });
    }
    return true;
  }
}
