import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { BadRequestException } from '@nestjs/common';
import { cursorWhere, decodeCursor, encodeCursor, toPage } from './pagination.util';

describe('cursor encode/decode', () => {
  it('round-trips { u, i }', () => {
    const pos = { u: '2026-01-02T03:04:05.000Z', i: 'abc123' };
    const encoded = encodeCursor(pos);
    assert.match(encoded, /^[A-Za-z0-9_-]+$/); // base64url, URL-safe
    assert.deepEqual(decodeCursor(encoded), pos);
  });

  it('rejects malformed cursors with 400', () => {
    assert.throws(() => decodeCursor('not-base64!!!'), BadRequestException);
    assert.throws(() => decodeCursor(Buffer.from('{}').toString('base64url')), BadRequestException);
    assert.throws(
      () => decodeCursor(Buffer.from('{"u":"nope","i":"x"}').toString('base64url')),
      BadRequestException,
    );
    assert.throws(() => decodeCursor(''), BadRequestException);
  });
});

describe('cursorWhere', () => {
  it('builds the (updatedAt, id) > position filter', () => {
    const where = cursorWhere({ u: '2026-01-02T03:04:05.000Z', i: 'abc' }) as {
      OR: [Record<string, unknown>, Record<string, unknown>];
    };
    const [newer, sameTs] = where.OR;
    assert.deepEqual(newer, { updatedAt: { gt: new Date('2026-01-02T03:04:05.000Z') } });
    assert.deepEqual(sameTs, {
      updatedAt: new Date('2026-01-02T03:04:05.000Z'),
      id: { gt: 'abc' },
    });
  });
});

describe('toPage', () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      id: `id-${i}`,
      updatedAt: new Date(1_700_000_000_000 + i * 1000),
    }));

  it('returns nextCursor only when the extra row exists', () => {
    const page1 = toPage(rows(51), 50, (r) => r.updatedAt);
    assert.equal(page1.data.length, 50);
    assert.ok(page1.nextCursor);
    assert.deepEqual(decodeCursor(page1.nextCursor!), {
      u: rows(51)[49]!.updatedAt.toISOString(),
      i: 'id-49',
    });

    const page2 = toPage(rows(50), 50, (r) => r.updatedAt);
    assert.equal(page2.data.length, 50);
    assert.equal(page2.nextCursor, null);
  });

  it('handles empty and short pages', () => {
    assert.deepEqual(
      toPage([], 50, (r: { updatedAt: Date }) => r.updatedAt),
      {
        data: [],
        nextCursor: null,
      },
    );
    const page = toPage(rows(3), 50, (r) => r.updatedAt);
    assert.equal(page.data.length, 3);
    assert.equal(page.nextCursor, null);
  });
});
