import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { logger } from '@luki-fitti/logger';
import { NotificationKind, RaidDifficulty, SquadRole } from '@luki-fitti/common/enums';
import { RAID_BOSSES } from '@luki-fitti/common/raid';
import { isNameAllowed, berlinDayKey, berlinWeekKey, weekBounds } from '@luki-fitti/common/utils';
import type { RaidDto, SquadDto, SquadInviteDto, SquadListDto } from '@luki-fitti/common/schemas';
import { PrismaService } from '../database/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { cardBetween, relationBetween } from '../battle/battle.util';
import { cardFor } from '../social/relation.util';
import { RaidService, type RaidRow } from './raid.service';

const MAX_SQUADS_PER_USER = 3;
const MAX_MEMBERS = 10;
const TX_OPTIONS = { maxWait: 10_000, timeout: 60_000 } as const;

/** HP per member per raid difficulty, before the mid-week ratio. */
const HP_PER_MEMBER: Record<RaidDifficulty, number> = {
  [RaidDifficulty.NORMAL]: 300,
  [RaidDifficulty.HARD]: 450,
  [RaidDifficulty.HEROIC]: 600,
};

/** Whole Berlin days left in the current week, including today. */
function daysLeftInWeek(now: Date): number {
  const today = berlinDayKey(now);
  const weekday = (Date.parse(`${today}T00:00:00.000Z`) / 86_400_000 + 3) % 7; // 1970-01-05 = Monday
  return Math.max(1, 7 - Math.floor(weekday));
}

