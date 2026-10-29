import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import crypto from 'crypto';
import { FoodItemSource, MEAL_TYPES, MealType } from '@luki-fitti/common/enums';
import type {
  MealEntryDto,
  MealItemDto,
  MealItemInputDto,
  NutritionSummaryDto,
  UpsertMealEntryDto,
} from '@luki-fitti/common/schemas';
import { sumMacros } from '@luki-fitti/common/utils';
import { logger } from '@luki-fitti/logger';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AppSettingsService } from '../app-settings/app-settings.service';
import { normalizeImage } from '@/utils/image.util';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_SUMMARY_DAYS = 366;
const RETENTION_SWEEP_MS = 6 * 60 * 60 * 1000;

const ENTRY_INCLUDE = {
  items: { orderBy: { orderIndex: 'asc' as const } },
  photos: { orderBy: { createdAt: 'asc' as const } },
};

type EntryRecord = {
  id: string;
  clientEntryId: string;
  eatenAt: Date;
  mealType: string;
  label: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    orderIndex: number;
    name: string;
    grams: number | null;
    kcal: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number | null;
    sugarG: number | null;
    source: string;
    confidence: number | null;
  }>;
  photos: Array<{
    id: string;
    mimeType: string;
    width: number | null;
    height: number | null;
    createdAt: Date;
  }>;
};

/** Formats an instant as the local calendar date (YYYY-MM-DD) in an IANA time zone. */
export function localDateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Inclusive list of YYYY-MM-DD keys between two local dates. */
export function enumerateDateKeys(from: string, to: string): string[] {
  const keys: string[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let ms = start; ms <= end; ms += DAY_MS) keys.push(new Date(ms).toISOString().slice(0, 10));
  return keys;
}

