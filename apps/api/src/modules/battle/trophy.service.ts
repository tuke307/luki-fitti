import { Injectable, NotFoundException } from '@nestjs/common';
import { TrophyKind } from '@luki-fitti/common/enums';
import type { TrophyListDto } from '@luki-fitti/common/schemas';
import { PrismaService } from '../database/prisma.service';
import { relationBetween } from './battle.util';

@Injectable()
export class TrophyService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /trophies/:userId — the shelf is visible to the owner and friends only. */
  async list(viewerId: string, userId: string): Promise<TrophyListDto> {
    const relation = await relationBetween(this.prisma, viewerId, userId);
    if (relation !== 'SELF' && relation !== 'FRIEND') {
      throw new NotFoundException('User not found');
    }
    const trophies = await this.prisma.trophy.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const counts: TrophyListDto['counts'] = {};
    for (const t of trophies) {
      const kind = t.kind as TrophyKind;
      counts[kind] = (counts[kind] ?? 0) + 1;
    }
    return {
      items: trophies.map((t) => ({
        kind: t.kind as TrophyKind,
        refId: t.refId,
        tier: t.tier,
        createdAt: t.createdAt.toISOString(),
      })),
      counts,
    };
  }
}
