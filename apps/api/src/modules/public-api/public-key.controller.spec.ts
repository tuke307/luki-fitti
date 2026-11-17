import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiKeyScope } from '@luki-fitti/common/enums';
import type { AppSettingsService } from '../app-settings/app-settings.service';
import { PublicKeyController } from './public-key.controller';
import { ScopesGuard } from './scopes.guard';
import type { RequestApiKey } from './api-key.guard';

const settings = (mcpEnabled: boolean) =>
  ({ get: async () => ({ mcpEnabled }) }) as unknown as AppSettingsService;

const req = (apiKey?: Partial<RequestApiKey>) =>
  ({
    apiKey: { id: 'k1', scopes: [ApiKeyScope.MCP], expiresAt: null, ...apiKey },
  }) as Request & { apiKey?: RequestApiKey };

describe('GET /v1/key', () => {
  it('requires the mcp scope (403 insufficient_scope via ScopesGuard)', () => {
    const guard = new ScopesGuard(new Reflector());
    const ctx = {
      getHandler: () => PublicKeyController.prototype.getKey,
      getClass: () => PublicKeyController,
      switchToHttp: () => ({
        getRequest: () => ({ apiKey: { id: 'k1', scopes: [ApiKeyScope.READ_BODY] } }),
      }),
    } as unknown as ExecutionContext;
    assert.throws(
      () => guard.canActivate(ctx),
      (e: unknown) => {
        assert.ok(e instanceof ForbiddenException);
        const body = (e as ForbiddenException).getResponse() as Record<string, unknown>;
        assert.equal(body.code, 'insufficient_scope');
        assert.equal(body.required, ApiKeyScope.MCP);
        return true;
      },
    );
  });

  it('answers 403 mcp_disabled while the kill switch is off', async () => {
    const controller = new PublicKeyController(settings(false));
    await assert.rejects(controller.getKey(req()), (e: unknown) => {
      assert.ok(e instanceof ForbiddenException);
      const body = (e as ForbiddenException).getResponse() as Record<string, unknown>;
      assert.equal(body.code, 'mcp_disabled');
      assert.equal(body.message, 'AI assistant access is disabled');
      return true;
    });
  });

  it('returns id, scopes and expiry of the presented key', async () => {
    const controller = new PublicKeyController(settings(true));
    const dto = await controller.getKey(
      req({ id: 'abc234de', scopes: [ApiKeyScope.MCP, ApiKeyScope.READ_BODY], expiresAt: null }),
    );
    assert.deepEqual(dto, { id: 'abc234de', scopes: ['mcp', 'read:body'], expiresAt: null });

    const withExpiry = await controller.getKey(req({ expiresAt: '2027-01-01T00:00:00.000Z' }));
    assert.equal(withExpiry.expiresAt, '2027-01-01T00:00:00.000Z');
  });
});
