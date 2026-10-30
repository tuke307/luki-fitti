import { Injectable } from '@nestjs/common';
import { AiRunStatus } from '@luki-fitti/common/enums';
import type { MyAiUsageDto } from '@luki-fitti/common/schemas';
import { PrismaService } from '../database/prisma.service';
import { AppSettingsService } from '../app-settings/app-settings.service';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_LIMIT = 20;
const round6 = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

/** Per-user AI usage. The user id must always come from the session (or an authorized admin). */
@Injectable()
export class AiUsageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appSettings: AppSettingsService,
  ) {}

  async getUserUsage(userId: string, days: number): Promise<MyAiUsageDto> {
    const now = Date.now();
    const where = { userId, createdAt: { gte: new Date(now - days * DAY_MS) } };
    const startOfUtcDay = new Date(now);
    startOfUtcDay.setUTCHours(0, 0, 0, 0);

    const [rows, recent, usedToday, settings] = await Promise.all([
      this.prisma.aiRun.findMany({
        where,
        select: {
          skill: true,
          status: true,
          promptTokens: true,
          completionTokens: true,
          costUsd: true,
          createdAt: true,
        },
      }),
      this.prisma.aiRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: RECENT_LIMIT,
        select: {
          id: true,
          skill: true,
          status: true,
          createdAt: true,
          promptTokens: true,
          completionTokens: true,
          costUsd: true,
          durationMs: true,
        },
      }),
      this.prisma.aiRun.count({ where: { userId, createdAt: { gte: startOfUtcDay } } }),
      this.appSettings.get(),
    ]);

    const byDay = new Map<string, { runs: number; costUsd: number }>();
    for (let i = days - 1; i >= 0; i -= 1) {
      byDay.set(new Date(now - i * DAY_MS).toISOString().slice(0, 10), { runs: 0, costUsd: 0 });
    }
    const bySkill = new Map<string, { runs: number; costUsd: number }>();
    const totals = { failed: 0, prompt: 0, completion: 0, cost: 0, unknown: 0 };
    for (const row of rows) {
      const cost = row.costUsd ?? 0;
      if (row.status === AiRunStatus.ERROR) totals.failed += 1;
      if (row.costUsd === null) totals.unknown += 1;
      totals.prompt += row.promptTokens;
      totals.completion += row.completionTokens;
      totals.cost += cost;
      const skill = bySkill.get(row.skill) ?? { runs: 0, costUsd: 0 };
      skill.runs += 1;
      skill.costUsd += cost;
      bySkill.set(row.skill, skill);
      const day = byDay.get(row.createdAt.toISOString().slice(0, 10));
      if (day) {
        day.runs += 1;
        day.costUsd += cost;
      }
    }

    return {
      days,
      totalRuns: rows.length,
      failedRuns: totals.failed,
      promptTokens: totals.prompt,
      completionTokens: totals.completion,
      costUsd: round6(totals.cost),
      unknownCostRuns: totals.unknown,
      bySkill: [...bySkill.entries()]
        .map(([skill, v]) => ({ skill, runs: v.runs, costUsd: round6(v.costUsd) }))
        .sort((a, b) => b.runs - a.runs),
      byDay: [...byDay.entries()].map(([date, v]) => ({
        date,
        runs: v.runs,
        costUsd: round6(v.costUsd),
      })),
      recent: recent.map((r) => ({
        id: r.id,
        skill: r.skill,
        status: r.status as AiRunStatus,
        createdAt: r.createdAt.toISOString(),
        promptTokens: r.promptTokens,
        completionTokens: r.completionTokens,
        costUsd: r.costUsd,
        durationMs: r.durationMs,
      })),
      today: { used: usedToday, limit: settings.aiDailyRunLimit },
    };
  }
}
