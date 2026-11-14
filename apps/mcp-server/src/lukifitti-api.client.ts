import { Injectable } from '@nestjs/common';
import type { PublicListDto } from '@luki-fitti/common/schemas';
import { getForwardedKey } from './mcp-auth.guard';
import { API_BASE_URL } from './config';

const REQUEST_TIMEOUT_MS = 10_000;

/** Typed failure of a forwarded `/api/v1` call; tools map it to an `isError` result. */
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryAfterSeconds?: number,
    public readonly required?: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

/**
 * Thin HTTP client for `/api/v1` that forwards the caller's personal API key
 * (attached to the request by `McpAuthGuard`) plus the real client IP. The API
 * enforces owner isolation, scopes and rate limits — this client adds nothing
 * but transport and error typing.
 */
@Injectable()
export class LukiFittiApiClient {
  /** Overridable in tests. */
  public fetchImpl: typeof fetch = fetch;

  async get<T>(path: string, query: Record<string, string | number | undefined>, req: unknown) {
    const key = getForwardedKey(req);
    if (!key) throw new ApiRequestError(401, 'unauthenticated', 'Personal API key required');

    const url = new URL(`${API_BASE_URL}${path}`);
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
    }

    const ip = (req as { ip?: string }).ip ?? '';
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        headers: { authorization: `Bearer ${key}`, 'x-forwarded-for': ip },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ApiRequestError(503, 'api_unavailable', 'LukiFitti API unavailable');
    }

    if (!res.ok) throw await this.toError(res);
    return (await res.json()) as T;
  }

  /**
   * Follows `nextCursor` until the list is exhausted or `maxRows` is reached.
   * Lists are ordered by `updatedAt`, not by event date — callers that need
   * chronological data must sort afterwards. `truncated` is true when a
   * `nextCursor` was still pending at the cap: the range then contains rows
   * the caller never saw, so aggregates over the result are partial and the
   * tool MUST flag it instead of answering silently.
   */
  async getAll<T>(
    path: string,
    query: Record<string, string | number | undefined>,
    req: unknown,
    { maxRows = 200 }: { maxRows?: number } = {},
  ): Promise<{ rows: T[]; truncated: boolean }> {
    const rows: T[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.get<PublicListDto<T>>(path, { ...query, cursor }, req);
      rows.push(...page.data);
      cursor = page.nextCursor ?? undefined;
    } while (cursor && rows.length < maxRows);
    return { rows: rows.slice(0, maxRows), truncated: cursor !== undefined };
  }

  private async toError(res: Response): Promise<ApiRequestError> {
    let code = 'api_error';
    let message = `LukiFitti API answered ${res.status}`;
    let required: string | undefined;
    try {
      const body = (await res.json()) as { error?: string; message?: string; required?: string };
      if (body.error) code = body.error;
      if (body.message) message = body.message;
      if (body.required) required = body.required;
    } catch {
      // keep defaults
    }
    const retryAfter = res.headers.get('retry-after');
    return new ApiRequestError(
      res.status,
      code,
      message,
      retryAfter ? Number(retryAfter) : undefined,
      required,
    );
  }
}
