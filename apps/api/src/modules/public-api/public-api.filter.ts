import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { logger } from '@luki-fitti/logger';

/**
 * `/api/v1` error contract: `{ error: <code>, message, ...extra }` instead of
 * the app envelope. Applied via `@UseFilters` on the public controllers (it
 * also catches exceptions thrown by their guards).
 */
@Catch()
export class PublicApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const obj =
        typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
      const message =
        typeof body === 'string'
          ? body
          : ((obj.message as string | undefined) ?? exception.message);

      const code = (obj.code as string | undefined) ?? this.codeForStatus(status);
      const extra: Record<string, unknown> = {};
      if (typeof obj.required === 'string') extra.required = obj.required;
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        const retryAfter = response.getHeader('Retry-After');
        if (retryAfter) extra.retryAfterSeconds = Number(retryAfter);
      }

      response.status(status).json({ error: code, message, ...extra });
      return;
    }

    // Never leak internals: generic message, details only in the server log.
    logger.error('Unhandled /api/v1 error:', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: 'internal_error',
      message: 'Internal server error',
    });
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return 'invalid_request';
      case HttpStatus.UNAUTHORIZED:
        return 'invalid_api_key';
      case HttpStatus.FORBIDDEN:
        return 'insufficient_scope';
      case HttpStatus.NOT_FOUND:
        return 'not_found';
      case HttpStatus.TOO_MANY_REQUESTS:
        return 'rate_limited';
      default:
        return 'internal_error';
    }
  }
}
