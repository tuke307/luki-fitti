import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import { PROGRESS_TARGET_MAX_BODY_BYTES } from '@luki-fitti/common/schemas';
import {
  PROGRESS_TARGET_ROUTE_PATHS,
  registerProgressTargetBodyParser,
} from './progress-target-body-parser';

describe('registerProgressTargetBodyParser', () => {
  let server: Server;
  let base: string;
  /** Whether the last request's body was read before the response started. */
  let bodyRead = false;

  before(async () => {
    const app = express();
    app.use((req, res, next) => {
      bodyRead = false;
      const on = req.on.bind(req);
      req.on = ((event: string, listener: (...args: unknown[]) => void) => {
        if ((event === 'data' || event === 'readable') && !res.headersSent) bodyRead = true;
        return on(event, listener);
      }) as typeof req.on;
      next();
    });
    app.use(cookieParser());
    registerProgressTargetBodyParser(app);
    // Mirrors Nest's global parser (default 100 kB limit), registered after main.ts middleware.
    app.use(express.json());
    app.post(/.*/, (req, res) => {
      res.json({ received: JSON.stringify(req.body).length });
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express needs 4 parameters
    app.use(((err, _req, res, _next) => {
      res.status(err.status ?? 500).json({ error: err.type });
    }) as express.ErrorRequestHandler);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => server.close());

  const post = (
    path: string,
    bytes: number,
    auth: Record<string, string> = { Authorization: 'Bearer any-token' },
  ) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({ imageBase64: 'x'.repeat(bytes) }),
    });

  it('accepts a multi-MB photo body with a bearer token', async () => {
    const res = await post(PROGRESS_TARGET_ROUTE_PATHS[0]!, 1.5 * 1024 * 1024);
    assert.equal(res.status, 200);
    assert.equal(bodyRead, true);
  });

  it('answers 401 without reading the body when no session credential is sent', async () => {
    const res = await post(PROGRESS_TARGET_ROUTE_PATHS[0]!, 1024, {});
    assert.equal(res.status, 401);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.success, false);
    assert.equal(body.error, 'Access token missing');
    assert.equal(bodyRead, false);
  });

  it('answers 413 with the size message for a declared size above the limit', async () => {
    const { request } = await import('node:http');
    const result = await new Promise<{ status: number; message: string }>((resolve) => {
      const req = request(`${base}${PROGRESS_TARGET_ROUTE_PATHS[0]}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(PROGRESS_TARGET_MAX_BODY_BYTES + 1),
          Authorization: 'Bearer abc',
        },
      });
      let data = '';
      req.on('response', (res) => {
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          resolve({ status: res.statusCode ?? 0, message: String(parsed.error) });
          req.destroy();
        });
      });
      req.on('error', () => undefined); // destroying the request after the answer is expected
      req.write('{"imageBase64":"');
    });
    assert.equal(result.status, 413);
    assert.equal(result.message, 'Image is larger than 6 MB');
    assert.equal(bodyRead, false);
  });

  it('keeps the global limit on every other route', async () => {
    assert.equal((await post('/api/ai/chat', 200 * 1024)).status, 413);
    assert.equal((await post('/api/ai/chat', 50 * 1024)).status, 200);
  });
});
