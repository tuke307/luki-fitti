import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { shotInfo } from './screens.js';

describe('shotInfo', () => {
  it('returns null when the file is missing in both locales', () => {
    assert.equal(shotInfo('en', 'does-not-exist.png'), null);
  });

  it('reads the PNG dimensions from the IHDR', () => {
    const info = shotInfo('en', '01-active-workout.png');
    assert.ok(info);
    assert.ok(info.src.startsWith('/screens/'));
    assert.ok(info.width > 0 && info.height > 0);
  });
});
