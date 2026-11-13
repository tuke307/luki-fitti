import type { SocialCardDto, SocialRelation } from '@luki-fitti/common/schemas';
import type { PrismaService } from '../database/prisma.service';
import { cardFor, resolveRelation, type CardSource } from '../social/relation.util';

const pairKey = (a: string, b: string) => (a < b ? ([a, b] as const) : ([b, a] as const));

/**
 * The pair's relation under the PR 1 deny-by-default rules, computed without
 * pulling in the whole SocialService (keeps the email-worker wiring light).
 */
export async function relationBetween(
  prisma: Pick<PrismaService, 'friendship' | 'userBlock'>,
  viewerId: string,
  targetId: string,
): Promise<SocialRelation> {
  const [a, b] = pairKey(viewerId, targetId);
  const [friendship, blocks] = await Promise.all([
    prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      select: { status: true, requestedById: true },
    }),
    prisma.userBlock.count({
      where: {
        OR: [
          { blockerId: viewerId, blockedId: targetId },
          { blockerId: targetId, blockedId: viewerId },
        ],
      },
    }),
  ]);
  return resolveRelation(viewerId, targetId, {
    friendship: friendship
      ? {
          status: friendship.status as 'PENDING' | 'ACCEPTED',
          requestedById: friendship.requestedById,
        }
      : null,
    blocked: blocks > 0,
  });
}

/** Card projection for `target` from `viewer`'s perspective; null = invisible. */
export async function cardBetween(
  prisma: Pick<PrismaService, 'friendship' | 'userBlock'>,
  viewerId: string,
  target: CardSource,
): Promise<SocialCardDto | null> {
  if (!target.handle) return null;
  const relation = await relationBetween(prisma, viewerId, target.id);
  if (relation === 'BLOCKED') return null;
  return cardFor(target, relation);
}

/** Whole Berlin days between two `YYYY-MM-DD` keys (b − a). */
export function dayKeyDiff(fromDayKey: string, toDayKey: string): number {
  const ms = (s: string) => {
    const [y, m, d] = s.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((ms(toDayKey) - ms(fromDayKey)) / 86_400_000);
}
