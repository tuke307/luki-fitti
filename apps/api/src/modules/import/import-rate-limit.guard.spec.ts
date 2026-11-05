import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Reflector } from '@nestjs/core';
import { ThrottlerException, ThrottlerStorageService } from '@nestjs/throttler';
import type { ExecutionContext } from '@nestjs/common';
import { ImportRateLimitGuard, ImportRateLimited } from './import-rate-limit.guard';
import { ImportController } from './import.controller';

describe('ImportRateLimitGuard', () => {
  const storage = new ThrottlerStorageService();
  const guard = new ImportRateLimitGuard(new Reflector(), storage);
  after(() => storage.onApplicationShutdown());

  const context = (handler: object, userId: string) =>
    ({
      getHandler: () => handler,
      switchToHttp: () => ({ getRequest: () => ({ user: { id: userId } }) }),
    }) as unknown as ExecutionContext;

  it('limits each user separately', async () => {
    const handler = () => undefined;
    ImportRateLimited({ name: 'test', limit: 2 })(handler, 'h', { value: handler });
    assert.equal(await guard.canActivate(context(handler, 'a')), true);
    assert.equal(await guard.canActivate(context(handler, 'a')), true);
    await assert.rejects(guard.canActivate(context(handler, 'a')), ThrottlerException);
    assert.equal(await guard.canActivate(context(handler, 'b')), true);
  });

  it('applies 20 previews and 5 commits per hour', async () => {
    const reflector = new Reflector();
    const proto = ImportController.prototype;
    assert.deepEqual(reflector.get('importRateLimit', proto.preview), {
      name: 'import-preview',
      limit: 20,
    });
    assert.deepEqual(reflector.get('importRateLimit', proto.commit), {
      name: 'import-commit',
      limit: 5,
    });
  });
});
