import { Injectable } from '@nestjs/common';
import { ApiRequestError } from '../lukifitti-api.client';
import { DateInputError } from './mcp-date-utils';

/** MCP tool result with a human-readable text plus the full payload. */
export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
  isError?: true;
}

export const okResult = (text: string, data: Record<string, unknown>): ToolResult => ({
  content: [{ type: 'text', text }],
  structuredContent: data,
});

export const errorResult = (message: string): ToolResult => ({
  content: [{ type: 'text', text: message }],
  structuredContent: { error: message },
  isError: true,
});

/** Row cap for tool outputs; `truncated` + a hint go into the result when hit. */
export const MAX_ROWS = 200;

export function truncateRows<T>(rows: T[], max = MAX_ROWS): { rows: T[]; truncated: boolean } {
  return rows.length > max
    ? { rows: rows.slice(0, max), truncated: true }
    : { rows, truncated: false };
}

/** User-provided free text never leaves the tools; names are clipped to 80 chars. */
export const clipName = (name: string): string => name.slice(0, 80);

/**
 * In-memory per-key tool rate limit (30 calls/min on top of the API's per-key
 * limits, because one tool call can fan out to several `/v1` requests). Over
 * the limit the tool returns a `isError` result instead of a raw 429.
 */
@Injectable()
export class ToolRateLimiter {
  public now: () => number = () => Date.now();
  private readonly hits = new Map<string, number[]>();

  /** Seconds until the next call is allowed, or 0 when the call may proceed. */
  check(keyId: string, limitPerMinute = 30): number {
    const windowStart = this.now() - 60_000;
    const hits = (this.hits.get(keyId) ?? []).filter((t) => t > windowStart);
    if (hits.length >= limitPerMinute) {
      this.hits.set(keyId, hits);
      return Math.ceil((hits[0]! + 60_000 - this.now()) / 1000);
    }
    hits.push(this.now());
    this.hits.set(keyId, hits);
    // bound memory: drop keys we haven't seen in a while
    if (this.hits.size > 10_000) this.hits.clear();
    return 0;
  }
}

/** The key id (`lf_pat_<id>`) the guard attached — safe to log, unlike the token. */
export const keyIdOf = (req: unknown): string =>
  ((req as { user?: { keyId?: string } }).user?.keyId ?? 'unknown') as string;

/** Scopes of the caller's key as attached by the guard (`req.user.scope`). */
export const scopesOf = (req: unknown): string[] =>
  ((req as { user?: { scope?: string } }).user?.scope ?? '').split(' ').filter(Boolean);

/** Maps any failure to a short, safe `isError` tool result — never a stack trace. */
export function toToolError(err: unknown): ToolResult {
  if (err instanceof DateInputError) return errorResult(err.message);
  if (err instanceof ApiRequestError) {
    if (err.status === 403 && err.code === 'insufficient_scope') {
      return errorResult(
        `This API key is missing the required scope${err.required ? `: ${err.required}` : ''}`,
      );
    }
    if (err.status === 404) return errorResult('Not found');
    if (err.status === 429) {
      const secs = err.retryAfterSeconds ?? 60;
      return errorResult(`Rate limit reached, try again in ${secs} s`);
    }
    if (err.status === 401) return errorResult('Personal API key rejected');
    return errorResult('LukiFitti API unavailable');
  }
  return errorResult('Tool failed');
}

/**
 * Shared wrapper: per-key tool rate limit + safe error mapping. `work` only
 * runs when under the limit and returns the tool's ToolResult.
 */
export async function runTool(
  limiter: ToolRateLimiter,
  req: unknown,
  work: () => Promise<ToolResult>,
): Promise<ToolResult> {
  const wait = limiter.check(keyIdOf(req));
  if (wait > 0) return errorResult(`Rate limit reached, try again in ${wait} s`);
  try {
    return await work();
  } catch (err) {
    return toToolError(err);
  }
}
