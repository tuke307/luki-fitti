import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import crypto from 'crypto';
import { BodyWeightSource } from '@luki-fitti/common/enums';
import type {
  BodyWeightEntryDto,
  ImportBodyWeightDto,
  ImportBodyWeightResultDto,
  UpsertBodyWeightEntryDto,
} from '@luki-fitti/common/schemas';
import { estimateWorkoutEnergy, weightAt, type WeighIn } from '@luki-fitti/common/utils';
import { PrismaService } from '../database/prisma.service';

/** Upper bound for a single history listing (years of daily weigh-ins). */
export const MAX_LIST_ENTRIES = 2000;
/** Sessions recomputed per transaction when a weigh-in changes. */
const RECALC_BATCH_SIZE = 200;
/** Client ids with this prefix are reserved for HealthKit imports. */
const HEALTHKIT_CLIENT_ID_PREFIX = 'hk-';

type EntryRecord = {
  id: string;
  clientEntryId: string;
  userId: string;
  measuredAt: Date;
  weightKg: number;
  source: string;
  healthKitUuid: string | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Half-open `[from, to)` range of session start times; `null` = unbounded on that side. */
export interface RecalcWindow {
  from: Date | null;
  to: Date | null;
}

/** Minimal Prisma surface needed to resolve a body weight (lets SessionService share it). */
interface BodyWeightLookupClient {
  bodyWeightEntry?: {
    findFirst: PrismaService['bodyWeightEntry']['findFirst'];
  };
  userPreferences?: {
    findUnique: PrismaService['userPreferences']['findUnique'];
  };
}

/**
 * Body weight that applied at `at`: the newest weigh-in on/before it, else the earliest weigh-in,
 * else the legacy `preferences.bodyWeightKg`, else `null`. Mirrors `weightAt` in common/utils.
 */
export async function resolveBodyWeightAt(
  prisma: BodyWeightLookupClient,
  userId: string,
  at: Date,
): Promise<number | null> {
  if (prisma.bodyWeightEntry?.findFirst) {
    const before = await prisma.bodyWeightEntry.findFirst({
      where: { userId, measuredAt: { lte: at } },
      orderBy: { measuredAt: 'desc' },
      select: { weightKg: true },
    });
    if (before) return before.weightKg;
    const earliest = await prisma.bodyWeightEntry.findFirst({
      where: { userId },
      orderBy: { measuredAt: 'asc' },
      select: { weightKg: true },
    });
    if (earliest) return earliest.weightKg;
  }
  if (prisma.userPreferences?.findUnique) {
    const prefs = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { bodyWeightKg: true },
    });
    return prefs?.bodyWeightKg ?? null;
  }
  return null;
}

/**
 * Which session start times may use a different effective weight after weigh-ins at `changed`
 * were created, edited (pass old and new time) or deleted. `remaining` is the history *after*
 * the write. Returns `null` when nothing can be affected.
 */
export function computeRecalcWindow(
  remaining: readonly WeighIn[],
  changed: readonly Date[],
): RecalcWindow | null {
  if (changed.length === 0) return null;
  const changedMs = changed.map((d) => d.getTime());
  const minChanged = Math.min(...changedMs);
  const maxChanged = Math.max(...changedMs);
  const times = remaining.map((e) => new Date(e.measuredAt).getTime()).sort((a, b) => a - b);

  // Sessions before the first weigh-in fall back to the earliest one, so touching (or creating,
  // or deleting) the earliest weigh-in affects everything before it as well.
  const earliest = times[0];
  const from = earliest === undefined || minChanged <= earliest ? null : new Date(minChanged);
  const next = times.find((t) => t > maxChanged);
  return { from, to: next === undefined ? null : new Date(next) };
}

@Injectable()
export class BodyWeightService {
  constructor(private readonly prisma: PrismaService) {}