@Injectable()
export class NutritionService implements OnModuleInit, OnModuleDestroy {
  private retentionTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly appSettings: AppSettingsService,
  ) {}

  onModuleInit() {
    this.retentionTimer = setInterval(() => void this.sweepExpiredPhotos(), RETENTION_SWEEP_MS);
    this.retentionTimer.unref();
  }

  onModuleDestroy() {
    if (this.retentionTimer) clearInterval(this.retentionTimer);
  }

  async listEntries(userId: string, from: string, to: string): Promise<MealEntryDto[]> {
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (toDate.getTime() - fromDate.getTime() > MAX_SUMMARY_DAYS * DAY_MS) {
      throw new BadRequestException('Range too large');
    }
    const entries = await this.prisma.mealEntry.findMany({
      where: { userId, eatenAt: { gte: fromDate, lt: toDate } },
      orderBy: { eatenAt: 'asc' },
      include: ENTRY_INCLUDE,
    });
    return entries.map((e) => this.toDto(e));
  }

  async getEntry(userId: string, id: string): Promise<MealEntryDto> {
    return this.toDto(await this.findOwnedEntry(userId, id));
  }

  /** Idempotent create-or-replace keyed by the client id (safe for offline retries). */
  async upsertEntry(userId: string, dto: UpsertMealEntryDto): Promise<MealEntryDto> {
    const existing = await this.prisma.mealEntry.findUnique({
      where: { clientEntryId: dto.clientEntryId },
      select: { id: true, userId: true },
    });
    if (existing && existing.userId !== userId) {
      throw new ForbiddenException('Cannot modify a meal owned by another user');
    }

    const data = {
      eatenAt: new Date(dto.eatenAt),
      mealType: dto.mealType,
      label: dto.label?.trim() || null,
      notes: dto.notes?.trim() || null,
    };
    const entry = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.mealEntry.upsert({
        where: { clientEntryId: dto.clientEntryId },
        create: { ...data, clientEntryId: dto.clientEntryId, userId },
        update: data,
      });
      await tx.mealItem.deleteMany({ where: { mealEntryId: saved.id } });
      if (dto.items.length > 0) {
        await tx.mealItem.createMany({
          data: dto.items.map((item, index) => this.itemData(saved.id, item, index)),
        });
      }
      return tx.mealEntry.findUniqueOrThrow({ where: { id: saved.id }, include: ENTRY_INCLUDE });
    });
    return this.toDto(entry);
  }

  async deleteEntry(userId: string, id: string): Promise<{ success: boolean }> {
    const entry = await this.findOwnedEntry(userId, id);
    const photos = await this.prisma.mealPhoto.findMany({
      where: { mealEntryId: entry.id },
      select: { storageKey: true },
    });
    await this.prisma.mealEntry.delete({ where: { id: entry.id } });
    await this.storage.deleteMany(photos.map((p) => p.storageKey));
    return { success: true };
  }

  async getSummary(
    userId: string,
    from: string,
    to: string,
    timeZone: string,
  ): Promise<NutritionSummaryDto> {
    const keys = enumerateDateKeys(from, to);
    if (keys.length === 0 || keys.length > MAX_SUMMARY_DAYS) {
      throw new BadRequestException('Invalid date range');
    }
    // Widen by ±1 day in UTC, then bucket precisely by local date in the requested zone.
    const rangeStart = new Date(Date.parse(`${from}T00:00:00Z`) - DAY_MS);
    const rangeEnd = new Date(Date.parse(`${to}T00:00:00Z`) + 2 * DAY_MS);

    const [entries, sessions, prefs] = await Promise.all([
      this.prisma.mealEntry.findMany({
        where: { userId, eatenAt: { gte: rangeStart, lt: rangeEnd } },
        select: {
          eatenAt: true,
          mealType: true,
          items: { select: { kcal: true, proteinG: true, carbsG: true, fatG: true } },
        },
      }),
      this.prisma.workoutSession.findMany({
        where: { userId, status: 'COMPLETED', startedAt: { gte: rangeStart, lt: rangeEnd } },
        select: { startedAt: true, estimatedCaloriesKcal: true, activeCaloriesKcal: true },
      }),
      this.prisma.userPreferences.findUnique({
        where: { userId },
        select: { dailyKcalGoal: true, proteinGoalG: true, carbsGoalG: true, fatGoalG: true },
      }),
    ]);

    const days = new Map(
      keys.map((date) => [
        date,
        { date, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, entries: 0, burnedKcal: 0, workouts: 0 },
      ]),
    );
    const byMealType = new Map<MealType, { kcal: number; entries: number }>(
      MEAL_TYPES.map((t) => [t, { kcal: 0, entries: 0 }]),
    );

    for (const entry of entries) {
      const day = days.get(localDateKey(entry.eatenAt, timeZone));
      if (!day) continue;
      const totals = sumMacros(entry.items);
      day.kcal += totals.kcal;
      day.proteinG += totals.proteinG;
      day.carbsG += totals.carbsG;
      day.fatG += totals.fatG;
      day.entries += 1;
      const bucket = byMealType.get(entry.mealType as MealType);
      if (bucket) {
        bucket.kcal += totals.kcal;
        bucket.entries += 1;
      }
    }
    for (const session of sessions) {
      const day = days.get(localDateKey(session.startedAt, timeZone));
      if (!day) continue;
      day.burnedKcal += Math.round(session.estimatedCaloriesKcal ?? session.activeCaloriesKcal ?? 0);
      day.workouts += 1;
    }

    const list = [...days.values()].map((d) => ({
      ...d,
      ...sumMacros([d]),
    }));
    const logged = list.filter((d) => d.entries > 0);
    const avg = (pick: (d: (typeof list)[number]) => number, over = logged) =>
      over.length ? Math.round((over.reduce((acc, d) => acc + pick(d), 0) / over.length) * 10) / 10 : 0;

    return {
      from,
      to,
      tz: timeZone,
      goals: {
        dailyKcalGoal: prefs?.dailyKcalGoal ?? null,
        proteinGoalG: prefs?.proteinGoalG ?? null,
        carbsGoalG: prefs?.carbsGoalG ?? null,
        fatGoalG: prefs?.fatGoalG ?? null,
      },
      days: list,
      loggedDays: logged.length,
      averages: {
        kcal: Math.round(avg((d) => d.kcal)),
        proteinG: avg((d) => d.proteinG),
        carbsG: avg((d) => d.carbsG),
        fatG: avg((d) => d.fatG),
        burnedKcal: Math.round(avg((d) => d.burnedKcal, list)),
      },
      byMealType: [...byMealType.entries()]
        .filter(([, v]) => v.entries > 0)
        .map(([mealType, v]) => ({ mealType, kcal: Math.round(v.kcal), entries: v.entries })),
    };
  }

  /** Distinct recently logged items for one-tap re-logging. */
  async getRecentItems(userId: string): Promise<MealItemDto[]> {
    const items = await this.prisma.mealItem.findMany({
      where: { mealEntry: { userId, eatenAt: { gte: new Date(Date.now() - 90 * DAY_MS) } } },
      orderBy: { mealEntry: { eatenAt: 'desc' } },
      take: 300,
    });
    const seen = new Set<string>();
    const unique: MealItemDto[] = [];
    for (const item of items) {
      const key = item.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(this.toItemDto(item));
      if (unique.length >= 30) break;
    }
    return unique;
  }

  // ── Photos ────────────────────────────────────────────────────────────────

  /** Normalizes uploads (EXIF stripped, bounded size) and stores them when storage is set up. */
  async attachPhotos(
    userId: string,
    entryId: string,
    files: Array<{ buffer: Buffer }>,
  ): Promise<{ images: Buffer[]; stored: boolean }> {
    await this.findOwnedEntry(userId, entryId);
    const processed = await Promise.all(files.map((f) => normalizeImage(f.buffer)));
    if (!this.storage.isConfigured) {
      return { images: processed.map((p) => p.buffer), stored: false };
    }

    const stored: string[] = [];
    try {
      for (const image of processed) {
        // Keys are generated server-side only, so user input can never shape the path.
        const key = `meals/${userId}/${entryId}/${crypto.randomUUID()}.jpg`;
        await this.storage.put(key, image.buffer, image.mimeType);
        stored.push(key);
        await this.prisma.mealPhoto.create({
          data: {
            mealEntryId: entryId,
            storageKey: key,
            mimeType: image.mimeType,
            sizeBytes: image.buffer.length,
            width: image.width,
            height: image.height,
          },
        });
      }
    } catch (err) {
      await this.storage.deleteMany(stored);
      await this.prisma.mealPhoto.deleteMany({ where: { storageKey: { in: stored } } });
      throw err;
    }
    return { images: processed.map((p) => p.buffer), stored: true };
  }

  async getPhoto(userId: string, photoId: string): Promise<{ body: Buffer; contentType: string }> {
    const photo = await this.prisma.mealPhoto.findUnique({
      where: { id: photoId },
      select: { storageKey: true, mealEntry: { select: { userId: true } } },
    });
    if (!photo || photo.mealEntry.userId !== userId) throw new NotFoundException('Photo not found');
    return this.storage.get(photo.storageKey);
  }

  async deletePhoto(userId: string, photoId: string): Promise<{ success: boolean }> {
    const photo = await this.prisma.mealPhoto.findUnique({
      where: { id: photoId },
      select: { id: true, storageKey: true, mealEntry: { select: { userId: true } } },
    });
    if (!photo || photo.mealEntry.userId !== userId) throw new NotFoundException('Photo not found');
    await this.prisma.mealPhoto.delete({ where: { id: photo.id } });
    await this.storage.deleteMany([photo.storageKey]);
    return { success: true };
  }

  async sweepExpiredPhotos(): Promise<number> {
    try {
      const { mealPhotoRetentionDays } = await this.appSettings.get();
      if (!mealPhotoRetentionDays) return 0;
      const cutoff = new Date(Date.now() - mealPhotoRetentionDays * DAY_MS);
      const expired = await this.prisma.mealPhoto.findMany({
        where: { createdAt: { lt: cutoff } },
        select: { id: true, storageKey: true },
        take: 1000,
      });
      if (expired.length === 0) return 0;
      await this.prisma.mealPhoto.deleteMany({ where: { id: { in: expired.map((p) => p.id) } } });
      await this.storage.deleteMany(expired.map((p) => p.storageKey));
      return expired.length;
    } catch (err) {
      logger.warn(`Meal photo retention sweep failed: ${String(err)}`);
      return 0;
    }
  }

  // ── Mapping ───────────────────────────────────────────────────────────────

  private async findOwnedEntry(userId: string, id: string): Promise<EntryRecord> {
    const entry = await this.prisma.mealEntry.findUnique({ where: { id }, include: ENTRY_INCLUDE });
    // Same 404 for "missing" and "not yours" so ids can't be probed.
    if (!entry || entry.userId !== userId) throw new NotFoundException('Meal not found');
    return entry;
  }

  private itemData(mealEntryId: string, item: MealItemInputDto, orderIndex: number) {
    return {
      mealEntryId,
      orderIndex,
      name: item.name.trim(),
      grams: item.grams ?? null,
      kcal: item.kcal,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      fiberG: item.fiberG ?? null,
      sugarG: item.sugarG ?? null,
      source: item.source,
      confidence: item.source === FoodItemSource.AI ? (item.confidence ?? null) : null,
    };
  }

  private toItemDto(item: EntryRecord['items'][number]): MealItemDto {
    return {
      id: item.id,
      orderIndex: item.orderIndex,
      name: item.name,
      grams: item.grams,
      kcal: item.kcal,
      proteinG: item.proteinG,
      carbsG: item.carbsG,
      fatG: item.fatG,
      fiberG: item.fiberG,
      sugarG: item.sugarG,
      source: item.source as FoodItemSource,
      confidence: item.confidence,
    };
  }

  toDto(entry: EntryRecord): MealEntryDto {
    return {
      id: entry.id,
      clientEntryId: entry.clientEntryId,
      eatenAt: entry.eatenAt.toISOString(),
      mealType: entry.mealType as MealType,
      label: entry.label,
      notes: entry.notes,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
      items: entry.items.map((i) => this.toItemDto(i)),
      photos: entry.photos.map((p) => ({
        id: p.id,
        mimeType: p.mimeType,
        width: p.width,
        height: p.height,
        createdAt: p.createdAt.toISOString(),
        url: `/api/nutrition/photos/${p.id}`,
      })),
      totals: sumMacros(entry.items),
    };
  }
}
