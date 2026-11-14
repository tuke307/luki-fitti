import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const WEB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ROOT = path.resolve(WEB, '../..');
const PLANS_DIR = path.join(ROOT, 'docs/plans');
const PLAN_FILE = path.join(PLANS_DIR, 'spec-only-plan.md');

test('prepare-docs never stages docs/plans/** or the top-level plan files', () => {
  mkdirSync(PLANS_DIR, { recursive: true });
  writeFileSync(PLAN_FILE, '# Branch plan\n\nThis must stay unpublished.\n');
  try {
    execFileSync(process.execPath, [path.join(WEB, 'scripts/prepare-docs.mjs')], {
      cwd: WEB,
      stdio: 'pipe',
    });
    const contentDir = path.join(WEB, 'content');
    assert.equal(existsSync(path.join(contentDir, 'plans')), false);
    const staged = readdirSync(contentDir, { recursive: true })
      .map(String)
      .filter((f) => f.endsWith('.md'));
    assert.equal(
      staged.some((f) => f.includes('spec-only-plan')),
      false,
    );
    // The legacy plan files at docs/ top level are unpublished too.
    assert.equal(
      staged.some((f) => /social-2\.0|release-2\.0\.0|privacy-social/.test(f)),
      false,
    );
  } finally {
    rmSync(PLAN_FILE, { force: true });
    rmSync(PLANS_DIR, { recursive: true, force: true });
    execFileSync(process.execPath, [path.join(WEB, 'scripts/prepare-docs.mjs')], {
      cwd: WEB,
      stdio: 'pipe',
    });
  }
});
