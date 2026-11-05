import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ApiClientError } from '@/lib/api/client';
import { checkImportFile, importRequestError } from './import-file';

const example = readFileSync(
  new URL(
    '../../../../packages/common/src/utils/__fixtures__/import-file-example.json',
    import.meta.url,
  ),
  'utf8',
);

describe('checkImportFile', () => {
  it('accepts the shared example file', () => {
    assert.deepEqual(checkImportFile(example, example.length), { ok: true });
  });

  it('rejects files above 10 MB before parsing', () => {
    assert.deepEqual(checkImportFile('{', 10 * 1024 * 1024 + 1), {
      ok: false,
      error: 'tooLarge',
    });
  });

  it('reports invalid JSON', () => {
    assert.deepEqual(checkImportFile('{"format":', 10), { ok: false, error: 'invalidJson' });
  });

  it('lists schema issues', () => {
    const file = JSON.parse(example);
    file.sessions[0].exercises[0].sets[0].reps = -1;
    const check = checkImportFile(JSON.stringify(file), 100);
    assert.equal(check.ok, false);
    assert.ok(!check.ok && check.error === 'invalidFile');
    assert.equal(check.issues[0]!.path, 'sessions.0.exercises.0.sets.0.reps');
    assert.equal(check.issueCount, 1);
  });
});

describe('importRequestError', () => {
  it('maps API failures to user-facing states', () => {
    assert.equal(importRequestError(new ApiClientError('x', { status: 429 })), 'rateLimited');
    assert.equal(importRequestError(new ApiClientError('x', { status: 413 })), 'tooLarge');
    assert.equal(
      importRequestError(new ApiClientError('x', { isNetworkError: true })),
      'networkError',
    );
    assert.equal(importRequestError(new ApiClientError('x', { status: 500 })), 'genericError');
    assert.equal(importRequestError(new Error('x')), 'genericError');
  });
});
