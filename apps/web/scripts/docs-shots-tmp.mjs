import { chromium } from '@playwright/test';
const base = 'http://docs.localhost:3000';
const b = await chromium.launch();
for (const [name, path, w] of [
  ['guide', '/import-format', 1440],
  ['api-ref', '/api-reference/v1/sessions/get', 1440],
  ['project', '/specs/api-keys', 1440],
  ['home', '/', 1440],
  ['public-api', '/public-api', 1440],
  ['guide', '/import-format', 390],
  ['home', '/', 390],
]) {
  const p = await b.newPage({ viewport: { width: w, height: w > 500 ? 900 : 844 }, colorScheme: 'dark' });
  await p.goto(base + path, { waitUntil: 'networkidle', timeout: 60000 });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `/tmp/docs-shots/${name}-${w === 1440 ? 'd' : 'm'}.png` });
  await p.close();
}
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
await p.goto(base + '/import-format', { waitUntil: 'networkidle', timeout: 60000 });
await p.keyboard.press('Meta+k'); await p.waitForTimeout(700);
await p.keyboard.type('import', { delay: 25 }); await p.waitForTimeout(700);
await p.screenshot({ path: '/tmp/docs-shots/search-d.png' }); await p.close();
await b.close(); console.log('done');
