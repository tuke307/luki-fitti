import express, { type RequestHandler, type Response } from 'express';
import { IMPORT_MAX_BYTES } from '@luki-fitti/common/schemas';
import type { ApiResponse } from '@luki-fitti/common/api/responses/api.response';
import { extractBearerToken } from '@/guards/auth.guard';

/** The only routes that accept bodies above the global JSON limit. */
export const IMPORT_ROUTE_PATHS = ['/api/import/preview', '/api/import/commit'];

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
 * JSON parser with a 10 MB limit for the import routes. It must run before Nest's global
 * parser, which then sees the body as already read and skips it. The wrapper has its own name
 * because Nest skips registering its global `jsonParser` when one with that name is mounted.
 *
 * Runs before AuthGuard, so it refuses to read a body without any session credential (the
 * `accessToken` cookie or a bearer token, as AuthGuard reads them) or with a declared size above
 * the limit. This is only a presence check; AuthGuard still verifies the token.
 */
export function registerImportBodyParser(app: {
  use: (path: string[], handler: RequestHandler) => unknown;
}) {
  const parser = express.json({ limit: IMPORT_MAX_BYTES });
  const importJsonParser: RequestHandler = (req, res, next) => {
    const cookieToken = (req.cookies as Record<string, unknown> | undefined)?.accessToken;
    if (!extractBearerToken(req) && !(typeof cookieToken === 'string' && cookieToken)) {
      reject(res, 401, 'Access token missing');
      return;
    }
    if (Number(req.headers['content-length'] ?? 0) > IMPORT_MAX_BYTES) {
      reject(res, 413, 'Import file is larger than 10 MB');
      return;
    }
    parser(req, res, next);
  };
  app.use(IMPORT_ROUTE_PATHS, importJsonParser);
}
