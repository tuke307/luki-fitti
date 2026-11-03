import test from 'node:test';
import assert from 'node:assert/strict';

(process.env as Record<string, string | undefined>).NODE_ENV = 'production';
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
  const res = await proxy(req('luki-fitti.tony-luke.de', '/'));
  assert.deepEqual(decision(res), { kind: 'rewrite', dest: 'https://luki-fitti.tony-luke.de/site' });
});

test('site host: legal paths rewrite to /site/*', async () => {
  for (const [pub, internal] of [
    ['/impressum', '/site/de/impressum'],
    ['/en/imprint', '/site/en/impressum'],
    ['/en', '/site/en'],
  ] as const) {
    const res = await proxy(req('luki-fitti.tony-luke.de', pub));
    assert.equal(decision(res).dest, `https://luki-fitti.tony-luke.de${internal}`, pub);
  }
});

test('site host: app paths 308 to APP_ORIGIN', async () => {
  for (const path of ['/login', '/admin', '/workouts', '/site/en']) {
    const res = await proxy(req('luki-fitti.tony-luke.de', path));
    const d = decision(res);
    if (path === '/site/en') continue; // internal path passes through
    assert.equal(d.kind, 'redirect', path);
    assert.ok(d.dest?.startsWith('https://app.luki-fitti.tony-luke.de'), `${path}: ${d.dest}`);
  }
});

test('site host: /site/* internal paths pass through', async () => {
  const res = await proxy(req('luki-fitti.tony-luke.de', '/site/de/impressum'));
  assert.equal(decision(res).kind, 'next');
});

test('site host: static assets pass through', async () => {
  for (const path of ['/icon.svg', '/screens/en/01.png', '/_next/static/chunk.js', '/api/health']) {
    const res = await proxy(req('luki-fitti.tony-luke.de', path));
    assert.equal(decision(res).kind, 'next', path);
  }
});

test('app host: legal paths 308 to site host', async () => {
  for (const path of ['/impressum', '/en/terms']) {
    const res = await proxy(req('app.luki-fitti.tony-luke.de', path));
    const d = decision(res);
    assert.equal(d.kind, 'redirect', path);
    assert.equal(d.dest, `https://luki-fitti.tony-luke.de${path}`, path);
  }
});

test('app host: /site/* 308s to the site host', async () => {
  const res = await proxy(req('app.luki-fitti.tony-luke.de', '/site/en'));
  const d = decision(res);
  assert.equal(d.kind, 'redirect');
  assert.equal(d.dest, 'https://luki-fitti.tony-luke.de/en');
});

test('app host: app paths pass with noindex header', async () => {
  const res = await proxy(req('app.luki-fitti.tony-luke.de', '/workouts'));
  assert.equal(decision(res).kind, 'next');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex');
});

test('app host: /admin without session redirects to login', async () => {
  const res = await proxy(req('app.luki-fitti.tony-luke.de', '/admin'));
  const d = decision(res);
  assert.equal(d.kind, 'redirect');
  assert.match(d.dest ?? '', /\/login\?redirect=%2Fadmin/);
});

test('localhost dev: /site/* passes and ?site=1 rewrites', async () => {
  const direct = await proxy(req('localhost:3000', '/site/de'));
  assert.equal(decision(direct).kind, 'next');
  const preview = await proxy(req('localhost:3000', '/?site=1'));
  assert.equal(decision(preview).kind, 'rewrite');
  assert.match(decision(preview).dest ?? '', /\/site\/de$/);
});

test('dev: site.localhost host rewrites / to /site/de', async () => {
  const r = await proxy(req('site.localhost:3000', '/'));
  assert.ok(r.headers.get('x-middleware-rewrite')?.includes('/site/de'));
});

test('dev: app host rewrites /impressum to /site/de/impressum', async () => {
  const r = await proxy(req('localhost:3000', '/impressum'));
  assert.ok(r.headers.get('x-middleware-rewrite')?.includes('/site/de/impressum'));
});
