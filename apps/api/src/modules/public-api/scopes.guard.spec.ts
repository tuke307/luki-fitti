import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyScope } from '@luki-fitti/common/enums';
import { ApiScope } from '@/decorators/api-scope.decorator';
import { ScopesGuard } from './scopes.guard';

const ctx = (handler: object, cls: object, scopes?: ApiKeyScope[]) =>
  ({
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({
      getRequest: () => ({ apiKey: scopes ? { id: 'k1', scopes } : undefined }),
    }),
  }) as unknown as ExecutionContext;

describe('ScopesGuard', () => {
  const guard = new ScopesGuard(new Reflector());

  class NoMetadata {}
  const withScope = (scope: ApiKeyScope) => {
    const handler = () => undefined;
    ApiScope(scope)(handler, 'h', { value: handler });
    return handler;
  };

  it('denies by default: a route without @ApiScope is unreachable', () => {
    assert.throws(
      () => guard.canActivate(ctx(() => undefined, NoMetadata, [ApiKeyScope.READ_WORKOUTS])),
      ForbiddenException,
    );
  });

  it('grants when the key carries the required scope', () => {
    const handler = withScope(ApiKeyScope.READ_WORKOUTS);
    assert.equal(guard.canActivate(ctx(handler, NoMetadata, [ApiKeyScope.READ_WORKOUTS])), true);
  });

  it('denies a missing scope with 403 + required', () => {
    const handler = withScope(ApiKeyScope.EXPORT);
    assert.throws(
      () => guard.canActivate(ctx(handler, NoMetadata, [ApiKeyScope.READ_WORKOUTS])),
      (e: unknown) => {
        assert.ok(e instanceof ForbiddenException);
        const body = (e as ForbiddenException).getResponse() as Record<string, unknown>;
        assert.equal(body.code, 'insufficient_scope');
        assert.equal(body.required, ApiKeyScope.EXPORT);
        return true;
      },
    );
  });

  it('honours class-level scope metadata', () => {
    class C {}
    ApiScope(ApiKeyScope.READ_BODY)(C);
    assert.equal(guard.canActivate(ctx(() => undefined, C, [ApiKeyScope.READ_BODY])), true);
  });
});
