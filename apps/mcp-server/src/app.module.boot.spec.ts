import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Boots the full DI graph so that an `import type` on an injected
 * dependency (which erases the emitted `design:paramtypes` to `Function`)
 * fails here even though tsc is happy.
 *
 * tsx does not emit decorator metadata and mixing the compiled output
 * with the ESM builds tsx resolves creates duplicate @nestjs/core class
 * identities, so the boot runs in a clean child node process against
 * dist/ — exactly the code and metadata production uses. The spec skips
 * when no build exists.
 */
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distAppModule = path.join(appRoot, 'dist/app.module.js');
const distUrl = pathToFileURL(distAppModule).href;

const BOOT_SCRIPT = `
Promise.all([import('@nestjs/core'), import('${distUrl}')])
  .then(async ([{ NestFactory }, { AppModule }]) => {
    const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error'] });
    await app.close();
    console.log('BOOT_OK');
  })
  .catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
`;

describe('AppModule boot', () => {
  it(
    'resolves every provider',
    { skip: !existsSync(distAppModule) && 'needs a compiled dist/ (run yarn build)' },
    () => {
      const out = execFileSync(process.execPath, ['-e', BOOT_SCRIPT], {
        cwd: appRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
      });
      assert.match(out, /BOOT_OK/);
    },
  );
});
