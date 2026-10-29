import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  /** Admin permissions, loaded from the database on every request (never from the JWT). */
  permissions?: string[];
  /** Individually granted opt-in features, loaded from the database on every request. */
  featureGrants?: string[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!request.user?.id) {
      throw new UnauthorizedException('User session required');
    }
    return request.user;
  },
);
