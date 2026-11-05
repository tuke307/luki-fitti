import {
  IMPORT_LIMITS,
  IMPORT_MAX_BYTES,
  ImportFileSchema,
  formatImportIssues,
  type ImportIssueDto,
} from '@luki-fitti/common/schemas';
import { ApiClientError } from '@/lib/api/client';

export const IMPORT_FORMAT_DOC_URL =
  'https://github.com/tuke307/luki-fitti/blob/main/docs/import-format.md';

export type ImportFileCheck =
  | { ok: true }
  | { ok: false; error: 'tooLarge' | 'invalidJson' }
  | { ok: false; error: 'invalidFile'; issues: ImportIssueDto[]; issueCount: number };

/**
 * Checks a picked file locally with the shared schema before anything is uploaded, so format
 * problems are listed without a round trip (the API validates again).
 */
export function checkImportFile(text: string, sizeBytes: number): ImportFileCheck {
  if (sizeBytes > IMPORT_MAX_BYTES) return { ok: false, error: 'tooLarge' };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'invalidJson' };
  }
  const result = ImportFileSchema.safeParse(json);
  if (result.success) return { ok: true };
  return {
    ok: false,
    error: 'invalidFile',
    issues: formatImportIssues(result.error).slice(0, IMPORT_LIMITS.issues),
    issueCount: result.error.issues.length,
  };
}

export type ImportRequestError = 'rateLimited' | 'networkError' | 'tooLarge' | 'genericError';

export function importRequestError(error: unknown): ImportRequestError {
  if (!(error instanceof ApiClientError)) return 'genericError';
  if (error.isNetworkError) return 'networkError';
  if (error.status === 429) return 'rateLimited';
  if (error.status === 413) return 'tooLarge';
  return 'genericError';
}
