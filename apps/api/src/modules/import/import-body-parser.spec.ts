import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { registerImportBodyParser } from './import-body-parser';

describe('registerImportBodyParser', () => {
  let server: Server;
  let base: string;

  before(async () => {
    const app = express();
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

  const post = (path: string, bytes: number) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: Array.from({ length: Math.ceil(bytes / 9) }, () => 'xxxxxx') }),
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
