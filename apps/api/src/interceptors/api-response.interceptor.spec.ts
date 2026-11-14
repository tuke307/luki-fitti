import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { of, firstValueFrom } from 'rxjs';
import type { ExecutionContext } from '@nestjs/common';
import { ApiResponseInterceptor } from './api-response.interceptor';

const ctx = (originalUrl: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ originalUrl }) }),
  }) as unknown as ExecutionContext;

const handler = (data: unknown) => ({ handle: () => of(data) });

describe('ApiResponseInterceptor /api/v1 passthrough', () => {
  const interceptor = new ApiResponseInterceptor();

  it('wraps app routes in the { success, data } envelope', async () => {
    const out = await firstValueFrom(
      interceptor.intercept(ctx('/api/sessions'), handler({ x: 1 })),
    );
    assert.deepEqual(out, { success: true, data: { x: 1 }, error: null });
  });

  it('returns raw DTOs for /api/v1 routes', async () => {
    const payload = { data: [{ id: '1' }], nextCursor: null };
    for (const url of ['/api/v1/sessions', '/api/v1/me', '/api/v1/exercises?custom=true']) {
      const out = await firstValueFrom(interceptor.intercept(ctx(url), handler(payload)));
      assert.deepEqual(out, payload, url);
    }
  });
});
