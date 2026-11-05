import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import cookieParser from 'cookie-parser';
import { registerImportBodyParser } from './import-body-parser';

describe('registerImportBodyParser', () => {
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
    registerImportBodyParser(app);
    // Mirrors Nest's global parser (default 100 kB limit), registered after main.ts middleware.
    app.use(express.json());
    app.post(/.*/, (req, res) => {
      res.json({ items: (req.body as { items: unknown[] }).items.length });
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
      body: JSON.stringify({ items: Array.from({ length: Math.ceil(bytes / 9) }, () => 'xxxxxx') }),
    });

  it('answers 401 without reading the body when no session credential is sent', async () => {
    const anonymous: Array<Record<string, string>> = [
      {},
      { Authorization: 'Basic abc' },
      { Cookie: 'csrfToken=x' },
    ];
    for (const auth of anonymous) {
      const res = await post('/api/import/commit', 64 * 1024, auth);
      assert.equal(res.status, 401);
      const body = (await res.json()) as Record<string, unknown>;
      assert.equal(body.success, false);
      assert.equal(body.error, 'Access token missing');
      assert.deepEqual(Object.keys(body.details as object), ['statusCode', 'timestamp']);
      assert.equal(bodyRead, false, JSON.stringify(auth));
    }
  });

  it('parses the body when a bearer token or access-token cookie is present', async () => {
    const signedIn: Array<Record<string, string>> = [
      { Authorization: 'Bearer abc' },
      { Cookie: 'accessToken=abc' },
    ];
    for (const auth of signedIn) {
      const res = await post('/api/import/preview', 1024, auth);
      assert.equal(res.status, 200, JSON.stringify(auth));
      assert.equal(bodyRead, true);
    }
  });

  it('answers 413 for a declared size above 10 MB without reading the body', async () => {
    const { request } = await import('node:http');
    const status = await new Promise<number>((resolve) => {
      const req = request(`${base}/api/import/commit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(10 * 1024 * 1024 + 1),
          Authorization: 'Bearer abc',
        },
      });
      req.on('response', (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
        req.destroy();
      });
      req.on('error', () => undefined); // destroying the request after the answer is expected
      req.write('{"items":[');
    });
    assert.equal(status, 413);
    assert.equal(bodyRead, false);
  });

  it('accepts up to 10 MB on the import routes', async () => {
    for (const path of ['/api/import/preview', '/api/import/commit']) {
      const res = await post(path, 2 * 1024 * 1024);
      assert.equal(res.status, 200, path);
    }
  });

  it('keeps the global limit on every other route', async () => {
    assert.equal((await post('/api/sessions/sync', 2 * 1024 * 1024)).status, 413);
    assert.equal((await post('/api/sessions/sync', 50 * 1024)).status, 200);
  });

  it('rejects import bodies above 10 MB', async () => {
    assert.equal((await post('/api/import/commit', 11 * 1024 * 1024)).status, 413);
  });

  it('does not reuse the name Nest checks before mounting its own parser', () => {
    const app = express();
    registerImportBodyParser(app);
    const names = (app.router.stack as Array<{ handle: { name: string } }>).map(
      (l) => l.handle.name,
    );
    assert.ok(names.includes('importJsonParser'));
    assert.ok(!names.includes('jsonParser'));
  });
});