  /** Weigh-ins in `[from, to]` (both optional), oldest first; capped to the newest entries. */
  async listEntries(userId: string, from?: string, to?: string): Promise<BodyWeightEntryDto[]> {
    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;
    if (fromDate && toDate && fromDate > toDate)
      throw new BadRequestException('Invalid date range');
    const entries = await this.prisma.bodyWeightEntry.findMany({
      where: {
        userId,
        ...(fromDate || toDate
          ? {
              measuredAt: {
                ...(fromDate ? { gte: fromDate } : {}),
                ...(toDate ? { lte: toDate } : {}),
              },
            }
          : {}),
      },
      orderBy: { measuredAt: 'desc' },
      take: MAX_LIST_ENTRIES,
    });
    return entries.reverse().map((e) => this.toDto(e));
  }

  /** Idempotent create-or-replace keyed by the client id (safe for offline retries). */
  async upsertEntry(userId: string, dto: UpsertBodyWeightEntryDto): Promise<BodyWeightEntryDto> {
    const existing = await this.prisma.bodyWeightEntry.findUnique({
      where: { clientEntryId: dto.clientEntryId },
      select: { id: true, userId: true, measuredAt: true },
    });
    // Same 404 for "missing" and "not yours" so client ids can't be probed or overwritten.
    if (existing && existing.userId !== userId) throw new NotFoundException('Weigh-in not found');

    const measuredAt = new Date(dto.measuredAt);
    const note = dto.note === undefined ? undefined : dto.note?.trim() || null;
    let saved: EntryRecord;
    if (existing) {
      // Source and HealthKit link are kept so an edited import still dedupes on re-sync.
      const result = await this.prisma.bodyWeightEntry.updateMany({
        where: { id: existing.id, userId },
        data: { measuredAt, weightKg: dto.weightKg, ...(note !== undefined ? { note } : {}) },
      });
      if (result.count === 0) throw new NotFoundException('Weigh-in not found');
      saved = await this.prisma.bodyWeightEntry.findUniqueOrThrow({ where: { id: existing.id } });
    } else {
      if (dto.clientEntryId.startsWith(HEALTHKIT_CLIENT_ID_PREFIX)) {
        throw new BadRequestException('Client id prefix is reserved for HealthKit imports');
      }
      saved = await this.prisma.bodyWeightEntry.create({
        data: {
          clientEntryId: dto.clientEntryId,
          userId,
          measuredAt,
          weightKg: dto.weightKg,
          note: note ?? null,
          source: BodyWeightSource.MANUAL,
        },
      });
    }

    await this.syncDerivedData(userId, existing ? [existing.measuredAt, measuredAt] : [measuredAt]);
    return this.toDto(saved);
  }

  async deleteEntry(userId: string, id: string): Promise<{ success: boolean }> {
    const entry = await this.prisma.bodyWeightEntry.findFirst({
      where: { id, userId },
      select: { id: true, measuredAt: true },
    });
    if (!entry) throw new NotFoundException('Weigh-in not found');
    await this.prisma.bodyWeightEntry.deleteMany({ where: { id: entry.id, userId } });
    await this.syncDerivedData(userId, [entry.measuredAt]);
    return { success: true };
  }

