import type { SocialCardDto, SocialRelation } from '@luki-fitti/common/schemas';

export interface RelationFacts {
  /** Friendship row between the pair, if any (already normalised to a single row). */
  friendship: { status: 'PENDING' | 'ACCEPTED'; requestedById: string } | null;
  /** A UserBlock exists in either direction. */
  blocked: boolean;
}

/**
 * Deny-by-default relation resolution. BLOCKED wins over every other state so a
 * blocked pair can never surface each other, even if a stale friendship row remains.
 * Pure — unit-tested without a database.
 */
export function resolveRelation(
  viewerId: string,
  targetId: string,
  facts: RelationFacts,
): SocialRelation {
  if (viewerId === targetId) return 'SELF';
  if (facts.blocked) return 'BLOCKED';
  const f = facts.friendship;
  if (!f) return 'NONE';
  if (f.status === 'ACCEPTED') return 'FRIEND';
  return f.requestedById === targetId ? 'INCOMING' : 'OUTGOING';
}

export interface CardSource {
  id: string;
  handle: string | null;
  name: string | null;
  avatarKey: string | null;
  avatarUpdatedAt: Date | null;
}

/**
 * API-relative avatar URL with a cache-busting version. Returned to clients
 * only for users they may see (callers gate on the relation first).
 */
export function avatarUrlFor(user: Pick<CardSource, 'id' | 'avatarKey' | 'avatarUpdatedAt'>) {
  if (!user.avatarKey) return null;
  const v = user.avatarUpdatedAt ? user.avatarUpdatedAt.getTime() : 0;
  return `/social/avatars/${user.id}?v=${v}`;
}

/**
 * Card projection by relation: strangers get `{ userId, handle, avatarUrl }`,
 * friends and self additionally get `name`. Callers must not invoke this for
 * BLOCKED or for users without a handle.
 */
export function cardFor(user: CardSource, relation: SocialRelation): SocialCardDto {
  const card: SocialCardDto = {
    userId: user.id,
    handle: user.handle ?? '',
    avatarUrl: avatarUrlFor(user),
  };
  if (relation === 'FRIEND' || relation === 'SELF') card.name = user.name;
  return card;
}
