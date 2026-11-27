import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveProviderIds } from './provider-config';

describe('resolveProviderIds', () => {
  it('returns null ids when nothing is configured', () => {
    assert.deepEqual(resolveProviderIds({ appOrigin: 'https://app.example' }), {
      googleClientId: null,
      appleServicesId: null,
      appleRedirectUri: null,
    });
  });

  it('defaults the Apple redirect uri to <origin>/login only when Apple is configured', () => {
    const ids = resolveProviderIds({
      appleServicesId: 'com.example.services',
      appOrigin: 'https://app.example',
    });
    assert.equal(ids.appleRedirectUri, 'https://app.example/login');
  });

  it('keeps an explicit redirect uri and passes google through', () => {
    const ids = resolveProviderIds({
      googleClientId: 'g.apps.googleusercontent.com',
      appleServicesId: 'com.example.services',
      appleRedirectUri: 'https://custom.example/auth',
      appOrigin: 'https://app.example',
    });
    assert.deepEqual(ids, {
      googleClientId: 'g.apps.googleusercontent.com',
      appleServicesId: 'com.example.services',
      appleRedirectUri: 'https://custom.example/auth',
    });
  });
});
