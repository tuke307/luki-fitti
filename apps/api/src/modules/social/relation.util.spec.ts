import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { avatarUrlFor, cardFor, resolveRelation, type CardSource } from './relation.util';

const viewer = 'viewer';
const target = 'target';

describe('resolveRelation', () => {
  it('maps every fact combination to the right relation', () => {
    assert.equal(resolveRelation(viewer, viewer, { friendship: null, blocked: false }), 'SELF');
    assert.equal(resolveRelation(viewer, target, { friendship: null, blocked: false }), 'NONE');
    assert.equal(
      resolveRelation(viewer, target, {
        friendship: { status: 'ACCEPTED', requestedById: viewer },
        blocked: false,
      }),
      'FRIEND',
    );
    assert.equal(
      resolveRelation(viewer, target, {
        friendship: { status: 'PENDING', requestedById: target },
        blocked: false,
      }),
      'INCOMING',
    );
    assert.equal(
      resolveRelation(viewer, target, {
        friendship: { status: 'PENDING', requestedById: viewer },
        blocked: false,
      }),
      'OUTGOING',
    );
  });

  it('BLOCKED wins over every other state (deny by default)', () => {
    for (const friendship of [
      null,
      { status: 'ACCEPTED' as const, requestedById: viewer },
      { status: 'PENDING' as const, requestedById: target },
    ]) {
      assert.equal(resolveRelation(viewer, target, { friendship, blocked: true }), 'BLOCKED');
    }
  });
});

describe('cardFor visibility', () => {
  const user: CardSource = {
    id: target,
    handle: 'lukas',
    name: 'Lukas Private',
    avatarKey: 'avatars/x/1.jpg',
    avatarUpdatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  it('strangers never see the name, friends and self do', () => {
    assert.equal(cardFor(user, 'NONE').name, undefined);
    assert.equal(cardFor(user, 'INCOMING').name, undefined);
    assert.equal(cardFor(user, 'OUTGOING').name, undefined);
    assert.equal(cardFor(user, 'FRIEND').name, 'Lukas Private');
    assert.equal(cardFor(user, 'SELF').name, 'Lukas Private');
  });

  it('avatarUrl carries the updatedAt cache buster', () => {
    assert.match(avatarUrlFor(user) ?? '', /^\/social\/avatars\/target\?v=\d+$/);
    assert.equal(avatarUrlFor({ ...user, avatarKey: null }), null);
  });
});
