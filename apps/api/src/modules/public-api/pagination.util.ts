import { BadRequestException } from '@nestjs/common';

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
