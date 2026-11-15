import type { PrismaService } from '../database/prisma.service';

/**
 * "Workouts this week" per user: effort-point ledger entries with points > 0
 * in the given Berlin league week. Shared by the friend nudges and the social
 * hub summary so both count the same thing.
 */
export async function weeklyWorkoutCounts(
  prisma: PrismaService,
  weekKey: string,
  userIds: string[],
): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.effortPointEntry.groupBy({
    by: ['userId'],
    where: { weekKey, points: { gt: 0 }, userId: { in: userIds } },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.userId, r._count._all]));
}