  /**
   * Applies a HealthKit delta: samples are upserted by (user, HealthKit UUID), deleted UUIDs
   * remove the matching imported entries. Manual entries are never touched.
   */
  async importHealthKit(
    userId: string,
    dto: ImportBodyWeightDto,
  ): Promise<ImportBodyWeightResultDto> {
    const deletedUuids = [...new Set(dto.deletedHealthKitUuids)];
    const deletedSet = new Set(deletedUuids);
    // Last sample wins for duplicate UUIDs; a sample that is also reported deleted is dropped.
    const samples = [
      ...new Map(
        dto.samples
          .filter((s) => !deletedSet.has(s.healthKitUuid))
          .map((s) => [s.healthKitUuid, s]),
      ).values(),
    ];
    const uuids = samples.map((s) => s.healthKitUuid);

    const changed: Date[] = [];
    let imported = 0;

    const result = await this.prisma.$transaction(async (tx) => {
      const existing: EntryRecord[] = uuids.length
        ? await tx.bodyWeightEntry.findMany({ where: { userId, healthKitUuid: { in: uuids } } })
        : [];
      const byUuid = new Map(existing.map((e) => [e.healthKitUuid, e]));

      const toCreate = samples.filter((s) => !byUuid.has(s.healthKitUuid));
      const preferredIds = toCreate.map((s) => `${HEALTHKIT_CLIENT_ID_PREFIX}${s.healthKitUuid}`);
      // Client ids are globally unique; never collide with (or reveal) another user's row.
      const taken = new Set(
        preferredIds.length
          ? (
              await tx.bodyWeightEntry.findMany({
                where: { clientEntryId: { in: preferredIds } },
                select: { clientEntryId: true },
              })
            ).map((e) => e.clientEntryId)
          : [],
      );

      const touched: EntryRecord[] = [];
      for (const sample of samples) {
        const current = byUuid.get(sample.healthKitUuid);
        if (!current) continue;
        const measuredAt = new Date(sample.measuredAt);
        if (
          current.measuredAt.getTime() === measuredAt.getTime() &&
          current.weightKg === sample.weightKg
        ) {
          touched.push(current);
          continue;
        }
        await tx.bodyWeightEntry.updateMany({
          where: { id: current.id, userId },
          data: { measuredAt, weightKg: sample.weightKg },
        });
        changed.push(current.measuredAt, measuredAt);
        imported += 1;
        touched.push({ ...current, measuredAt, weightKg: sample.weightKg, updatedAt: new Date() });
      }

      if (toCreate.length > 0) {
        const created = await tx.bodyWeightEntry.createManyAndReturn({
          data: toCreate.map((s) => {
            const preferred = `${HEALTHKIT_CLIENT_ID_PREFIX}${s.healthKitUuid}`;
            return {
              clientEntryId: taken.has(preferred)
                ? `${HEALTHKIT_CLIENT_ID_PREFIX}${crypto.randomUUID()}`
                : preferred,
              userId,
              measuredAt: new Date(s.measuredAt),
              weightKg: s.weightKg,
              source: BodyWeightSource.HEALTHKIT,
              healthKitUuid: s.healthKitUuid,
            };
          }),
        });
        for (const entry of created) changed.push(entry.measuredAt);
        imported += created.length;
        touched.push(...created);
      }

      let deleted = 0;
      if (deletedUuids.length > 0) {
        const where = {
          userId,
          source: BodyWeightSource.HEALTHKIT,
          healthKitUuid: { in: deletedUuids },
        };
        const doomed = await tx.bodyWeightEntry.findMany({ where, select: { measuredAt: true } });
        if (doomed.length > 0) {
          deleted = (await tx.bodyWeightEntry.deleteMany({ where })).count;
          for (const entry of doomed) changed.push(entry.measuredAt);
        }
      }
      return { touched, deleted };
    });

    await this.syncDerivedData(userId, changed);
    return {
      imported,
      deleted: result.deleted,
      entries: result.touched
        .sort((a, b) => a.measuredAt.getTime() - b.measuredAt.getTime())
        .map((e) => this.toDto(e)),
    };
  }

  /**
   * Records a weigh-in "now" from the legacy preferences field unless it matches the newest one,
   * so the history stays the single source of truth.
   */
  async recordFromPreferences(userId: string, weightKg: number): Promise<void> {
    const newest = await this.prisma.bodyWeightEntry.findFirst({
      where: { userId },
      orderBy: { measuredAt: 'desc' },
      select: { weightKg: true },
    });
    if (newest && newest.weightKg === weightKg) return;
    const measuredAt = new Date();
    await this.prisma.bodyWeightEntry.create({
      data: {
        clientEntryId: `weight-pref-${crypto.randomUUID()}`,
        userId,
        measuredAt,
        weightKg,
        source: BodyWeightSource.MANUAL,
      },
    });
    await this.syncDerivedData(userId, [measuredAt]);
  }

