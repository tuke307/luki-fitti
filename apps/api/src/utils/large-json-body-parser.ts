import express, { type RequestHandler, type Response } from 'express';
import type { ApiResponse } from '@luki-fitti/common/api/responses/api.response';
import { extractBearerToken } from '@/guards/auth.guard';

/** Same body as HttpExceptionFilter writes, so clients handle these errors like any other. */
function reject(res: Response, statusCode: number, message: string) {
  const body: ApiResponse<null> = {
    success: false,
    data: null,
    error: message,
    details: { statusCode, timestamp: new Date().toISOString() },
  };
  res.status(statusCode).json(body);
}

/**
 * JSON parser with a raised limit for routes that accept bodies above the global JSON
 * limit. It must run before Nest's global parser, which then sees the body as already read
 * and skips it. The mounted handler keeps a per-route name (`largeJsonParser` by default)
 * because Nest skips registering its global `jsonParser` when one with that name is
 * mounted — any other name is safe.
 *
 * Runs before AuthGuard, so it refuses to read a body without any session credential (the
 * `accessToken` cookie or a bearer token, as AuthGuard reads them) or with a declared size
 * above the limit. This is only a presence check; AuthGuard still verifies the token.
 */
export function registerLargeJsonBodyParser(
  app: { use: (path: string[], handler: RequestHandler) => unknown },
  opts: { paths: string[]; limit: number; tooLargeMessage: string; handlerName?: string },
) {
  const parser = express.json({ limit: opts.limit });
  const largeJsonParser: RequestHandler = (req, res, next) => {
    const cookieToken = (req.cookies as Record<string, unknown> | undefined)?.accessToken;
    if (!extractBearerToken(req) && !(typeof cookieToken === 'string' && cookieToken)) {
      reject(res, 401, 'Access token missing');
      return;
    }
    if (Number(req.headers['content-length'] ?? 0) > opts.limit) {
      reject(res, 413, opts.tooLargeMessage);
      return;
    }
    parser(req, res, next);
  };
  if (opts.handlerName) {
    Object.defineProperty(largeJsonParser, 'name', { value: opts.handlerName });
  }
  app.use(opts.paths, largeJsonParser);
}
