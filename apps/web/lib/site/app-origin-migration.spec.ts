import test from 'node:test';
import assert from 'node:assert/strict';
import { migrateToAppOrigin, shouldMigrateToAppOrigin } from './app-origin-migration';

const HOSTS = ['luki-fitti.tony-luke.de'];

test('shouldMigrateToAppOrigin matches only the site hostnames', () => {
  assert.equal(shouldMigrateToAppOrigin('luki-fitti.tony-luke.de', HOSTS), true);
  assert.equal(shouldMigrateToAppOrigin('app.luki-fitti.tony-luke.de', HOSTS), false);
  assert.equal(shouldMigrateToAppOrigin('localhost', HOSTS), false);
});

test('migrateToAppOrigin flushes then navigates to the app origin', async () => {
  const calls: string[] = [];
  const ok = await migrateToAppOrigin({
    appOrigin: 'https://app.example.com',
    flush: async () => {
      calls.push('flush');
    },
    navigate: (url) => calls.push(`nav:${url}`),
    path: '/workouts?x=1',
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, ['flush', 'nav:https://app.example.com/workouts?x=1']);
});

test('migrateToAppOrigin still navigates when the flush times out', async () => {
  const calls: string[] = [];
  await migrateToAppOrigin({
    appOrigin: 'https://app.example.com',
    flush: () => new Promise(() => {}), // never resolves
    timeoutMs: 20,
    navigate: (url) => calls.push(`nav:${url}`),
    path: '/',
  });
  assert.deepEqual(calls, ['nav:https://app.example.com/']);
});

test('migrateToAppOrigin still navigates when the flush rejects', async () => {
  const calls: string[] = [];
  await migrateToAppOrigin({
    appOrigin: 'https://app.example.com',
    flush: () => Promise.reject(new Error('offline')),
    timeoutMs: 50,
    navigate: (url) => calls.push(`nav:${url}`),
    path: '/profile',
  });
  assert.deepEqual(calls, ['nav:https://app.example.com/profile']);
});
