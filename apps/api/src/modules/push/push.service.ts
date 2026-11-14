import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  DeletePushDeviceDto,
  PushConfigDto,
  PushPreferencesDto,
  RegisterPushDeviceDto,
  UpdatePushPreferencesDto,
} from '@luki-fitti/common/schemas';
import { PrismaService } from '../database/prisma.service';
import { VAPID_PUBLIC_KEY } from '@/config/env.config';
import { apnsConfigured, webPushConfigured } from './push-config';

const MAX_DEVICES_PER_USER = 10;

@Injectable()
export class PushService {
  constructor(private readonly prisma: PrismaService) {}

  getConfig(): PushConfigDto {
    return {
      webPushPublicKey: webPushConfigured() ? VAPID_PUBLIC_KEY : null,
      apnsConfigured: apnsConfigured(),
    };
  }

  /**
   * Upsert by token: a device token belongs to one installation, so re-registering
   * (or a different user signing in on the same device) moves the row to the
   * current user instead of duplicating.
   */
  async registerDevice(userId: string, dto: RegisterPushDeviceDto): Promise<{ id: string }> {
    const device = await this.prisma.pushDevice.upsert({
      where: { token: dto.token },
      create: {
        userId,
        platform: dto.platform,
        token: dto.token,
        p256dh: dto.p256dh ?? null,
        auth: dto.auth ?? null,
        apnsSandbox: dto.apnsSandbox ?? false,
        locale: dto.locale,
        timeZone: dto.timeZone,
      },
      update: {
        userId,
        platform: dto.platform,
        p256dh: dto.p256dh ?? null,
        auth: dto.auth ?? null,
        apnsSandbox: dto.apnsSandbox ?? false,
        locale: dto.locale,
        timeZone: dto.timeZone,
        lastSeenAt: new Date(),
      },
      select: { id: true },
    });

    // Cap the registry: keep at most 10 devices per user, evicting the stalest.
    const stale = await this.prisma.pushDevice.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      skip: MAX_DEVICES_PER_USER,
      select: { id: true },
    });
    if (stale.length > 0) {
      await this.prisma.pushDevice.deleteMany({ where: { id: { in: stale.map((d) => d.id) } } });
    }
    return device;
  }

  async deleteDevice(userId: string, dto: DeletePushDeviceDto): Promise<void> {
    const result = await this.prisma.pushDevice.deleteMany({
      where: { token: dto.token, userId },
    });
    if (result.count === 0) throw new NotFoundException('Device not found');
  }

  async getPreferences(userId: string): Promise<PushPreferencesDto> {
    const prefs = await this.prisma.userPreferences.findUnique({
      where: { userId },
      select: { pushFriends: true },
    });
    return { friends: prefs?.pushFriends ?? true };
  }

  async updatePreferences(
    userId: string,
    dto: UpdatePushPreferencesDto,
  ): Promise<PushPreferencesDto> {
    const prefs = await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, ...(dto.friends !== undefined ? { pushFriends: dto.friends } : {}) },
      update: { ...(dto.friends !== undefined ? { pushFriends: dto.friends } : {}) },
      select: { pushFriends: true },
    });
    return { friends: prefs.pushFriends };
  }
}