@Injectable()
export class SquadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly raids: RaidService,
  ) {}

  /** POST /squads — the creator becomes OWNER. */
  async create(userId: string, name: string): Promise<SquadDto> {
    if (!isNameAllowed(name)) {
      throw new BadRequestException('Squad name is not allowed');
    }
    const count = await this.prisma.squadMember.count({ where: { userId } });
    if (count >= MAX_SQUADS_PER_USER) {
      throw new ConflictException(`You can be in at most ${MAX_SQUADS_PER_USER} squads`);
    }
    const squad = await this.prisma.squad.create({
      data: {
        name,
        createdById: userId,
        members: { create: { userId, role: 'OWNER' } },
      },
      include: { members: { include: { user: true } } },
    });
    return this.dto(squad, userId);
  }

  /** GET /squads — my squads (member cards filtered per viewer) + my invites. */
  async list(userId: string): Promise<SquadListDto> {
    const [memberships, invites] = await Promise.all([
      this.prisma.squadMember.findMany({
        where: { userId },
        include: {
          squad: {
            include: {
              members: {
                orderBy: { joinedAt: 'asc' },
                include: { user: true },
              },
            },
          },
        },
      }),
      this.prisma.squadInvite.findMany({
        where: { invitedId: userId },
        include: { squad: true, invitedBy: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const squads: SquadDto[] = [];
    for (const m of memberships) {
      squads.push(await this.dto(m.squad, userId, m.role));
    }

    const inviteDtos: SquadInviteDto[] = [];
    for (const invite of invites) {
      const card = await cardBetween(this.prisma, userId, invite.invitedBy);
      if (!card) continue; // blocked inviters never surface
      inviteDtos.push({
        id: invite.id,
        squadId: invite.squadId,
        squadName: invite.squad.name,
        invitedBy: card,
        createdAt: invite.createdAt.toISOString(),
      });
    }
    return { squads, invites: inviteDtos };
  }

  /** POST /squads/:id/invites — OWNER invites one of their friends. */
  async invite(userId: string, squadId: string, invitedId: string): Promise<{ invited: true }> {
    const squad = await this.ownedSquad(userId, squadId);
    if (invitedId === userId) throw new BadRequestException('You are already in this squad');
    const relation = await relationBetween(this.prisma, userId, invitedId);
    if (relation !== 'FRIEND') {
      throw new BadRequestException('You can only invite friends to a squad');
    }
    const [member, members] = await Promise.all([
      this.prisma.squadMember.findUnique({
        where: { squadId_userId: { squadId, userId: invitedId } },
      }),
      this.prisma.squadMember.count({ where: { squadId } }),
    ]);
    if (member) throw new ConflictException('Already a member');
    if (members >= MAX_MEMBERS) throw new ConflictException('Squad is full');
    const squadsOfInvited = await this.prisma.squadMember.count({
      where: { userId: invitedId },
    });
    if (squadsOfInvited >= MAX_SQUADS_PER_USER) {
      throw new ConflictException('This friend is already in too many squads');
    }
    await this.prisma.squadInvite.upsert({
      where: { squadId_invitedId: { squadId, invitedId } },
      update: { invitedById: userId, createdAt: new Date() },
      create: { squadId, invitedId, invitedById: userId },
    });
    await this.notify(invitedId, NotificationKind.SQUAD_INVITE, userId, {
      squadName: squad.name,
      url: '/social/raids',
    });
    return { invited: true };
  }

  /** POST /squads/:id/invites/accept — the invited user joins. */
  async acceptInvite(userId: string, squadId: string): Promise<{ joined: true }> {
    const invite = await this.prisma.squadInvite.findUnique({
      where: { squadId_invitedId: { squadId, invitedId: userId } },
    });
    if (!invite) throw new NotFoundException('Invite not found');
    const [squadsOfUser, members] = await Promise.all([
      this.prisma.squadMember.count({ where: { userId } }),
      this.prisma.squadMember.count({ where: { squadId } }),
    ]);
    if (squadsOfUser >= MAX_SQUADS_PER_USER) {
      throw new ConflictException(`You can be in at most ${MAX_SQUADS_PER_USER} squads`);
    }
    if (members >= MAX_MEMBERS) throw new ConflictException('Squad is full');
    await this.prisma.$transaction(async (tx) => {
      await tx.squadMember.create({ data: { squadId, userId, role: 'MEMBER' } });
      await tx.squadInvite.delete({ where: { id: invite.id } });
    }, TX_OPTIONS);
    return { joined: true };
  }

  /** POST /squads/:id/invites/decline — silent. */
  async declineInvite(userId: string, squadId: string): Promise<{ declined: true }> {
    await this.prisma.squadInvite.deleteMany({
      where: { squadId, invitedId: userId },
    });
    return { declined: true };
  }

  /**
   * POST /squads/:id/leave — an owner hands OWNER to the longest member; the
   * last member's leave deletes the squad.
   */
  async leave(userId: string, squadId: string): Promise<{ left: true }> {
    const member = await this.prisma.squadMember.findUnique({
      where: { squadId_userId: { squadId, userId } },
    });
    if (!member) throw new NotFoundException('Squad not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.squadMember.delete({ where: { squadId_userId: { squadId, userId } } });
      if ((member.role as SquadRole) === 'OWNER') {
        const next = await tx.squadMember.findFirst({
          where: { squadId },
          orderBy: { joinedAt: 'asc' },
        });
        if (next) {
          await tx.squadMember.update({
            where: { squadId_userId: { squadId, userId: next.userId } },
            data: { role: 'OWNER' },
          });
        } else {
          await tx.squad.delete({ where: { id: squadId } });
        }
      }
    }, TX_OPTIONS);
    return { left: true };
  }

  /** DELETE /squads/:id/members/:userId — OWNER kicks a non-owner member. */
  async kick(userId: string, squadId: string, targetId: string): Promise<{ kicked: true }> {
    await this.ownedSquad(userId, squadId);
    const target = await this.prisma.squadMember.findUnique({
      where: { squadId_userId: { squadId, userId: targetId } },
    });
    if (!target) throw new NotFoundException('Member not found');
    if ((target.role as SquadRole) === 'OWNER') {
      throw new BadRequestException('The owner cannot be kicked');
    }
    await this.prisma.squadMember.delete({
      where: { squadId_userId: { squadId, userId: targetId } },
    });
    return { kicked: true };
  }

  /** PATCH /squads/:id — OWNER renames (same profanity rules as handles). */
  async rename(userId: string, squadId: string, name: string): Promise<{ renamed: true }> {
    await this.ownedSquad(userId, squadId);
    if (!isNameAllowed(name)) {
      throw new BadRequestException('Squad name is not allowed');
    }
    await this.prisma.squad.update({ where: { id: squadId }, data: { name } });
    return { renamed: true };
  }

  /** DELETE /squads/:id — OWNER deletes; raids cascade. */
  async remove(userId: string, squadId: string): Promise<{ deleted: true }> {
    await this.ownedSquad(userId, squadId);
    await this.prisma.squad.delete({ where: { id: squadId } });
    return { deleted: true };
  }

  /**
   * POST /squads/:id/raids — OWNER starts this week's raid. One per squad per
   * week (unique index), at least 2 members; HP scales with the days left.
   */
  async startRaid(
    userId: string,
    squadId: string,
    bossSlug: string,
    difficulty: RaidDifficulty,
  ): Promise<RaidDto> {
    const squad = await this.ownedSquad(userId, squadId);
    if (!RAID_BOSSES.some((b) => b.slug === bossSlug)) {
      throw new BadRequestException('Unknown raid boss');
    }
    const members = await this.prisma.squadMember.findMany({
      where: { squadId },
      select: { userId: true },
    });
    if (members.length < 2) {
      throw new BadRequestException('A squad raid needs at least 2 members');
    }
    const weekKey = berlinWeekKey(new Date());
    const { start, end } = weekBounds(weekKey);
    const ratio = daysLeftInWeek(new Date()) / 7;
    const maxHp = Math.ceil(members.length * HP_PER_MEMBER[difficulty] * ratio);
    let raid;
    try {
      raid = await this.prisma.raid.create({
        data: {
          kind: 'SQUAD',
          squadId,
          bossSlug,
          difficulty,
          weekKey,
          startsAt: start,
          endsAt: end,
          maxHp,
        },
        include: { squad: { select: { id: true, name: true } } },
      });
    } catch {
      // The unique (kind, weekKey, squadId) index rejects a second raid.
      throw new ConflictException('This squad already has a raid this week');
    }
    for (const m of members) {
      if (m.userId === userId) continue;
      await this.notify(m.userId, NotificationKind.SQUAD_RAID_STARTED, userId, {
        squadName: squad.name,
        bossSlug,
        url: '/social/raids',
      });
    }
    return this.raids.dto(raid as RaidRow, userId);
  }

  /** Squad owned by the caller, or 404/403. */
  private async ownedSquad(userId: string, squadId: string) {
    const squad = await this.prisma.squad.findUnique({ where: { id: squadId } });
    if (!squad) throw new NotFoundException('Squad not found');
    const member = await this.prisma.squadMember.findUnique({
      where: { squadId_userId: { squadId, userId } },
    });
    if (!member) throw new NotFoundException('Squad not found');
    if ((member.role as SquadRole) !== 'OWNER') {
      throw new ForbiddenException('Only the squad owner can do this');
    }
    return squad;
  }

  private async dto(
    squad: {
      id: string;
      name: string;
      members: Array<{ userId: string; role: string; joinedAt: Date; user: unknown }>;
    },
    viewerId: string,
    role?: string,
  ): Promise<SquadDto> {
    const members: SquadDto['members'] = [];
    for (const m of squad.members) {
      const relation = await relationBetween(this.prisma, viewerId, m.userId);
      if (relation === 'BLOCKED') continue; // blocked members invisible per viewer
      members.push({
        card: cardFor(m.user as Parameters<typeof cardFor>[0], relation),
        role: m.role as SquadRole,
        joinedAt: m.joinedAt.toISOString(),
      });
    }
    const mine = squad.members.find((m) => m.userId === viewerId);
    const myRole = String(role ?? mine?.role ?? 'MEMBER') as SquadRole;
    return {
      id: squad.id,
      name: squad.name,
      role: myRole,
      members,
    };
  }

  private async notify(
    userId: string,
    kind: NotificationKind,
    actorId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.notifications
      .notify(userId, kind, actorId, payload)
      .catch((err) => logger.warn(`squad notification ${kind} failed: ${String(err)}`));
  }
}
