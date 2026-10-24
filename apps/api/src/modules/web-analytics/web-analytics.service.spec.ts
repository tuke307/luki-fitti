import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnalyticsCollectSchema } from '@luki-fitti/common/schemas';
import {
  WebAnalyticsService,
  firstLanguageTag,
  normalizeHostname,
  type PageviewRequestContext,
} from './web-analytics.service';

function createService(enabled = true): WebAnalyticsService {
  const service = new WebAnalyticsService();
  service.config = {
    enabled,
    umamiUrl: 'https://umami.example.test',
    websiteId: 'FAKE-WEBSITE-ID-FOR-TESTING',
    allowedHostnames: ['app.example.test'],
    timeoutMs: 3000,
  };
  return service;
}

const context: PageviewRequestContext = {
  hostname: 'app.example.test',
  clientIp: '203.0.113.7',
  userAgent: 'Mozilla/5.0 (FakeAgent)',
  acceptLanguage: 'de-DE,de;q=0.9,en;q=0.8',
  fetchSite: 'same-origin',
};

describe('AnalyticsCollectSchema', () => {
  it('strips query strings and fragments from url and referrer', () => {
    const parsed = AnalyticsCollectSchema.parse({
      type: 'pageview',
      url: '/reset-password?token=FAKE-TOKEN#x',
      referrer: 'https://other.example/page?q=1',
    });
    assert.equal(parsed.url, '/reset-password');
    assert.equal(parsed.referrer, 'https://other.example/page');
  });

  it('rejects non-path urls, protocol-relative urls, unknown keys and oversized input', () => {
    const invalid = [
      { type: 'pageview', url: 'https://evil.example/' },
      { type: 'pageview', url: '//evil.example/' },
      { type: 'event', url: '/' },
      { type: 'pageview', url: '/', screen: '1920x1080' },
      { type: 'pageview', url: `/${'a'.repeat(500)}` },
    ];
    for (const body of invalid) {
      assert.equal(AnalyticsCollectSchema.safeParse(body).success, false, JSON.stringify(body));
    }
  });
});

describe('WebAnalyticsService', () => {
  it('builds an Umami send request with visitor UA, client IP header and first language tag', () => {
    const request = createService().buildUmamiRequest(
      { type: 'pageview', url: '/', referrer: 'https://search.example/' },
      context,
    );
    assert.ok(request);
    assert.equal(request.url, 'https://umami.example.test/api/send');
    const headers = request.init.headers as Record<string, string>;
    assert.equal(headers['User-Agent'], 'Mozilla/5.0 (FakeAgent)');
    assert.equal(headers['x-umami-client-ip'], '203.0.113.7');
    assert.deepEqual(JSON.parse(String(request.init.body)), {
      type: 'event',
      payload: {
        website: 'FAKE-WEBSITE-ID-FOR-TESTING',
        hostname: 'app.example.test',
        url: '/',
        referrer: 'https://search.example/',
        language: 'de-DE',
      },
    });
  });

  it('drops pageviews when disabled, for foreign hosts, cross-site requests or missing UA', () => {
    const pageview = { type: 'pageview' as const, url: '/' };
    assert.equal(createService(false).buildUmamiRequest(pageview, context), null);
    const service = createService();
    assert.equal(service.buildUmamiRequest(pageview, { ...context, hostname: 'evil.test' }), null);
    assert.equal(service.buildUmamiRequest(pageview, { ...context, fetchSite: 'cross-site' }), null);
    assert.equal(service.buildUmamiRequest(pageview, { ...context, userAgent: undefined }), null);
  });

  it('swallows fetch errors', async () => {
    const service = createService();
    service.fetchImpl = async () => {
      throw new Error('network down');
    };
    await assert.doesNotReject(service.forwardPageview({ type: 'pageview', url: '/' }, context));
  });

  it('normalizes hostnames and language tags', () => {
    assert.equal(normalizeHostname('App.Example.Test:443, proxy.internal'), 'app.example.test');
    assert.equal(normalizeHostname('bad host/'), undefined);
    assert.equal(firstLanguageTag('en-US;q=1'), 'en-US');
    assert.equal(firstLanguageTag('<script>'), undefined);
  });
});
