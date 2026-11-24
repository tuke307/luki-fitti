import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClientError } from '@/lib/api/client';
import { apiErrorMessage } from './error-message';
import { en } from '@/lib/i18n/locales/en';

const e = en.errors;

describe('apiErrorMessage', () => {
  it('maps network errors', () => {
    assert.equal(
      apiErrorMessage(new ApiClientError('socket closed', { isNetworkError: true }), e),
      e.network,
    );
  });

  it('maps known error codes', () => {
    assert.equal(
      apiErrorMessage(
        new ApiClientError('taken', { status: 409, code: 'EMAIL_ALREADY_EXISTS' }),
        e,
      ),
      e.codes.EMAIL_ALREADY_EXISTS,
    );
    assert.equal(
      apiErrorMessage(new ApiClientError('nope', { status: 401, code: 'INVALID_CREDENTIALS' }), e),
      e.codes.INVALID_CREDENTIALS,
    );
    assert.equal(
      apiErrorMessage(new ApiClientError('locked', { status: 403, code: 'ACCOUNT_LOCKED' }), e),
      e.codes.ACCOUNT_LOCKED,
    );
    assert.equal(
      apiErrorMessage(
        new ApiClientError('unverified', { status: 403, code: 'EMAIL_NOT_VERIFIED' }),
        e,
      ),
      e.codes.EMAIL_NOT_VERIFIED,
    );
  });

  it('maps status 429 to rate-limited copy', () => {
    assert.equal(apiErrorMessage(new ApiClientError('x', { status: 429 }), e), e.rateLimited);
  });

  it('maps 5xx to server copy', () => {
    assert.equal(apiErrorMessage(new ApiClientError('', { status: 500 }), e), e.server);
    assert.equal(apiErrorMessage(new ApiClientError('oops', { status: 503 }), e), e.server);
  });

  it('passes through a short plain server message', () => {
    assert.equal(
      apiErrorMessage(new ApiClientError('Email already taken', { status: 400 }), e),
      'Email already taken',
    );
  });

  it('falls back to generic for unsafe messages', () => {
    assert.equal(apiErrorMessage(new ApiClientError('', { status: 400 }), e), e.generic);
    assert.equal(
      apiErrorMessage(new ApiClientError('{"error":"x"}', { status: 400 }), e),
      e.generic,
    );
    assert.equal(
      apiErrorMessage(new ApiClientError('<html>nope</html>', { status: 400 }), e),
      e.generic,
    );
    assert.equal(
      apiErrorMessage(new ApiClientError('Request failed (400)', { status: 400 }), e),
      e.generic,
    );
    assert.equal(
      apiErrorMessage(new ApiClientError('x'.repeat(201), { status: 400 }), e),
      e.generic,
    );
  });

  it('falls back to generic for non-API errors', () => {
    assert.equal(apiErrorMessage(new Error('boom'), e), e.generic);
    assert.equal(apiErrorMessage('boom', e), e.generic);
  });
});
