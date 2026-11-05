import express, { type RequestHandler } from 'express';
import { IMPORT_MAX_BYTES } from '@luki-fitti/common/schemas';

/** The only routes that accept bodies above the global JSON limit. */
export const IMPORT_ROUTE_PATHS = ['/api/import/preview', '/api/import/commit'];

/**
 * JSON parser with a 10 MB limit for the import routes. It must run before Nest's global
 * parser, which then sees the body as already read and skips it. The wrapper has its own name
 * because Nest skips registering its global `jsonParser` when one with that name is mounted.
 */
export function registerImportBodyParser(app: {
  use: (path: string[], handler: RequestHandler) => unknown;
}) {
  const parser = express.json({ limit: IMPORT_MAX_BYTES });
  const importJsonParser: RequestHandler = (req, res, next) => parser(req, res, next);
  app.use(IMPORT_ROUTE_PATHS, importJsonParser);
}
