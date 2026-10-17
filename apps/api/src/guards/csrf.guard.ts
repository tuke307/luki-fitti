import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { constantTimeEqual } from '@luki-fitti/common/utils/crypto';

@Injectable()
export class CsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const csrfTokenFromCookie: string = request.cookies.csrfToken ?? '';
    const headerValue = request.headers['x-csrf-token'];
    const csrfTokenFromHeader: string = Array.isArray(headerValue)
      ? (headerValue[0] ?? '')
      : (headerValue ?? '');

    if (!csrfTokenFromCookie || !csrfTokenFromHeader) {
      throw new ForbiddenException('CSRF token missing');
    }

    // Constant-time compare: a plain !== short-circuits on the first differing
    // byte, leaking the token over a timing side channel.
    if (!constantTimeEqual(csrfTokenFromCookie, csrfTokenFromHeader)) {
      throw new ForbiddenException('Invalid CSRF token');
    }

    return true;
  }
}
