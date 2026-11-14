import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  UnauthorizedException,
  type ArgumentsHost,
} from '@nestjs/common';
import { PublicApiExceptionFilter } from './public-api.filter';

const host = (headers: Record<string, string> = {}) => {
  const captured: { status?: number; body?: unknown } = {};
  const h = {
    switchToHttp: () => ({
      getResponse: () => ({
        status: (s: number) => {
          captured.status = s;
          return { json: (b: unknown) => (captured.body = b) };
        },
        getHeader: (k: string) => headers[k],
      }),
    }),
  } as unknown as ArgumentsHost;
  return { h, captured };
};

const filter = new PublicApiExceptionFilter();

describe('PublicApiExceptionFilter', () => {
  it('maps 401 to invalid_api_key', () => {
    const { h, captured } = host();
    filter.catch(new UnauthorizedException('Invalid API key'), h);
    assert.equal(captured.status, 401);
    assert.deepEqual(captured.body, { error: 'invalid_api_key', message: 'Invalid API key' });
  });

  it('maps 400 to invalid_request with the thrown message', () => {
    const { h, captured } = host();
    filter.catch(new BadRequestException('Invalid cursor'), h);
    assert.deepEqual(captured.body, { error: 'invalid_request', message: 'Invalid cursor' });
  });

  it('maps insufficient-scope 403 with the required field', () => {
    const { h, captured } = host();
    filter.catch(
      new ForbiddenException({
        message: 'Missing required scope',
        code: 'insufficient_scope',
        required: 'export',
      }),
      h,
    );
    assert.deepEqual(captured.body, {
      error: 'insufficient_scope',
      message: 'Missing required scope',
      required: 'export',
    });
  });

  it('maps the kill-switch 403 to api_keys_disabled', () => {
    const { h, captured } = host();
    filter.catch(
      new ForbiddenException({ message: 'API keys are disabled', code: 'api_keys_disabled' }),
      h,
    );
    assert.deepEqual(captured.body, {
      error: 'api_keys_disabled',
      message: 'API keys are disabled',
    });
  });

  it('maps 404 to not_found', () => {
    const { h, captured } = host();
    filter.catch(new NotFoundException('Session not found'), h);
    assert.deepEqual(captured.body, { error: 'not_found', message: 'Session not found' });
  });

  it('maps 429 to rate_limited with retryAfterSeconds from the header', () => {
    const { h, captured } = host({ 'Retry-After': '30' });
    filter.catch(
      new HttpException(
        { message: 'Rate limit exceeded', code: 'rate_limited' },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
      h,
    );
    assert.deepEqual(captured.body, {
      error: 'rate_limited',
      message: 'Rate limit exceeded',
      retryAfterSeconds: 30,
    });
  });

  it('never leaks internals on unexpected errors', () => {
    const { h, captured } = host();
    filter.catch(new Error('prisma: relation "Secret" does not exist'), h);
    assert.equal(captured.status, 500);
    assert.deepEqual(captured.body, {
      error: 'internal_error',
      message: 'Internal server error',
    });
  });
});
