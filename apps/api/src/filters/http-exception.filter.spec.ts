import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ArgumentsHost } from '@nestjs/common';
import type { ApiResponse } from '@luki-fitti/common/api/responses/api.response';
import { HttpExceptionFilter } from './http-exception.filter';

function run(exception: unknown): { status: number; body: ApiResponse<null> } {
  const result = { status: 0, body: undefined as unknown as ApiResponse<null> };
  const response = {
    status(code: number) {
      result.status = code;
      return this;
    },
    json(payload: unknown) {
      result.body = payload as ApiResponse<null>;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'POST', url: '/api/test' }),
    }),
  } as unknown as ArgumentsHost;
  new HttpExceptionFilter().catch(exception, host);
  return result;
}

describe('HttpExceptionFilter', () => {
  it('maps http-errors-style client errors to their status and message', () => {
    const error = Object.assign(new Error('request entity too large'), {
      status: 413,
      statusCode: 413,
      expose: true,
      type: 'entity.too.large',
    });
    const res = run(error);
    assert.equal(res.status, 413);
    assert.equal(res.body.error, 'request entity too large');
  });

  it('maps a plain Error to 500 Internal Server Error', () => {
    const res = run(new Error('boom'));
    assert.equal(res.status, 500);
    assert.equal(res.body.error, 'Internal Server Error');
  });

  it('maps a non-exposed error with a 5xx status to 500', () => {
    const error = Object.assign(new Error('kaboom'), { status: 500, expose: false });
    const res = run(error);
    assert.equal(res.status, 500);
    assert.equal(res.body.error, 'Internal Server Error');
  });
});
