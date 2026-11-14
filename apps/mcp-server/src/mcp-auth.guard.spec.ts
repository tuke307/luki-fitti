import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { logger } from '@luki-fitti/logger';
import { formatApiKey, generateApiKeySecret } from './test-keys';
import { getForwardedKey, McpAuthGuard } from './mcp-auth.guard';

const KEY_ID = 'abc234de';
const SECRET = generateApiKeySecret();
const FULL_KEY = formatApiKey(KEY_ID, SECRET);

const ctx = (opts: {
  body?: unknown;
  authorization?: string;
  ip?: string;
  headers?: Record<string, string>;
}) => {
  const headersSet: Record<string, string> = {};
  const request = {
    body: opts.body,
    headers: {
      ...(opts.authorization ? { authorization: opts.authorization } : {}),
      ...opts.headers,
    },
    ip: opts.ip ?? '10.0.0.1',
  } as unknown as Request & { user?: unknown };
  const response = {
    setHeader: (k: string, v: string) => {
      headersSet[k.toLowerCase()] = v;
    },
  } as unknown as Response;
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  return { context, request, headersSet };
};

const bearer = `Bearer ${FULL_KEY}`;

const jsonRes = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  }) as unknown as globalThis.Response;

const introspection = (scopes = ['mcp', 'read:body']) =>
  jsonRes(200, { id: KEY_ID, scopes, expiresAt: null });

