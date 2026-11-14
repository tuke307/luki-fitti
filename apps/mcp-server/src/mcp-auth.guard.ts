import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';
import { API_KEY_PREFIX, parseApiKey } from '@luki-fitti/common/utils';
import { logger } from '@luki-fitti/logger';
import { API_BASE_URL } from './config';

/**
 * MCP methods that work without a key so clients can connect and negotiate the
 * protocol. Everything else — including `tools/list`, whose result is filtered
 * by the key's scopes — needs a key.
 */
const PUBLIC_MCP_METHODS = new Set<string>(['initialize', 'notifications/initialized', 'ping']);

const UNAUTHENTICATED_MESSAGE = 'Personal API key required';
const WWW_AUTHENTICATE = 'Bearer realm="lukifitti"';
const INTROSPECTION_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 1_000;

/** Module-private symbol under which the raw token travels to the tools. */
const FORWARDED_KEY = Symbol('lukifitti.forwardedKey');

/** The API key attached to this request by `McpAuthGuard`, for forwarding to `/api/v1`. */
export function getForwardedKey(req: unknown): string | undefined {
  return (req as Record<symbol, string | undefined>)[FORWARDED_KEY];
}

interface Introspection {
  keyId: string;
  scopes: string[];
  expiresAt: string | null;
}

interface CacheEntry extends Introspection {
  cachedAt: number;
}

/**
 * Authenticates MCP requests with the caller's personal API key (`Bearer
 * lf_pat_…`). The guard never verifies the key itself: it introspects
 * `GET /v1/key` on the main API, which enforces validity, the `mcp` scope and
 * the `mcpEnabled` kill switch. Successful introspections are cached for 60 s
 * keyed by the token hash (a revoked key stops working within a minute);
 * failures are never cached.
 *
 * The token is forwarded to the tools via `getForwardedKey(req)` and is never
 * logged — log lines only carry the public key id.
 */
@Injectable()
export class McpAuthGuard implements CanActivate {
  /** Overridable in tests. */
  public fetchImpl: typeof fetch = fetch;
  public now: () => number = () => Date.now();

  /** sha256(token) → introspection. Map order = insertion order (oldest first). */
  private readonly cache = new Map<string, CacheEntry>();

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const body = request.body as { method?: string } | unknown[] | undefined;
    const method = Array.isArray(body) ? undefined : body?.method;

    if (method && PUBLIC_MCP_METHODS.has(method)) {
      return true;
    }

    const token = this.bearerToken(request);
    if (!token || !parseApiKey(token)) {
      throw this.unauthenticated(response);
    }

    const hash = createHash('sha256').update(token).digest('hex');
    const cached = this.cacheGet(hash);
    const introspection = cached ?? (await this.introspect(token, request, response));

    (request as Request & { user?: unknown }).user = {
      keyId: introspection.keyId,
      scope: introspection.scopes.join(' '),
    };
    (request as unknown as Record<symbol, unknown>)[FORWARDED_KEY] = token;
    return true;
  }

  private bearerToken(request: Request): string | null {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) return null;
    const token = header.slice('Bearer '.length).trim();
    return token.startsWith(API_KEY_PREFIX) ? token : null;
  }

  private unauthenticated(response: Response): UnauthorizedException {
    response.setHeader('WWW-Authenticate', WWW_AUTHENTICATE);
    return new UnauthorizedException({ message: UNAUTHENTICATED_MESSAGE });
  }

  private cacheGet(hash: string): CacheEntry | null {
    const entry = this.cache.get(hash);
    if (!entry) return null;
    if (entry.cachedAt + CACHE_TTL_MS <= this.now()) {
      this.cache.delete(hash);
      return null;
    }
    return entry;
  }

  private cacheSet(hash: string, entry: Introspection): void {
    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(hash, { ...entry, cachedAt: this.now() });
  }

  /**
   * `GET /v1/key` with the caller's key. `X-Forwarded-For` carries the real
   * client IP (resolved by Express through `trust proxy 1`), because the API's
   * failed-key counter is per IP and would otherwise see only this container.
   */
  private async introspect(
    token: string,
    request: Request,
    response: Response,
  ): Promise<Introspection> {
    let res: globalThis.Response;
    try {
      res = await this.fetchImpl(`${API_BASE_URL}/v1/key`, {
        headers: {
          authorization: `Bearer ${token}`,
          'x-forwarded-for': request.ip ?? '',
        },
        signal: AbortSignal.timeout(INTROSPECTION_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException({ message: 'LukiFitti API unavailable' });
    }

    if (res.status === 200) {
      const body = (await res.json()) as { id: string; scopes: string[]; expiresAt: string | null };
      const entry: Introspection = {
        keyId: body.id,
        scopes: body.scopes,
        expiresAt: body.expiresAt,
      };
      this.cacheSet(createHash('sha256').update(token).digest('hex'), entry);
      return entry;
    }

    const code = await this.errorCode(res);

    if (res.status === 401) {
      throw this.unauthenticated(response);
    }
    if (res.status === 403 && code === 'insufficient_scope') {
      throw new ForbiddenException({
        message: 'This API key is not allowed for AI assistants',
      });
    }
    if (res.status === 403 && (code === 'mcp_disabled' || code === 'api_keys_disabled')) {
      throw new ForbiddenException({ message: 'AI assistant access is disabled' });
    }
    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      if (retryAfter) response.setHeader('Retry-After', retryAfter);
      throw new HttpException({ message: 'Rate limit reached' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    logger.error(`key introspection failed with ${res.status}`);
    throw new ServiceUnavailableException({ message: 'LukiFitti API unavailable' });
  }

  /** The API's v1 error envelope carries the machine code in `error`. */
  private async errorCode(res: globalThis.Response): Promise<string | null> {
    try {
      const body = (await res.json()) as { error?: string; code?: string };
      return body.error ?? body.code ?? null;
    } catch {
      return null;
    }
  }
}
