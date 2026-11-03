import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SITE_HOSTNAMES = 'site.example.com';
process.env.APP_ORIGIN = 'https://app.example.com';
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'test-secret';

const { proxy } = await import('../proxy');
const { NextRequest } = await import('next/server');

function req(host: string, path: string): InstanceType<typeof NextRequest> {
  return new NextRequest(`https://${host}${path}`, { headers: { host } });
}

/** x-middleware-* headers reveal what proxy() decided. */
function decision(res: { headers: Headers }): { kind: string; dest?: string } {
  const rewrite = res.headers.get('x-middleware-rewrite');
  if (rewrite) return { kind: 'rewrite', dest: rewrite };
  const redirect = res.headers.get('location');
  if (redirect) return { kind: 'redirect', dest: redirect };
  return { kind: 'next' };
}

test('site host: / rewrites to /site', async () => {
  const res = await proxy(req('site.example.com', '/'));
  assert.deepEqual(decision(res), { kind: 'rewrite', dest: 'https://site.example.com/site' });
});

test('site host: legal paths rewrite to /site/*', async () => {
  for (const [pub, internal] of [
    ['/impressum', '/site/impressum'],
    ['/en/imprint', '/site/en/imprint'],
    ['/en', '/site/en'],
  ] as const) {
    const res = await proxy(req('site.example.com', pub));
    assert.equal(decision(res).dest, `https://site.example.com${internal}`, pub);
  }
});

test('site host: app paths 308 to APP_ORIGIN', async () => {
  for (const path of ['/login', '/admin', '/workouts', '/site/en']) {
    const res = await proxy(req('site.example.com', path));
    const d = decision(res);
    if (path === '/site/en') continue; // internal path passes through
    assert.equal(d.kind, 'redirect', path);
    assert.ok(d.dest?.startsWith('https://app.example.com'), `${path}: ${d.dest}`);
  }
});

test('site host: /site/* internal paths pass through', async () => {
  const res = await proxy(req('site.example.com', '/site/impressum'));
  assert.equal(decision(res).kind, 'next');
});

test('site host: static assets pass through', async () => {
  for (const path of ['/icon.svg', '/screens/en/01.png', '/_next/static/chunk.js', '/api/health']) {
    const res = await proxy(req('site.example.com', path));
    assert.equal(decision(res).kind, 'next', path);
  }
});

test('app host: legal paths 308 to site host', async () => {
  for (const path of ['/impressum', '/en/terms']) {
    const res = await proxy(req('app.example.com', path));
    const d = decision(res);
    assert.equal(d.kind, 'redirect', path);
    assert.equal(d.dest, `https://site.example.com${path}`, path);
  }
});

test('app host: /site/* 308s to the site host', async () => {
  const res = await proxy(req('app.example.com', '/site/en'));
  const d = decision(res);
  assert.equal(d.kind, 'redirect');
  assert.equal(d.dest, 'https://site.example.com/en');
});

test('app host: app paths pass with noindex header', async () => {
  const res = await proxy(req('app.example.com', '/workouts'));
  assert.equal(decision(res).kind, 'next');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
});

test('app host: /admin without session redirects to login', async () => {
  const res = await proxy(req('app.example.com', '/admin'));
  const d = decision(res);
  assert.equal(d.kind, 'redirect');
  assert.match(d.dest ?? '', /\/login\?redirect=%2Fadmin/);
});

test('localhost dev: /site/* passes and ?site=1 rewrites', async () => {
  const direct = await proxy(req('localhost:3000', '/site'));
  assert.equal(decision(direct).kind, 'next');
  const preview = await proxy(req('localhost:3000', '/?site=1'));
  assert.equal(decision(preview).kind, 'rewrite');
  assert.match(decision(preview).dest ?? '', /\/site$/);
});
