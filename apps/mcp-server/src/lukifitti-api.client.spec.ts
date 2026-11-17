import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { formatApiKey, generateApiKeySecret } from './test-keys';
import { McpAuthGuard } from './mcp-auth.guard';
import { LukiFittiApiClient } from './lukifitti-api.client';
import { SessionsTool } from './tools/sessions.tool';
import { ToolRateLimiter } from './tools/tool-utils';

const KEY_ID = 'abc234de';
const FULL_KEY = formatApiKey(KEY_ID, generateApiKeySecret());

const jsonRes = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null },
  }) as unknown as globalThis.Response;

/** Runs the guard once so the request carries the forwarded key + req.user. */
const authenticatedReq = async (scopes = ['mcp', 'read:sessions']): Promise<Request> => {
  const guard = new McpAuthGuard();
  guard.fetchImpl = async () => jsonRes(200, { id: KEY_ID, scopes, expiresAt: null });
  const request = {
    body: { method: 'tools/call' },
    headers: { authorization: `Bearer ${FULL_KEY}` },
    ip: '10.0.0.1',
  } as unknown as Request;
  const context = {
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({}) as Response }),
  } as unknown as ExecutionContext;
  assert.equal(await guard.canActivate(context), true);
  return request;
};

describe('LukiFittiApiClient.getAll', () => {
  it('reports truncated=false when the list is exhausted before the cap', async () => {
    const req = await authenticatedReq();
    const client = new LukiFittiApiClient();
    client.fetchImpl = async () => jsonRes(200, { data: [{ id: 'a' }], nextCursor: null });
    const { rows, truncated } = await client.getAll('/v1/sessions', {}, req, { maxRows: 5 });
    assert.equal(rows.length, 1);
    assert.equal(truncated, false);
  });

  it('reports truncated=true when a cursor is still pending at the cap', async () => {
    const req = await authenticatedReq();
    const client = new LukiFittiApiClient();
    client.fetchImpl = async () =>
      jsonRes(200, { data: [{ id: 'a' }, { id: 'b' }], nextCursor: 'next' });
    const { rows, truncated } = await client.getAll('/v1/sessions', {}, req, { maxRows: 3 });
    assert.equal(rows.length, 3);
    assert.equal(truncated, true);
  });

  it('sends the forwarded key and client IP', async () => {
    const req = await authenticatedReq();
    const client = new LukiFittiApiClient();
    let headers: Record<string, string> = {};
    client.fetchImpl = async (_url, init) => {
      headers = init?.headers as Record<string, string>;
      return jsonRes(200, { data: [], nextCursor: null });
    };
    await client.getAll('/v1/sessions', {}, req);
    assert.equal(headers['authorization'], `Bearer ${FULL_KEY}`);
    assert.equal(headers['x-forwarded-for'], '10.0.0.1');
  });
});

describe('truncation propagation', () => {
  const sessionRow = (n: number) => ({
    id: `s${n}`,
    status: 'COMPLETED',
    startedAt: '2026-11-10T10:00:00Z',
    workoutName: 'Push Day',
    activeDurationSeconds: 3600,
    totalVolumeKg: 1000,
    totalSetsCompleted: 12,
    exercises: [],
  });

  it('list-sessions flags a fetch that hit the row cap', async () => {
    const req = await authenticatedReq();
    const client = new LukiFittiApiClient();
    // Endless pages: the tool's 400-row cap (8 × 50) hits with a cursor pending.
    client.fetchImpl = async (url) => {
      const cursor = new URL(String(url)).searchParams.get('cursor');
      const page = Number(cursor ?? 0);
      return jsonRes(200, {
        data: Array.from({ length: 50 }, (_, i) => sessionRow(page * 50 + i)),
        nextCursor: String(page + 1),
      });
    };
    const tool = new SessionsTool(client, new ToolRateLimiter());
    const result = await tool.listSessions(
      { from: '2026-11-01', to: '2026-11-18', limit: 20 },
      req,
    );
    assert.equal(result.isError, undefined);
    const content = result.structuredContent as { truncated: boolean; hint?: string };
    assert.equal(content.truncated, true);
    assert.equal(content.hint, 'Narrow the date range');
    assert.match((result.content[0] as { text: string }).text, /truncated/);
  });
});
