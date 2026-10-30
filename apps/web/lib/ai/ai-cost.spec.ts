import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatCount, formatUsd } from './ai-cost';

describe('formatUsd', () => {
  it('keeps up to four fraction digits of the reported value', () => {
    assert.equal(formatUsd(0.0041, 'en-US'), '$0.0041');
    assert.equal(formatUsd(1.5, 'en-US'), '$1.50');
    assert.equal(formatUsd(0, 'en-US'), '$0.00');
  });

  it('marks tiny non-zero costs instead of rounding them to zero', () => {
    assert.equal(formatUsd(0.00002, 'en-US'), '< $0.0001');
  });

  it('formats for the locale', () => {
    assert.match(formatUsd(0.0041, 'de-DE'), /^0,0041\s\$$/);
    assert.equal(formatCount(3120, 'en-US'), '3,120');
  });
});
