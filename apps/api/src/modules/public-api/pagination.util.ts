import { BadRequestException } from '@nestjs/common';
import type { PublicRangeQueryDto } from '@luki-fitti/common/schemas';

/**
 * Opaque cursor pagination for `/api/v1` lists. The cursor is base64url JSON
 * `{ u: updatedAt ISO, i: id }` over the sort key `updatedAt asc, id asc`
 * (`createdAt` for models without `updatedAt`). Stable under inserts because
 * the filter is `> (u, i)`, not an offset.
 */
export interface CursorPosition {
  u: string;
  i: string;
}

export function encodeCursor(position: CursorPosition): string {
  return Buffer.from(JSON.stringify(position), 'utf8').toString('base64url');
}

/** Throws 400 on malformed input — a bad cursor is a client error, never a fallback to page 1. */
export function decodeCursor(raw: string): CursorPosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Invalid cursor');
  }
  const cursor = parsed as Partial<CursorPosition>;
  if (
    typeof cursor?.u !== 'string' ||
    typeof cursor?.i !== 'string' ||
    Number.isNaN(Date.parse(cursor.u))
  ) {
    throw new BadRequestException('Invalid cursor');
  }
  return { u: cursor.u, i: cursor.i };
}

/** Prisma where fragment for "rows after the cursor" under (sortDate, id) ordering. */
export function cursorWhere(cursor: CursorPosition, dateField = 'updatedAt') {
  const u = new Date(cursor.u);
  return {
    OR: [{ [dateField]: { gt: u } }, { [dateField]: u, id: { gt: cursor.i } }],
  };
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const dayAfter = (isoDay: string): Date => {
  const d = new Date(`${isoDay}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
};

/**
 * `from`/`to` bounds for a timestamp column. A date-only value is a whole UTC
 * calendar day: `from` becomes `>= 00:00Z` of that day and `to` becomes
 * `< 00:00Z` of the next day (so `to=2026-11-14` includes the 14th).
 * Full datetimes stay exact (`from` >=, `to` <=).
 */
export function rangeBounds(query: Pick<PublicRangeQueryDto, 'from' | 'to'>): {
  gte?: Date;
  lt?: Date;
  lte?: Date;
} {
  const bounds: { gte?: Date; lt?: Date; lte?: Date } = {};
  if (query.from) bounds.gte = new Date(query.from);
  if (query.to) {
    if (DATE_ONLY.test(query.to)) {
      bounds.lt = dayAfter(query.to);
    } else {
      bounds.lte = new Date(query.to);
    }
  }
  return bounds;
}

/**
 * Same day semantics for `YYYY-MM-DD` string columns (e.g. `HealthDailyEnergy.day`):
 * `from` >= the from-day, `to` < the day after the to-day.
 */
export function rangeDayBounds(query: Pick<PublicRangeQueryDto, 'from' | 'to'>): {
  gte?: string;
  lt?: string;
} {
  const bounds: { gte?: string; lt?: string } = {};
  if (query.from) bounds.gte = new Date(query.from).toISOString().slice(0, 10);
  if (query.to) {
    bounds.lt = dayAfter(new Date(query.to).toISOString().slice(0, 10)).toISOString().slice(0, 10);
  }
  return bounds;
}

/**
 * Turns a `limit + 1` row window (ordered by sortDate asc, id asc) into a page:
 * the extra row only signals that another page exists.
 */
export function toPage<T extends { id: string }>(
  rows: T[],
  limit: number,
  sortDate: (row: T) => Date,
): Page<T> {
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    data: page,
    nextCursor:
      hasMore && last ? encodeCursor({ u: sortDate(last).toISOString(), i: last.id }) : null,
  };
}
