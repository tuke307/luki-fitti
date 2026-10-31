import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { logger } from '@luki-fitti/logger';

/** Fields whose values must never reach logs (secrets, credentials, API keys). */
const SENSITIVE_KEY = /pass(word)?|secret|token|api[-_]?key|authorization|cookie|csrf/i;

/** Deep copy with sensitive values replaced. Exported for tests. */
export function redactForLog(value: unknown, depth = 0): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (depth > 6) return '[truncated]';
  if (Array.isArray(value)) return value.map((item) => redactForLog(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, v]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[redacted]' : redactForLog(v, depth + 1),
    ]),
  );
}

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();

    logger.info(`Method: ${request.method}`);
    logger.info(`OriginalUrl: ${request.originalUrl}`);
    logger.info(`Headers: ${JSON.stringify(redactForLog(request.headers))}`);
    logger.info(`Query: ${JSON.stringify(redactForLog(request.query))}`);
    logger.info(`Body: ${JSON.stringify(redactForLog(request.body))}`);

    return next.handle();
  }
}
