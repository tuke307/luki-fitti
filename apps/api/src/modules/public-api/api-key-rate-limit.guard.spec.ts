import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HttpException, HttpStatus, type ExecutionContext } from '@nestjs/common';
import { ApiKeyRateLimitGuard } from './api-key-rate-limit.guard';

const ctx = () => {
  const headers = new Map<string, string>();
  const c = {
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: 'u1' }, apiKey: { id: 'k1', scopes: [] } }),
      getResponse: () => ({
        setHeader: (k: string, v: string) => headers.set(k, v),
        getHeader: (k: string) => headers.get(k),
      }),
    }),
  } as unknown as ExecutionContext;
  return { c, headers };
};

const guard = (counts: Record<string, number>, ttls: Record<string, number> = {}) => {
  const g = new ApiKeyRateLimitGuard();
  g.increment = async (key) => counts[key] ?? 1;
  g.ttl = async (key) => ttls[key] ?? 42;
  return g;
};

describe('ApiKeyRateLimitGuard', () => {
  it('always emits the per-minute X-RateLimit headers', async () => {
    const { c, headers } = ctx();
    const g = guard({ 'apikey:rl:m:k1': 5 });
    assert.equal(await g.canActivate(c), true);
    assert.equal(headers.get('X-RateLimit-Limit'), '60');
    assert.equal(headers.get('X-RateLimit-Remaining'), '55');
    const reset = Number(headers.get('X-RateLimit-Reset'));
    assert.ok(reset > Math.floor(Date.now() / 1000));
  });

  it('rejects the 61st request in a minute with 429 + Retry-After', async () => {
    const { c, headers } = ctx();
    const g = guard({ 'apikey:rl:m:k1': 61 }, { 'apikey:rl:m:k1': 30 });
    await assert.rejects(g.canActivate(c), (e: unknown) => {
      assert.ok(e instanceof HttpException);
      assert.equal((e as HttpException).getStatus(), HttpStatus.TOO_MANY_REQUESTS);
      assert.match(JSON.stringify((e as HttpException).getResponse()), /rate_limited/);
      return true;
    });
    assert.equal(headers.get('Retry-After'), '30');
    // headers still emitted on rejection
    assert.equal(headers.get('X-RateLimit-Remaining'), '0');
  });

  it('enforces the per-key daily cap', async () => {
    const { c, headers } = ctx();
    const g = guard({ 'apikey:rl:d:k1': 5001 }, { 'apikey:rl:d:k1': 3600 });
    await assert.rejects(g.canActivate(c), HttpException);
    assert.equal(headers.get('Retry-After'), '3600');
  });

  it('enforces the per-user daily cap across keys', async () => {
    const { c, headers } = ctx();
    const g = guard({ 'apikey:rl:ud:u1': 10001 }, { 'apikey:rl:ud:u1': 7200 });
    await assert.rejects(g.canActivate(c), HttpException);
    assert.equal(headers.get('Retry-After'), '7200');
  });
});
