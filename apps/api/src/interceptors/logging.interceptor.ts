import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { logger } from '@luki-fitti/logger';

/** Fields whose values must never reach logs (secrets, credentials, API keys). */
const SENSITIVE_KEY =
  /pass(word)?|secret|token|api[-_]?key|authorization|cookie|csrf|^auth$|p256dh|hashes/i;

/** Request bodies that must never be logged, even redacted (privacy promise in the policy). */
const OMITTED_BODY_PATHS = [/^\/api\/import\//, /^\/api\/social\/contacts\/match/];

/** Masks capability tokens that travel in URL paths (friend invites). Exported for tests. */
export function redactUrlForLog(url: string): string {
  return url.replace(/(\/invites?\/)[^/?#]+/g, '$1[redacted]');
}

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
    logger.info(`OriginalUrl: ${redactUrlForLog(request.originalUrl)}`);
    logger.info(`Headers: ${JSON.stringify(redactForLog(request.headers))}`);
    logger.info(`Query: ${JSON.stringify(redactForLog(request.query))}`);
    // Import files hold a user's whole training history and contact hashes are
    // promised to be discarded; never log either.
    logger.info(
      OMITTED_BODY_PATHS.some((path) => path.test(request.originalUrl))
        ? 'Body: [omitted]'
        : `Body: ${JSON.stringify(redactForLog(request.body))}`,
    );

    return next.handle();
  }
}
