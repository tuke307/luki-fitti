import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  AdminPermission,
  type FeatureGrant,
  isAdminPermission,
  isFeatureGrant,
} from '@luki-fitti/common/enums';
import type {
  AdminDashboardDto,
  AdminUserDto,
  AdminUserListDto,
  AdminUserQueryDto,
  AdminUserAiUsageDto,
  AiUsageSummaryDto,
  UpdateUserAccessDto,
} from '@luki-fitti/common/schemas';
import { PrismaService } from '../database/prisma.service';
import { AiUsageService } from '../ai/ai-usage.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const round4 = (value: number) => Math.round(value * 10_000) / 10_000;
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aiUsage: AiUsageService,
  ) {}

  async getDashboard(): Promise<AdminDashboardDto> {
    const now = Date.now();
    const since30 = new Date(now - 30 * DAY_MS);
    const since7 = new Date(now - 7 * DAY_MS);
    const [
      totalUsers,
      newUsersLast30Days,
      activeUsers,
      completedSessionsLast30Days,
      mealEntriesLast30Days,
      usersWithAiAccess,
      aiRunsLast30Days,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({ where: { createdAt: { gte: since30 } } }),
      this.prisma.workoutSession.groupBy({
        by: ['userId'],
        where: { startedAt: { gte: since7 } },
      }),
      this.prisma.workoutSession.count({
        where: { status: 'COMPLETED', completedAt: { gte: since30 } },
      }),
      this.prisma.mealEntry.count({ where: { eatenAt: { gte: since30 } } }),
      this.prisma.user.count({ where: { NOT: { featureGrants: { isEmpty: true } } } }),
      this.prisma.aiRun.count({ where: { createdAt: { gte: since30 } } }),
    ]);
    return {
      totalUsers,
      newUsersLast30Days,
      activeUsersLast7Days: activeUsers.length,
      completedSessionsLast30Days,
      mealEntriesLast30Days,
      usersWithAiAccess,
      aiRunsLast30Days,
    };
  }

  async listUsers(query: AdminUserQueryDto): Promise<AdminUserListDto> {
    const search = query.search?.trim();
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};
    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        select: {
          id: true,
          email: true,
          name: true,
          emailVerified: true,
          createdAt: true,
          lastLoginAt: true,
          permissions: true,
          featureGrants: true,
          _count: {
            select: {
              workoutSessions: { where: { status: 'COMPLETED' } },
              mealEntries: true,
            },
          },
        },
      }),
    ]);

    const runs = users.length
      ? await this.prisma.aiRun.groupBy({
          by: ['userId'],
          where: {
            userId: { in: users.map((u) => u.id) },
            createdAt: { gte: new Date(Date.now() - 30 * DAY_MS) },
          },
          _count: { _all: true },
          _sum: { costUsd: true },
        })
      : [];
    const runsByUser = new Map(runs.map((r) => [r.userId, r]));

    return {
      total,
      page: query.page,
      limit: query.limit,
      items: users.map(
        (u): AdminUserDto => ({
          id: u.id,
          email: u.email,
          name: u.name,
          emailVerified: u.emailVerified,
          createdAt: u.createdAt.toISOString(),
          lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
          permissions: u.permissions.filter(isAdminPermission),
          featureGrants: u.featureGrants.filter(isFeatureGrant),
          completedSessions: u._count.workoutSessions,
          mealEntries: u._count.mealEntries,
          aiRunsLast30Days: runsByUser.get(u.id)?._count._all ?? 0,
          aiCostUsdLast30Days: round6(runsByUser.get(u.id)?._sum.costUsd ?? 0),
        }),
      ),
    };
  }

  async updateUserAccess(
    actorId: string,
    targetId: string,
    dto: UpdateUserAccessDto,
  ): Promise<Pick<AdminUserDto, 'id' | 'permissions' | 'featureGrants'>> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, permissions: true },
    });
    if (!target) throw new NotFoundException('User not found');

    // Prevent locking yourself out of user management.
    if (
      actorId === targetId &&
      dto.permissions !== undefined &&
      target.permissions.includes(AdminPermission.USERS_MANAGE) &&
      !dto.permissions.includes(AdminPermission.USERS_MANAGE)
    ) {
      throw new BadRequestException('You cannot remove your own user-management permission');
    }

    const updated = await this.prisma.user.update({
      where: { id: targetId },
      data: {
        ...(dto.permissions !== undefined ? { permissions: [...new Set(dto.permissions)] } : {}),
        ...(dto.featureGrants !== undefined
          ? { featureGrants: [...new Set(dto.featureGrants)] }
          : {}),
      },
      select: { id: true, permissions: true, featureGrants: true },
    });
    return {
      id: updated.id,
      permissions: updated.permissions.filter(isAdminPermission),
      featureGrants: updated.featureGrants.filter(isFeatureGrant) as FeatureGrant[],
    };
  }

  async getAiUsage(days: number): Promise<AiUsageSummaryDto> {
    const since = new Date(Date.now() - days * DAY_MS);
    const where = { createdAt: { gte: since } };
    const [totals, failedRuns, bySkill, failedBySkill, byUser, rows] = await Promise.all([
      this.prisma.aiRun.aggregate({
        where,
        _count: { _all: true },
        _sum: { promptTokens: true, completionTokens: true, costUsd: true },
        _avg: { durationMs: true },
      }),
      this.prisma.aiRun.count({ where: { ...where, status: 'ERROR' } }),
      this.prisma.aiRun.groupBy({
        by: ['skill'],
        where,
        _count: { _all: true },
        _sum: { costUsd: true },
      }),
      this.prisma.aiRun.groupBy({
        by: ['skill'],
        where: { ...where, status: 'ERROR' },
        _count: { _all: true },
      }),
      this.prisma.aiRun.groupBy({
        by: ['userId'],
        where: { ...where, userId: { not: null } },
        _count: { _all: true },
        _sum: { costUsd: true },
        orderBy: { _count: { userId: 'desc' } },
        take: 10,
      }),
      this.prisma.aiRun.findMany({ where, select: { createdAt: true, costUsd: true } }),
    ]);

    const failedMap = new Map(failedBySkill.map((s) => [s.skill, s._count._all]));
    const userIds = byUser.map((u) => u.userId).filter((id): id is string => !!id);
    const emails = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, email: true },
        })
      : [];
    const emailMap = new Map(emails.map((u) => [u.id, u.email]));

    const dayBuckets = new Map<string, { runs: number; costUsd: number }>();
    for (let i = days - 1; i >= 0; i -= 1) {
      dayBuckets.set(new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10), {
        runs: 0,
        costUsd: 0,
      });
    }
    for (const row of rows) {
      const bucket = dayBuckets.get(row.createdAt.toISOString().slice(0, 10));
      if (bucket) {
        bucket.runs += 1;
        bucket.costUsd += row.costUsd ?? 0;
      }
    }

    return {
      days,
      totalRuns: totals._count._all,
      failedRuns,
      promptTokens: totals._sum.promptTokens ?? 0,
      completionTokens: totals._sum.completionTokens ?? 0,
      costUsd: round4(totals._sum.costUsd ?? 0),
      avgDurationMs: Math.round(totals._avg.durationMs ?? 0),
      bySkill: bySkill.map((s) => ({
        skill: s.skill,
        runs: s._count._all,
        failed: failedMap.get(s.skill) ?? 0,
        costUsd: round4(s._sum.costUsd ?? 0),
      })),
      byDay: [...dayBuckets.entries()].map(([date, v]) => ({
        date,
        runs: v.runs,
        costUsd: round4(v.costUsd),
      })),
      topUsers: byUser
        .filter((u) => u.userId)
        .map((u) => ({
          userId: u.userId as string,
          email: emailMap.get(u.userId as string) ?? '—',
          runs: u._count._all,
          costUsd: round4(u._sum.costUsd ?? 0),
        })),
    };
  }

  async getUserAiUsage(userId: string, days: number): Promise<AdminUserAiUsageDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return { ...(await this.aiUsage.getUserUsage(user.id, days)), userId: user.id, email: user.email };
  }
}
