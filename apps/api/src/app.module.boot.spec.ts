import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Boots the full DI graph so that an `import type` on an injected
 * dependency (which erases the emitted `design:paramtypes` to `Function`)
 * fails here even though tsc is happy.
 *
 * tsx does not emit decorator metadata and mixing the compiled CJS output
 * with the ESM builds tsx resolves creates duplicate @nestjs/core class
 * identities, so the boot runs in a clean child node process against
 * dist/ — exactly the code and metadata production uses. The spec skips
 * when no build exists; Prisma connects resiliently and Redis lazily, so
 * no infrastructure is required when it does run.
 */
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distAppModule = path.join(apiRoot, 'dist/src/app.module.js');

const BOOT_SCRIPT = `
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('${distAppModule.replace(/\\/g, '\\\\')}');
NestFactory.createApplicationContext(AppModule, { logger: ['error'] })
  .then(async (app) => {
    const { SessionService } = require('${path.join(apiRoot, 'dist/src/modules/session/session.service.js').replace(/\\/g, '\\\\')}');
    const { PointsService } = require('${path.join(apiRoot, 'dist/src/modules/points/points.service.js').replace(/\\/g, '\\\\')}');
    const { LeagueService } = require('${path.join(apiRoot, 'dist/src/modules/league/league.service.js').replace(/\\/g, '\\\\')}');
    const session = app.get(SessionService);
    const points = app.get(PointsService);
    const league = app.get(LeagueService);
    const missing = [];
    if (!session.pointsService) missing.push('SessionService.pointsService');
    if (!points.duels) missing.push('PointsService.duels');
    if (!points.raids) missing.push('PointsService.raids');
    if (!league.streaks) missing.push('LeagueService.streaks');
    if (!league.raids) missing.push('LeagueService.raids');
    await app.close();
    if (missing.length) {
      console.error('UNRESOLVED ' + missing.join(','));
      process.exit(1);
    }
    console.log('BOOT_OK');
  })
  .catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
`;

describe('AppModule boot', () => {
  it(
    'resolves every provider including the cross-module battle hooks',
    { skip: !existsSync(distAppModule) && 'needs a compiled dist/ (run yarn build)' },
    () => {
      const out = execFileSync(process.execPath, ['-e', BOOT_SCRIPT], {
        cwd: apiRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
      });
      assert.match(out, /BOOT_OK/);
    },
  );
});
