import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Arena } from '../enums';
import type { SocialCardDto } from '../schemas/social.schemas';
import { pickNextMove, type NextMoveInput } from './next-move.util';

const card = (username: string): SocialCardDto => ({
  userId: `u-${username}`,
  username,
  avatarUrl: null,
});

const base = (): NextMoveInput => ({
  friendRequests: 0,
  duelInvites: [],
  streakInvites: [],
  squadInvites: [],
  friendsWeek: [],
  yourWorkouts: 0,
  activeDuels: [],
  demotionArena: null,
  raidBossSlug: null,
});

describe('pickNextMove', () => {
  it('returns null when nothing is actionable', () => {
    assert.equal(pickNextMove(base()), null);
  });

  it('friend requests beat every other kind and carry the count', () => {
    const input = base();
    input.friendRequests = 3;
    input.duelInvites = [{ duelId: 'd1', actor: card('x'), createdAt: '2026-01-01' }];
    input.raidBossSlug = 'boss';
    assert.deepEqual(pickNextMove(input), { kind: 'FRIEND_REQUESTS', count: 3 });
  });

  it('picks the oldest duel invite', () => {
    const input = base();
    input.duelInvites = [
      { duelId: 'new', actor: card('x'), createdAt: '2026-01-03T10:00:00Z' },
      { duelId: 'old', actor: card('y'), createdAt: '2026-01-01T10:00:00Z' },
    ];
    input.streakInvites = [{ streakId: 's1', actor: card('z'), createdAt: '2026-01-01' }];
    const move = pickNextMove(input);
    assert.equal(move?.kind, 'DUEL_INVITE');
    assert.equal(move.kind === 'DUEL_INVITE' && move.duelId, 'old');
  });

  it('streak invite beats squad invite and later kinds', () => {
    const input = base();
    input.streakInvites = [{ streakId: 's1', actor: card('z'), createdAt: '2026-01-02' }];
    input.squadInvites = [{ squadName: 'Crew', actor: card('x'), createdAt: '2026-01-01' }];
    input.friendsWeek = [{ card: card('f'), workouts: 9 }];
    assert.deepEqual(pickNextMove(input), {
      kind: 'STREAK_INVITE',
      streakId: 's1',
      actor: card('z'),
    });
  });

  it('squad invite carries the squad name', () => {
    const input = base();
    input.squadInvites = [{ squadName: 'Crew', actor: card('x'), createdAt: '2026-01-01' }];
    assert.deepEqual(pickNextMove(input), {
      kind: 'SQUAD_INVITE',
      squadName: 'Crew',
      actor: card('x'),
    });
  });

  it('friend ahead picks the highest count strictly above yours, ties by username', () => {
    const input = base();
    input.yourWorkouts = 2;
    input.friendsWeek = [
      { card: card('zoe'), workouts: 4 },
      { card: card('amy'), workouts: 4 },
      { card: card('bob'), workouts: 2 }, // tied with you — not ahead
    ];
    input.demotionArena = Arena.GOLD;
    const move = pickNextMove(input);
    assert.deepEqual(move, { kind: 'FRIEND_AHEAD', actor: card('amy'), them: 4, you: 2 });
  });

  it('duel behind picks the largest deficit', () => {
    const input = base();
    input.activeDuels = [
      { duelId: 'small', actor: card('a'), you: 2, them: 3, daysLeft: 2 },
      { duelId: 'big', actor: card('b'), you: 0, them: 5, daysLeft: 1 },
      { duelId: 'won', actor: card('c'), you: 4, them: 1, daysLeft: 1 },
    ];
    input.demotionArena = Arena.GOLD;
    const move = pickNextMove(input);
    assert.deepEqual(move, {
      kind: 'DUEL_BEHIND',
      duelId: 'big',
      actor: card('b'),
      you: 0,
      them: 5,
      daysLeft: 1,
    });
  });

  it('demotion zone beats only the raid', () => {
    const input = base();
    input.demotionArena = Arena.SILVER;
    input.raidBossSlug = 'mole';
    assert.deepEqual(pickNextMove(input), { kind: 'LEAGUE_DEMOTION', arena: Arena.SILVER });
  });

  it('raid with zero damage is the last resort', () => {
    const input = base();
    input.raidBossSlug = 'mole';
    assert.deepEqual(pickNextMove(input), { kind: 'RAID_NO_DAMAGE', bossSlug: 'mole' });
  });
});
