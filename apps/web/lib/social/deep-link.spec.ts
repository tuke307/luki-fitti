import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseOpenParam } from './deep-link';

describe('parseOpenParam', () => {
  it('returns null without an open param', () => {
    assert.equal(parseOpenParam(''), null);
    assert.equal(parseOpenParam('?foo=1'), null);
  });

  it('maps /social paths to the social tab', () => {
    assert.deepEqual(parseOpenParam('?open=%2Fsocial'), { tab: 'social', section: null });
    assert.deepEqual(parseOpenParam('?open=%2Fsocial%2Ffriends'), {
      tab: 'social',
      section: 'friends',
    });
    assert.deepEqual(parseOpenParam('?open=%2Fsocial%2Finbox'), {
      tab: 'social',
      section: 'inbox',
    });
  });

  it('falls back to home for unknown or unsafe values', () => {
    assert.deepEqual(parseOpenParam('?open=%2Fadmin'), { tab: 'home' });
    assert.deepEqual(parseOpenParam('?open=https%3A%2F%2Fevil.test'), { tab: 'home' });
    assert.deepEqual(parseOpenParam('?open=javascript:alert(1)'), { tab: 'home' });
    assert.deepEqual(parseOpenParam('?open=%2Fsocial%2Funknown'), {
      tab: 'social',
      section: null,
    });
  });
});
