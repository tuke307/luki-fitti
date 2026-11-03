import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFeatureRequestMailto, FEEDBACK_EMAIL } from './feature-request.util';

test('buildFeatureRequestMailto builds an encoded mailto link', () => {
  const url = buildFeatureRequestMailto({
    locale: 'en',
    appVersion: '1.0.0 (abc1234)',
    platform: 'Web',
    os: 'macOS 26.1',
  });
  assert.ok(url.startsWith(`mailto:${FEEDBACK_EMAIL}?`));
  assert.match(url, /subject=LukiFitti%20%E2%80%93%20Feature%20request/);
  assert.ok(!url.includes('+'), 'spaces must be %20, not +');
  assert.match(url, /What%20would%20you%20like%3F/);
  assert.match(url, /%0A/);
  assert.match(url, /App%3A%20LukiFitti%201\.0\.0%20\(abc1234\)%20\(Web\)/);
  assert.match(url, /System%3A%20macOS%2026\.1/);
});

test('buildFeatureRequestMailto uses the German template and encodes umlauts', () => {
  const url = buildFeatureRequestMailto({
    locale: 'de',
    appVersion: '1.0.0 (1)',
    platform: 'iOS',
  });
  assert.match(url, /subject=LukiFitti%20%E2%80%93%20Feature-Wunsch/);
  assert.match(url, /Was%20w%C3%BCnschst%20du%20dir%3F/);
  assert.match(url, /Wobei%20w%C3%BCrde%20dir%20das%20helfen%3F/);
  assert.ok(!url.includes('System%3A'), 'os omitted when not provided');
  assert.match(url, /\(iOS\)/);
});
