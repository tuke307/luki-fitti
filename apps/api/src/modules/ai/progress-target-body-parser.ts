import type { RequestHandler } from 'express';
import { PROGRESS_TARGET_MAX_BODY_BYTES } from '@luki-fitti/common/schemas';
import { registerLargeJsonBodyParser } from '@/utils/large-json-body-parser';

/** The progress-target photo upload accepts a base64 image above the global JSON limit. */
export const PROGRESS_TARGET_ROUTE_PATHS = ['/api/ai/progress-target'];

export function registerProgressTargetBodyParser(app: {
  use: (path: string[], handler: RequestHandler) => unknown;
}) {
  registerLargeJsonBodyParser(app, {
    paths: PROGRESS_TARGET_ROUTE_PATHS,
    limit: PROGRESS_TARGET_MAX_BODY_BYTES,
    tooLargeMessage: 'Image is larger than 6 MB',
    handlerName: 'progressTargetJsonParser',
  });
}
