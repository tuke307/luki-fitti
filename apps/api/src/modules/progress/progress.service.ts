import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ProgressPhotoKind, ProgressPose } from '@luki-fitti/common/enums';
import type {
  AttachProgressPhotoDto,
  ProgressCheckInDto,
  ProgressPhotoDto,
  UpsertProgressCheckInDto,
} from '@luki-fitti/common/schemas';
import type { Prisma } from '@luki-fitti/database';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { normalizeImage } from '@/utils/image.util';

const CHECK_IN_INCLUDE = {
  photos: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.ProgressCheckInInclude;

type CheckInRecord = Prisma.ProgressCheckInGetPayload<{ include: typeof CHECK_IN_INCLUDE }>;

/**
 * Dated body check-ins with pose photos. Photos are streamed to their owner only —
 * the S3 objects are never public. Cloud storage is the user's opt-in backup;
 * a device with backup off simply never calls these endpoints.
 */
@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async listCheckIns(userId: string, from?: string, to?: string): Promise<ProgressCheckInDto[]> {
    const checkIns = await this.prisma.progressCheckIn.findMany({
      where: {
        userId,
        takenAt: {
          ...(from ? { gte: new Date(from) } : {}),
          ...(to ? { lt: new Date(to) } : {}),
        },
      },
      orderBy: { takenAt: 'desc' },
      include: CHECK_IN_INCLUDE,
    });
    return checkIns.map((c) => this.toDto(c));
  }

  /** Idempotent create-or-update keyed by the client id (safe for offline retries). */
  async upsertCheckIn(userId: string, dto: UpsertProgressCheckInDto): Promise<ProgressCheckInDto> {
    const existing = await this.prisma.progressCheckIn.findUnique({
      where: { clientEntryId: dto.clientEntryId },
      select: { id: true, userId: true },
    });
    if (existing && existing.userId !== userId) {
      throw new ForbiddenException('Cannot modify a check-in owned by another user');
    }

    const data = {
      takenAt: new Date(dto.takenAt),
      note: dto.note?.trim() || null,
      bodyWeightClientEntryId: dto.bodyWeightClientEntryId ?? null,
    };
    const checkIn = await this.prisma.progressCheckIn.upsert({
      where: { clientEntryId: dto.clientEntryId },
      create: { ...data, clientEntryId: dto.clientEntryId, userId },
      update: data,
      include: CHECK_IN_INCLUDE,
    });
    return this.toDto(checkIn);
  }

  /** Accepts the row id or the clientEntryId; deletes the photos' objects too. */
  async deleteCheckIn(userId: string, id: string): Promise<{ success: boolean }> {
    const checkIn = await this.findOwnedCheckIn(userId, id);
    await this.prisma.progressCheckIn.delete({ where: { id: checkIn.id } });
    await this.storage.deleteMany(checkIn.photos.map((p) => p.storageKey));
    return { success: true };
  }

  /**
   * Normalizes the upload (EXIF/GPS stripped, bounded size) and stores it.
   * Idempotent on clientPhotoId: a re-upload replaces the old row and object.
   */
  async attachPhoto(
    userId: string,
    clientEntryId: string,
    dto: AttachProgressPhotoDto,
    file: { buffer: Buffer } | undefined,
  ): Promise<ProgressPhotoDto> {
    if (!file) throw new NotFoundException('Photo file is required');
    const checkIn = await this.findOwnedCheckIn(userId, clientEntryId);
    if (!this.storage.isConfigured) {
      throw new ServiceUnavailableException('Photo storage is not configured');
    }

    const image = await normalizeImage(file.buffer);
    const previous = await this.prisma.progressPhoto.findUnique({
      where: { clientPhotoId: dto.clientPhotoId },
      select: { id: true, checkInId: true, storageKey: true },
    });
    // Same photo id on a different check-in (yours or someone else's) is a conflict,
    // never a silent delete.
    if (previous && previous.checkInId !== checkIn.id) {
      throw new ConflictException('clientPhotoId already belongs to another check-in');
    }

    const key = `progress/${userId}/${checkIn.id}/${crypto.randomUUID()}.jpg`;
    await this.storage.put(key, image.buffer, image.mimeType);
    try {
      if (previous) {
        // Re-upload replaces the row in place (clientPhotoId stays unique) and the old object.
        const photo = await this.prisma.progressPhoto.update({
          where: { id: previous.id },
          data: {
            storageKey: key,
            pose: dto.pose,
            kind: dto.kind,
            mimeType: image.mimeType,
            sizeBytes: image.buffer.length,
            width: image.width,
            height: image.height,
            aiModel: dto.aiModel ?? null,
            aiGoal: dto.aiGoal ?? null,
            aiHorizonMonths: dto.aiHorizonMonths ?? null,
          },
        });
        await this.storage.deleteMany([previous.storageKey]);
        return this.toPhotoDto(photo);
      }
      const photo = await this.prisma.progressPhoto.create({
        data: {
          clientPhotoId: dto.clientPhotoId,
          checkInId: checkIn.id,
          pose: dto.pose,
          kind: dto.kind,
          storageKey: key,
          mimeType: image.mimeType,
          sizeBytes: image.buffer.length,
          width: image.width,
          height: image.height,
          aiModel: dto.aiModel ?? null,
          aiGoal: dto.aiGoal ?? null,
          aiHorizonMonths: dto.aiHorizonMonths ?? null,
        },
      });
      return this.toPhotoDto(photo);
    } catch (err) {
      await this.storage.deleteMany([key]);
      throw err;
    }
  }

  async getPhoto(userId: string, photoId: string): Promise<{ body: Buffer; contentType: string }> {
    const photo = await this.prisma.progressPhoto.findUnique({
      where: { id: photoId },
      select: { storageKey: true, checkIn: { select: { userId: true } } },
    });
    if (!photo || photo.checkIn.userId !== userId) throw new NotFoundException('Photo not found');
    return this.storage.get(photo.storageKey);
  }

  async deletePhoto(userId: string, photoId: string): Promise<{ success: boolean }> {
    const photo = await this.prisma.progressPhoto.findUnique({
      where: { id: photoId },
      select: { id: true, storageKey: true, checkIn: { select: { userId: true } } },
    });
    if (!photo || photo.checkIn.userId !== userId) throw new NotFoundException('Photo not found');
    await this.prisma.progressPhoto.delete({ where: { id: photo.id } });
    await this.storage.deleteMany([photo.storageKey]);
    return { success: true };
  }

  /** Storage keys of every progress photo the user owns — for account deletion. */
  async storageKeysForUser(userId: string): Promise<string[]> {
    const photos = await this.prisma.progressPhoto.findMany({
      where: { checkIn: { userId } },
      select: { storageKey: true },
    });
    return photos.map((p) => p.storageKey);
  }

  private async findOwnedCheckIn(userId: string, idOrClientId: string): Promise<CheckInRecord> {
    const checkIn =
      (await this.prisma.progressCheckIn.findUnique({
        where: { id: idOrClientId },
        include: CHECK_IN_INCLUDE,
      })) ??
      (await this.prisma.progressCheckIn.findUnique({
        where: { clientEntryId: idOrClientId },
        include: CHECK_IN_INCLUDE,
      }));
    // Same 404 for "missing" and "not yours" so ids can't be probed.
    if (!checkIn || checkIn.userId !== userId) throw new NotFoundException('Check-in not found');
    return checkIn;
  }

  private toPhotoDto(photo: Prisma.ProgressPhotoGetPayload<Record<string, never>>): ProgressPhotoDto {
    return {
      id: photo.id,
      clientPhotoId: photo.clientPhotoId,
      // Prisma and @luki-fitti/common define the same values as distinct enums.
      pose: photo.pose as unknown as ProgressPose,
      kind: photo.kind as unknown as ProgressPhotoKind,
      url: `/api/progress/photos/${photo.id}`,
      mimeType: photo.mimeType,
      sizeBytes: photo.sizeBytes,
      width: photo.width,
      height: photo.height,
      createdAt: photo.createdAt.toISOString(),
    };
  }

  private toDto(checkIn: CheckInRecord): ProgressCheckInDto {
    return {
      id: checkIn.id,
      clientEntryId: checkIn.clientEntryId,
      takenAt: checkIn.takenAt.toISOString(),
      note: checkIn.note,
      bodyWeightClientEntryId: checkIn.bodyWeightClientEntryId,
      createdAt: checkIn.createdAt.toISOString(),
      photos: checkIn.photos.map((p) => this.toPhotoDto(p)),
    };
  }
}