describe('McpAuthGuard', () => {
  it('lets the protocol handshake through without a key', async () => {
    const guard = new McpAuthGuard();
    guard.fetchImpl = mock.fn(async () => {
      throw new Error('must not be called');
    });
    for (const method of ['initialize', 'notifications/initialized', 'ping']) {
      assert.equal(await guard.canActivate(ctx({ body: { method } }).context), true);
    }
  });

  it('treats batch bodies and missing methods as non-public', async () => {
    const guard = new McpAuthGuard();
    for (const body of [[{ method: 'initialize' }], {}, undefined]) {
      await assert.rejects(guard.canActivate(ctx({ body }).context), UnauthorizedException);
    }
  });

  it('rejects tools/list and tools/call without a key: 401 + WWW-Authenticate', async () => {
    const guard = new McpAuthGuard();
    for (const method of ['tools/list', 'tools/call', 'resources/list']) {
      const { context, headersSet } = ctx({ body: { method } });
      await assert.rejects(guard.canActivate(context), (e: unknown) => {
        assert.ok(e instanceof UnauthorizedException);
        return true;
      });
      assert.equal(headersSet['www-authenticate'], 'Bearer realm="lukifitti"');
    }
  });

  it('rejects a malformed key without calling the API', async () => {
    const guard = new McpAuthGuard();
    let fetches = 0;
    guard.fetchImpl = async () => {
      fetches += 1;
      return introspection();
    };
    await assert.rejects(
      guard.canActivate(
        ctx({ body: { method: 'tools/list' }, authorization: 'Bearer not-a-key' }).context,
      ),
      UnauthorizedException,
    );
    await assert.rejects(
      guard.canActivate(
        ctx({ body: { method: 'tools/list' }, authorization: 'Bearer lf_pat_short' }).context,
      ),
      UnauthorizedException,
    );
    assert.equal(fetches, 0);
  });

  it('attaches user + forwarded key on success and forwards X-Forwarded-For', async () => {
    const guard = new McpAuthGuard();
    let seenAuth: string | null = null;
    let seenXff: string | null = null;
    guard.fetchImpl = async (_url, init) => {
      const h = init?.headers as Record<string, string>;
      seenAuth = h['authorization'] ?? null;
      seenXff = h['x-forwarded-for'] ?? null;
      return introspection();
    };
    const { context, request } = ctx({
      body: { method: 'tools/list' },
      authorization: bearer,
      ip: '203.0.113.9',
    });
    assert.equal(await guard.canActivate(context), true);
    assert.deepEqual(request.user, { keyId: KEY_ID, scope: 'mcp read:body' });
    assert.equal(getForwardedKey(request), FULL_KEY);
    assert.equal(seenAuth, bearer);
    assert.equal(seenXff, '203.0.113.9');
  });

  it('maps API 401 to 401 with WWW-Authenticate', async () => {
    const guard = new McpAuthGuard();
    guard.fetchImpl = async () => jsonRes(401, { error: 'invalid_api_key' });
    const { context, headersSet } = ctx({ body: { method: 'tools/list' }, authorization: bearer });
    await assert.rejects(guard.canActivate(context), UnauthorizedException);
    assert.equal(headersSet['www-authenticate'], 'Bearer realm="lukifitti"');
  });

  it('maps 403 insufficient_scope to "not allowed for AI assistants"', async () => {
    const guard = new McpAuthGuard();
    guard.fetchImpl = async () => jsonRes(403, { error: 'insufficient_scope', required: 'mcp' });
    await assert.rejects(
      guard.canActivate(ctx({ body: { method: 'tools/list' }, authorization: bearer }).context),
      (e: unknown) => {
        assert.ok(e instanceof ForbiddenException);
        assert.match(
          JSON.stringify((e as ForbiddenException).getResponse()),
          /not allowed for AI assistants/,
        );
        return true;
      },
    );
  });

  it('maps mcp_disabled and api_keys_disabled to 403 "disabled"', async () => {
    for (const code of ['mcp_disabled', 'api_keys_disabled']) {
      const guard = new McpAuthGuard();
      guard.fetchImpl = async () => jsonRes(403, { error: code });
      await assert.rejects(
        guard.canActivate(ctx({ body: { method: 'tools/list' }, authorization: bearer }).context),
        (e: unknown) => {
          assert.ok(e instanceof ForbiddenException);
          assert.match(
            JSON.stringify((e as ForbiddenException).getResponse()),
            /AI assistant access is disabled/,
          );
          return true;
        },
      );
    }
  });

  it('passes Retry-After on 429 and maps network errors/5xx to 503', async () => {
    const guard = new McpAuthGuard();
    guard.fetchImpl = async () => jsonRes(429, { error: 'rate_limited' }, { 'retry-after': '42' });
    const { context, headersSet } = ctx({ body: { method: 'tools/call' }, authorization: bearer });
    await assert.rejects(guard.canActivate(context), (e: unknown) => {
      assert.equal((e as { getStatus?: () => number }).getStatus?.(), 429);
      return true;
    });
    assert.equal(headersSet['retry-after'], '42');

    guard.fetchImpl = async () => {
      throw new Error('ECONNREFUSED');
    };
    await assert.rejects(guard.canActivate(context), ServiceUnavailableException);

    guard.fetchImpl = async () => jsonRes(500, { error: 'internal_error' });
    await assert.rejects(guard.canActivate(context), ServiceUnavailableException);
  });

  it('caches successful introspections for 60 s and never caches failures', async () => {
    const guard = new McpAuthGuard();
    let now = 1_000_000;
    guard.now = () => now;
    let fetches = 0;
    guard.fetchImpl = async () => {
      fetches += 1;
      return introspection();
    };
    const c = () => ctx({ body: { method: 'tools/list' }, authorization: bearer }).context;
    await guard.canActivate(c());
    await guard.canActivate(c());
    assert.equal(fetches, 1, 'second call within 60 s hits the cache');
    now += 61_000;
    await guard.canActivate(c());
    assert.equal(fetches, 2, 'cache expired after 60 s');

    // Failures are not cached: a 401 followed by a success re-fetches.
    const key2 = formatApiKey('234567ab', SECRET);
    const bearer2 = `Bearer ${key2}`;
    let good = false;
    let fetches2 = 0;
    guard.fetchImpl = async () => {
      fetches2 += 1;
      return good ? introspection() : jsonRes(401, { error: 'invalid_api_key' });
    };
    await assert.rejects(
      guard.canActivate(ctx({ body: { method: 'tools/list' }, authorization: bearer2 }).context),
      UnauthorizedException,
    );
    good = true;
    assert.equal(
      await guard.canActivate(
        ctx({ body: { method: 'tools/list' }, authorization: bearer2 }).context,
      ),
      true,
    );
    assert.equal(fetches2, 2, 'the failure was not cached — the retry hit the API');
  });

  it('never logs the token — only the key id', async () => {
    const guard = new McpAuthGuard();
    guard.fetchImpl = async () => jsonRes(500, { error: 'internal_error' });
    const spy = mock.method(logger, 'error');
    const spyInfo = mock.method(logger, 'info');
    const spyDebug = mock.method(logger, 'debug');
    const spyWarn = mock.method(logger, 'warn');
    await assert.rejects(
      guard.canActivate(ctx({ body: { method: 'tools/call' }, authorization: bearer }).context),
      ServiceUnavailableException,
    );
    for (const s of [spy, spyInfo, spyDebug, spyWarn]) {
      for (const call of s.mock.calls) {
        assert.ok(!JSON.stringify(call.arguments).includes(FULL_KEY));
        assert.ok(!JSON.stringify(call.arguments).includes(SECRET));
      }
    }
    mock.restoreAll();
  });
});
