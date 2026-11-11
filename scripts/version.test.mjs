import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('./version.mjs', import.meta.url));
const REPO = join(SCRIPT, '..', '..');
const FIXTURE_VERSION = '4.5.6';

// A throwaway repo copy that only contains the files version.mjs touches.
function fakeRepo(t) {
  const dir = mkdtempSync(join(tmpdir(), 'luki-version-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files = [
    'package.json',
    'apps/api/package.json',
    'apps/apple/package.json',
    'apps/email-worker/package.json',
    'apps/web/package.json',
    'packages/common/package.json',
    'packages/database/package.json',
    'packages/eslint-config/package.json',
    'packages/logger/package.json',
    'packages/typescript-config/package.json',
    'packages/ui/package.json',
    'apps/apple/project.yml',
    'apps/apple/Packages/LukiFittiKit/Sources/LukiFittiModels/LukiFittiKitVersion.swift',
  ];
  for (const f of files) {
    const dest = join(dir, f);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(REPO, f), dest);
  }
  // Pin a known version so the tests don't depend on the repo's current one.
  run(dir, ['set', FIXTURE_VERSION]);
  return dir;
}

const run = (dir, args, opts = {}) =>
  execFileSync('node', [SCRIPT, ...args], {
    env: { ...process.env, LUKI_VERSION_ROOT: dir },
    encoding: 'utf8',
    ...opts,
  });

describe('version.mjs', () => {
  it('get prints the root package.json version', (t) => {
    const dir = fakeRepo(t);
    assert.equal(run(dir, ['get']).trim(), FIXTURE_VERSION);
  });

  it('check passes when all locations agree', (t) => {
    const dir = fakeRepo(t);
    assert.match(run(dir, ['check']), /version 4\.5\.6/);
  });

  it('set writes all locations and check stays green', (t) => {
    const dir = fakeRepo(t);
    const out = run(dir, ['set', '1.2.3']);
    assert.match(out, /version 1\.2\.3/);
    assert.equal(run(dir, ['get']).trim(), '1.2.3');
    assert.match(run(dir, ['check']), /version 1\.2\.3/);
    assert.match(
      readFileSync(join(dir, 'apps/apple/project.yml'), 'utf8'),
      /MARKETING_VERSION: "1\.2\.3"/,
    );
    assert.match(
      readFileSync(
        join(
          dir,
          'apps/apple/Packages/LukiFittiKit/Sources/LukiFittiModels/LukiFittiKitVersion.swift',
        ),
        'utf8',
      ),
      /current = "1\.2\.3"/,
    );
    // JSON stays valid and formatted
    assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version, '1.2.3');
    // second run is a no-op
    assert.match(run(dir, ['set', '1.2.3']), /nothing changed/);
  });

  it('check fails on a mismatch', (t) => {
    const dir = fakeRepo(t);
    writeFileSync(
      join(dir, 'apps/web/package.json'),
      readFileSync(join(dir, 'apps/web/package.json'), 'utf8').replace(
        `"version": "${FIXTURE_VERSION}"`,
        '"version": "9.9.9"',
      ),
    );
    assert.throws(() => run(dir, ['check'], { stdio: 'pipe' }), /non-zero|Command failed/);
  });

  it('set rejects non-semver input', (t) => {
    const dir = fakeRepo(t);
    assert.throws(() => run(dir, ['set', '1.0'], { stdio: 'pipe' }), /Command failed/);
  });
});
