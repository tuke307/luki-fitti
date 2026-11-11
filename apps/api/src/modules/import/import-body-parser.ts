import type { RequestHandler } from 'express';
import { IMPORT_MAX_BYTES } from '@luki-fitti/common/schemas';
import { registerLargeJsonBodyParser } from '@/utils/large-json-body-parser';

/** The only routes that accept bodies above the global JSON limit. */
export const IMPORT_ROUTE_PATHS = ['/api/import/preview', '/api/import/commit'];

export function registerImportBodyParser(app: {
  use: (path: string[], handler: RequestHandler) => unknown;
}) {
  registerLargeJsonBodyParser(app, {
    paths: IMPORT_ROUTE_PATHS,
    limit: IMPORT_MAX_BYTES,
    tooLargeMessage: 'Import file is larger than 10 MB',
    handlerName: 'importJsonParser',
  });
}