  /**
   * Keeps everything derived from the weigh-in history consistent after a write: the cached
   * `preferences.bodyWeightKg` (newest weigh-in) and estimated workout calories in the window
   * whose effective weight may have changed.
   */
  async syncDerivedData(userId: string, changed: readonly Date[]): Promise<void> {
    if (changed.length === 0) return;
    const entries = await this.prisma.bodyWeightEntry.findMany({
      where: { userId },
      orderBy: { measuredAt: 'asc' },
      select: { measuredAt: true, weightKg: true },
    });
    const newest = entries.at(-1);
    // updateMany: the preferences row may not exist yet, which is fine.
    await this.prisma.userPreferences.updateMany({
      where: { userId },
      data: { bodyWeightKg: newest?.weightKg ?? null },
    });
    const window = computeRecalcWindow(entries, changed);
    if (window) await this.recomputeSessionCalories(userId, window, entries);
  }

  /**
   * Re-estimates calories of the user's completed sessions that started within `window`, using the
   * weight effective at each session start. Only rows whose value changes are written. Sessions
   * with HealthKit active energy are skipped because their value does not depend on body weight.
   * Returns the number of updated sessions.
   */
  async recomputeSessionCalories(
    userId: string,
    window: RecalcWindow,
    entries?: readonly WeighIn[],
  ): Promise<number> {
    const history =
      entries ??
      (await this.prisma.bodyWeightEntry.findMany({
        where: { userId },
        select: { measuredAt: true, weightKg: true },
      }));
    let fallbackKg: number | null | undefined;
    const startedAt =
      window.from || window.to
        ? { ...(window.from ? { gte: window.from } : {}), ...(window.to ? { lt: window.to } : {}) }
        : undefined;

    let updated = 0;
    let cursor: string | undefined;
    for (;;) {
      const sessions = await this.prisma.workoutSession.findMany({
        where: {
          userId,
          status: 'COMPLETED',
          activeCaloriesKcal: null,
          ...(startedAt ? { startedAt } : {}),
        },
        orderBy: { id: 'asc' },
        take: RECALC_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true,
          startedAt: true,
          sessionType: true,
          activeDurationSeconds: true,
          activeCaloriesKcal: true,
          estimatedCaloriesKcal: true,
          exercises: {
            select: {
              exerciseTypeSnapshot: true,
              sets: {
                select: {
                  setType: true,
                  completed: true,
                  durationSeconds: true,
                  distanceMeters: true,
                },
              },
            },
          },
        },
      });
      if (sessions.length === 0) break;

      const changes: Array<{ id: string; kcal: number }> = [];
      for (const session of sessions) {
        let weightKg = weightAt(history, session.startedAt);
        if (weightKg === null) {
          // No history left: match SessionService, which falls back to the preferences value.
          if (fallbackKg === undefined) {
            fallbackKg =
              (
                await this.prisma.userPreferences.findUnique({
                  where: { userId },
                  select: { bodyWeightKg: true },
                })
              )?.bodyWeightKg ?? null;
          }
          weightKg = fallbackKg;
        }
        const kcal = estimateWorkoutEnergy(session, weightKg).kcal;
        if (session.estimatedCaloriesKcal !== kcal) changes.push({ id: session.id, kcal });
      }

      if (changes.length > 0) {
        await this.prisma.$transaction(async (tx) => {
          for (const change of changes) {
            await tx.workoutSession.updateMany({
              where: { id: change.id, userId },
              data: { estimatedCaloriesKcal: change.kcal },
            });
          }
        });
        updated += changes.length;
      }
      if (sessions.length < RECALC_BATCH_SIZE) break;
      cursor = sessions[sessions.length - 1]!.id;
    }
    return updated;
  }

  toDto(entry: EntryRecord): BodyWeightEntryDto {
    return {
      id: entry.id,
      clientEntryId: entry.clientEntryId,
      measuredAt: entry.measuredAt.toISOString(),
      weightKg: entry.weightKg,
      source: entry.source as BodyWeightSource,
      healthKitUuid: entry.healthKitUuid,
      note: entry.note,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
