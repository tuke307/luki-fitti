import test from 'node:test';
import assert from 'node:assert/strict';

// Host constants are fixed at import time, so dev routing lives in its own (separately run) file.
(process.env as Record<string, string | undefined>).NODE_ENV = 'development';

const { proxy } = await import('../proxy');
const { NextRequest } = await import('next/server');

function req(host: string, path: string): InstanceType<typeof NextRequest> {
  return new NextRequest(`http://${host}${path}`, { headers: { host } });
}

test('dev: site.localhost host rewrites / to /site/de', async () => {
  const r = await proxy(req('site.localhost:3000', '/'));
  assert.equal(r.headers.get('x-middleware-rewrite'), 'http://site.localhost:3000/site/de');
});

test('dev: app host rewrites /impressum to /site/de/impressum', async () => {
  const r = await proxy(req('localhost:3000', '/impressum'));
  assert.equal(r.headers.get('x-middleware-rewrite'), 'http://localhost:3000/site/de/impressum');
});

test('dev: site.localhost app paths redirect (307) to the local app origin', async () => {
  const r = await proxy(req('site.localhost:3000', '/workouts'));
  assert.equal(r.status, 307);
  assert.equal(r.headers.get('location'), 'http://localhost:3000/workouts');
});
