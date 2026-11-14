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

test('githubDatesFor maps repo paths to last commit dates and never throws', async () => {
  const { githubDatesFor } = await import('./github-dates.mjs');
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const repoPath = decodeURIComponent(new URL(url).searchParams.get('path'));
    if (repoPath === 'docs/missing.md') return { ok: true, json: async () => [] };
    if (repoPath === 'docs/broken.md') return { ok: false, status: 404 };
    return {
      ok: true,
      json: async () => [{ commit: { committer: { date: '2026-11-14T10:00:00Z' } } }],
    };
  };
  const dates = await githubDatesFor(
    ['README.md', 'docs/missing.md', 'docs/broken.md', 'docs/guide.md'],
    { fetchImpl, token: 'test-token' },
  );
  assert.equal(dates.get('README.md'), '2026-11-14T10:00:00Z');
  assert.equal(dates.get('docs/guide.md'), '2026-11-14T10:00:00Z');
  assert.equal(dates.get('docs/missing.md'), null);
  assert.equal(dates.get('docs/broken.md'), null);
  // The token only travels in the Authorization header, per request.
  assert.equal(calls.length, 4);
  for (const { init } of calls) {
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    assert.equal(init.headers.Accept, 'application/vnd.github+json');
  }
  // A throwing fetch resolves to null dates rather than failing the build.
  const dead = await githubDatesFor(['README.md'], {
    fetchImpl: async () => {
      throw new Error('offline');
    },
  });
  assert.equal(dead.get('README.md'), null);
});
