import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { generateApiKeySecret, formatApiKey } from './test-keys';

const KEY_ID = 'abc234de';
const FULL_KEY = formatApiKey(KEY_ID, generateApiKeySecret());

interface ApiHit {
  path: string;
  authorization: string | null;
  xForwardedFor: string | null;
}

interface JsonRpcResponse {
  result?: {
    tools?: Array<{ name: string }>;
    isError?: boolean;
    content?: unknown;
    structuredContent?: unknown;
  };
  error?: unknown;
}

/**
 * End-to-end over real HTTP: a stub `/api/v1` (plain node http) plus the Nest
 * app on an ephemeral port, driven by raw JSON-RPC POSTs — no MCP client
 * package needed. `API_BASE_URL` must be set before `app.module` is imported
 * (config reads env at module load), so the module is imported lazily.
 */
describe('MCP server end-to-end', () => {
  const hits: ApiHit[] = [];
  let apiStub: http.Server;
  let app: { close: () => Promise<void> };
  let mcpUrl = '';

  const rpc = async (
    method: string,
    params?: unknown,
    key?: string,
  ): Promise<{ status: number; body: JsonRpcResponse }> => {
    const res = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(key ? { authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const text = await res.text();
    let body: JsonRpcResponse;
    try {
      body = JSON.parse(text) as JsonRpcResponse;
    } catch {
      body = {};
    }
    return { status: res.status, body };
  };

  before(async () => {
    apiStub = http.createServer((req, res) => {
      hits.push({
        path: req.url ?? '',
        authorization: req.headers.authorization ?? null,
        xForwardedFor: (req.headers['x-forwarded-for'] as string) ?? null,
      });
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (req.url?.startsWith('/api/v1/key')) {
        if (req.headers.authorization !== `Bearer ${FULL_KEY}`) {
          return send(401, { error: 'invalid_api_key', message: 'Invalid API key' });
        }
        return send(200, { id: KEY_ID, scopes: ['mcp', 'read:body'], expiresAt: null });
      }
      if (req.url?.startsWith('/api/v1/body-weight')) {
        return send(200, {
          data: [
            {
              id: 'b1',
              measuredAt: '2026-11-10T07:00:00Z',
              weightKg: 80,
              source: 'MANUAL',
              note: null,
              createdAt: '2026-11-10T07:00:00Z',
              updatedAt: '2026-11-10T07:00:00Z',
            },
          ],
          nextCursor: null,
        });
      }
      send(404, { error: 'not_found', message: 'Not found' });
    });
    await new Promise<void>((resolve) => apiStub.listen(0, '127.0.0.1', resolve));
    const apiPort = (apiStub.address() as AddressInfo).port;

    process.env.API_BASE_URL = `http://127.0.0.1:${apiPort}/api`;
    const { AppModule, mcp } = await import('./app.module');
    const { NestFactory } = await import('@nestjs/core');
    const nest = await NestFactory.create<NestExpressApplication>(AppModule, {
      logger: false,
    });
    nest.set('trust proxy', 1);
    mcp.setHttpAdapter(nest.getHttpAdapter());
    nest.connectMicroservice({ strategy: mcp });
    await nest.startAllMicroservices();
    await nest.listen(0, '127.0.0.1');
    const mcpPort = (nest.getHttpServer().address() as AddressInfo).port;
    mcpUrl = `http://127.0.0.1:${mcpPort}/mcp`;
    app = nest;
  });

  after(async () => {
    await app?.close();
    await new Promise<void>((resolve) => apiStub.close(() => resolve()));
  });

  it('answers the public handshake without a key', async () => {
    const { status, body } = await rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'spec', version: '0' },
    });
    assert.equal(status, 200);
    assert.ok(body.result, JSON.stringify(body));
  });

  it('rejects tools/list without a key', async () => {
    const { status } = await rpc('tools/list');
    assert.equal(status, 401);
  });

  it('filters tools/list by the key scopes', async () => {
    const { status, body } = await rpc('tools/list', {}, FULL_KEY);
    assert.equal(status, 200);
    const names = (body.result?.tools ?? []).map((t: { name: string }) => t.name).sort();
    // The key only has mcp + read:body → exactly body-weight-trend.
    assert.deepEqual(names, ['body-weight-trend']);
  });

  it('denies tools/call for a tool outside the key scopes', async () => {
    const { status, body } = await rpc(
      'tools/call',
      { name: 'list-sessions', arguments: {} },
      FULL_KEY,
    );
    const denied = status >= 400 || body.error !== undefined || body.result?.isError === true;
    assert.ok(denied, JSON.stringify(body));
  });

  it('forwards Authorization and X-Forwarded-For to the API on a tool call', async () => {
    hits.length = 0;
    const { status, body } = await rpc(
      'tools/call',
      { name: 'body-weight-trend', arguments: { from: '2026-11-01', to: '2026-11-18' } },
      FULL_KEY,
    );
    assert.equal(status, 200, JSON.stringify(body));
    assert.ok(body.result?.structuredContent ?? body.result?.content, JSON.stringify(body));
    const bw = hits.find((h) => h.path.startsWith('/api/v1/body-weight'));
    assert.ok(bw, 'expected a forwarded /v1/body-weight call');
    assert.equal(bw.authorization, `Bearer ${FULL_KEY}`);
    assert.ok(bw.xForwardedFor && bw.xForwardedFor.length > 0);
  });
});
