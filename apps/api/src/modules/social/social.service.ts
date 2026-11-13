import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { logger } from '@luki-fitti/logger';
import { NotificationKind, ReportReason } from '@luki-fitti/common/enums';
import { checkHandle, nextHandleChangeAt, normalizeHandle } from '@luki-fitti/common/utils';
import type {
  FriendInviteDto,
  FriendListsDto,
  HandleAvailabilityDto,
  SocialCardDto,
  SocialProfileDto,
  SocialRelation,
  SocialUserDto,
  UpdateSocialProfileDto,
} from '@luki-fitti/common/schemas';
import type { Prisma } from '@luki-fitti/database';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';
import { NotificationService } from '../notifications/notification.service';
import { FRONTEND_URL } from '@/config/env.config';
import { detectImageType } from '@/utils/image.util';
import { incrementUserCounter } from '@/utils/rate-limit.util';
import { avatarUrlFor, cardFor, resolveRelation, type CardSource } from './relation.util';

const DAY_SECONDS = 24 * 60 * 60;
const MAX_FRIENDS = 500;
const MAX_REQUESTS_PER_DAY = 20;
const MAX_CONTACT_SYNCS_PER_DAY = 5;
const MAX_REPORTS_PER_DAY = 10;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_SIZE_PX = 512;
const INVITE_TTL_MS = 7 * DAY_SECONDS * 1000;
const MAX_AVATAR_INPUT_PIXELS = 50_000_000;

const sha256Hex = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

const pairKey = (a: string, b: string) => (a < b ? ([a, b] as const) : ([b, a] as const));

type UserRow = CardSource;

const CARD_SELECT = {
  id: true,
  handle: true,
  name: true,
  avatarKey: true,
  avatarUpdatedAt: true,
} satisfies Prisma.UserSelect;

/** Prisma unique-constraint violation (P2002). */
function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

export interface SocialServiceDeps {
  /** Redis counter; injectable so unit tests never need a Redis connection. */
  incrementCounter?: (key: string, windowSeconds: number) => Promise<number>;
}

@Injectable()
export class SocialService {
  private readonly incrementCounter: (key: string, windowSeconds: number) => Promise<number>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationService,
    deps: SocialServiceDeps = {},
  ) {
    this.incrementCounter = deps.incrementCounter ?? incrementUserCounter;
  }

  // ── Own profile ────────────────────────────────────────────────────────────

  async getMe(userId: string): Promise<SocialProfileDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        ...CARD_SELECT,
        discoverableByEmail: true,
        socialPaused: true,
        handleChangedAt: true,
      },
    });
    return this.toProfileDto(user);
  }

  private toProfileDto(user: {
    handle: string | null;
    name: string | null;
    avatarKey: string | null;
    avatarUpdatedAt: Date | null;
    discoverableByEmail: boolean;
    socialPaused: boolean;
    handleChangedAt: Date | null;
    id: string;
  }): SocialProfileDto {
    const next = nextHandleChangeAt(user.handleChangedAt);
    return {
      handle: user.handle,
      name: user.name,
      avatarUrl: avatarUrlFor(user),
      discoverableByEmail: user.discoverableByEmail,
      socialPaused: user.socialPaused,
      handleChangeAvailableAt: next && next.getTime() > Date.now() ? next.toISOString() : null,
    };
  }

  async updateMe(userId: string, dto: UpdateSocialProfileDto): Promise<SocialProfileDto> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        handle: true,
        handleChangedAt: true,
        name: true,
        avatarKey: true,
        avatarUpdatedAt: true,
        discoverableByEmail: true,
        socialPaused: true,
      },
    });

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.discoverableByEmail !== undefined) data.discoverableByEmail = dto.discoverableByEmail;
    if (dto.socialPaused !== undefined) data.socialPaused = dto.socialPaused;

    if (dto.handle !== undefined) {
      const check = checkHandle(dto.handle);
      if (!check.ok) throw new BadRequestException(`Handle is not allowed (${check.reason})`);
      const next = nextHandleChangeAt(user.handleChangedAt);
      const changing = check.handle !== user.handle;
      if (changing && next && next.getTime() > Date.now()) {
        throw new ForbiddenException(`Handle can next be changed at ${next.toISOString()}`);
      }
      if (changing) {
        const taken = await this.prisma.user.findUnique({
          where: { handle: check.handle },
          select: { id: true },
        });
        if (taken && taken.id !== userId) throw new ConflictException('Handle is taken');
        data.handle = check.handle;
        data.handleChangedAt = new Date();
      }
    }

    let updated;
    try {
      updated = await this.prisma.user.update({
        where: { id: userId },
        data,
        select: {
          id: true,
          handle: true,
          handleChangedAt: true,
          name: true,
          avatarKey: true,
          avatarUpdatedAt: true,
          discoverableByEmail: true,
          socialPaused: true,
        },
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Handle is taken');
      throw err;
    }
    return this.toProfileDto(updated);
  }

  async handleAvailability(viewerId: string, rawHandle: string): Promise<HandleAvailabilityDto> {
    const check = checkHandle(rawHandle);
    if (!check.ok) return { available: false, reason: check.reason };
    const taken = await this.prisma.user.findUnique({
      where: { handle: check.handle },
      select: { id: true },
    });
    if (taken && taken.id !== viewerId) return { available: false, reason: 'taken' };
    return { available: true };
  }

  // ── Avatar ─────────────────────────────────────────────────────────────────

  async setAvatar(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<SocialProfileDto> {
    if (!file?.buffer?.length || file.size > AVATAR_MAX_BYTES) {
      throw new BadRequestException('Avatar must be an image up to 2 MB');
    }
    if (!this.storage.isConfigured) {
      throw new ServiceUnavailableException('Avatar storage is not configured');
    }
    if (!detectImageType(file.buffer)) {
      throw new BadRequestException('Unsupported image type. Use JPEG, PNG or WebP.');
    }

    // Always re-encode: 512×512 cover JPEG, metadata dropped by sharp. A crafted
    // upload can therefore never be served back as active content.
    let jpeg: Buffer;
    try {
      jpeg = await sharp(file.buffer, {
        limitInputPixels: MAX_AVATAR_INPUT_PIXELS,
        failOn: 'error',
      })
        .rotate()
        .resize(AVATAR_SIZE_PX, AVATAR_SIZE_PX, { fit: 'cover' })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
    } catch {
      throw new BadRequestException('The image could not be read');
    }

    const previous = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatarKey: true },
    });
    const key = `avatars/${userId}/${randomUUID()}.jpg`;
    await this.storage.put(key, jpeg, 'image/jpeg');
    await this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: key, avatarUpdatedAt: new Date() },
    });
    if (previous.avatarKey) await this.storage.deleteMany([previous.avatarKey]);
    return this.getMe(userId);
  }

  async deleteAvatar(userId: string): Promise<SocialProfileDto> {
    const previous = await this.prisma.user.update({
      where: { id: userId },
      data: { avatarKey: null, avatarUpdatedAt: null },
      select: { avatarKey: true },
    });
    if (previous.avatarKey) await this.storage.deleteMany([previous.avatarKey]);
    return this.getMe(userId);
  }

  /** JPEG bytes for `GET /social/avatars/:userId`; 404 hides blocked/unknown users. */
  async getAvatar(viewerId: string, targetUserId: string): Promise<Buffer> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: CARD_SELECT,
    });
    if (!target?.handle || !target.avatarKey) throw new NotFoundException();
    const relation = await this.relation(viewerId, targetUserId);
    if (relation === 'BLOCKED') throw new NotFoundException();
    const { body } = await this.storage.get(target.avatarKey);
    return body;
  }

  // ── Relation resolution (deny by default) ──────────────────────────────────

  private async relationFacts(viewerId: string, targetId: string) {
    const [a, b] = pairKey(viewerId, targetId);
    const [friendship, block] = await Promise.all([
      this.prisma.friendship.findUnique({
        where: { userAId_userBId: { userAId: a, userBId: b } },
        select: { status: true, requestedById: true },
      }),
      this.prisma.userBlock.findFirst({
        where: {
          OR: [
            { blockerId: viewerId, blockedId: targetId },
            { blockerId: targetId, blockedId: viewerId },
          ],
        },
        select: { id: true },
      }),
    ]);
    return { friendship, blocked: block !== null };
  }

  async relation(viewerId: string, targetId: string): Promise<SocialRelation> {
    return resolveRelation(viewerId, targetId, await this.relationFacts(viewerId, targetId));
  }

  /** Card for a target user, or null when invisible (blocked or no handle). */
  private async visibleCard(
    viewerId: string,
    target: UserRow,
  ): Promise<{ card: SocialCardDto; relation: SocialRelation } | null> {
    if (!target.handle) return null;
    const relation = await this.relation(viewerId, target.id);
    if (relation === 'BLOCKED') return null;
    return { card: cardFor(target, relation), relation };
  }

  // ── Discovery ──────────────────────────────────────────────────────────────

  async getUserByHandle(viewerId: string, rawHandle: string): Promise<SocialUserDto> {
    const target = await this.prisma.user.findUnique({
      where: { handle: normalizeHandle(rawHandle) },
      select: CARD_SELECT,
    });
    const visible = target ? await this.visibleCard(viewerId, target) : null;
    if (!visible) throw new NotFoundException('User not found');
    return { ...visible.card, relation: visible.relation as SocialUserDto['relation'] };
  }

  async search(viewerId: string, q: string): Promise<SocialUserDto[]> {
    const blocks = await this.prisma.userBlock.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    });
    const hidden = new Set(
      blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)),
    );
    hidden.add(viewerId);

    const matches = await this.prisma.user.findMany({
      where: { handle: { startsWith: q }, id: { notIn: [...hidden] } },
      select: CARD_SELECT,
      orderBy: { handle: 'asc' },
      take: 20,
    });
    return Promise.all(
      matches.map(async (u) => {
        const relation = await this.relation(viewerId, u.id);
        return { ...cardFor(u, relation), relation: relation as SocialUserDto['relation'] };
      }),
    );
  }

  // ── Friends ────────────────────────────────────────────────────────────────

  async listFriends(viewerId: string): Promise<FriendListsDto> {
    const rows = await this.prisma.friendship.findMany({
      where: { OR: [{ userAId: viewerId }, { userBId: viewerId }] },
      select: {
        status: true,
        requestedById: true,
        userAId: true,
        userBId: true,
        userA: { select: CARD_SELECT },
        userB: { select: CARD_SELECT },
      },
    });

    const dto: FriendListsDto = { friends: [], incoming: [], outgoing: [] };
    for (const row of rows) {
      const other = row.userAId === viewerId ? row.userB : row.userA;
      if (!other.handle) continue; // users without a handle are invisible
      if (row.status === 'ACCEPTED') {
        dto.friends.push({ ...cardFor(other, 'FRIEND') });
      } else if (row.requestedById === viewerId) {
        dto.outgoing.push({ ...cardFor(other, 'NONE') });
      } else {
        dto.incoming.push({ ...cardFor(other, 'NONE') });
      }
    }
    return dto;
  }

  private async friendCount(userId: string): Promise<number> {
    return this.prisma.friendship.count({
      where: {
        status: 'ACCEPTED',
        OR: [{ userAId: userId }, { userBId: userId }],
      },
    });
  }

  async sendRequest(viewerId: string, targetId: string): Promise<{ relation: SocialRelation }> {
    if (viewerId === targetId) throw new BadRequestException('Cannot friend yourself');
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: CARD_SELECT,
    });
    if (!target?.handle) throw new NotFoundException('User not found');

    const [a, b] = pairKey(viewerId, targetId);
    const facts = await this.relationFacts(viewerId, targetId);
    const relation = resolveRelation(viewerId, targetId, facts);

    if (relation === 'BLOCKED') throw new NotFoundException('User not found');
    if (relation === 'FRIEND' || relation === 'OUTGOING') return { relation };

    if (relation === 'INCOMING') {
      // The other side already asked: sending back is an implicit accept.
      await this.acceptPending(viewerId, targetId, facts.friendship!);
      return { relation: 'FRIEND' };
    }

    const count = await this.incrementCounter(`social:freq:${viewerId}`, DAY_SECONDS);
    if (count > MAX_REQUESTS_PER_DAY) {
      throw new HttpException('Too many friend requests today', HttpStatus.TOO_MANY_REQUESTS);
    }
    if ((await this.friendCount(viewerId)) >= MAX_FRIENDS) {
      throw new BadRequestException('Friend limit reached');
    }

    try {
      await this.prisma.friendship.create({
        data: { userAId: a, userBId: b, requestedById: viewerId, status: 'PENDING' },
      });
    } catch (err) {
      if (isUniqueViolation(err)) return { relation: await this.relation(viewerId, targetId) };
      throw err;
    }

    await this.notifications
      .notify(targetId, NotificationKind.FRIEND_REQUEST, viewerId, { url: '/social/friends' })
      .catch((err) => logger.warn(`friend-request notification failed: ${String(err)}`));
    return { relation: 'OUTGOING' };
  }

  private async acceptPending(
    viewerId: string,
    requesterId: string,
    friendship: { status: 'PENDING' | 'ACCEPTED'; requestedById: string },
  ): Promise<void> {
    if (friendship.status !== 'PENDING' || friendship.requestedById !== requesterId) {
      throw new NotFoundException('No incoming request');
    }
    if ((await this.friendCount(viewerId)) >= MAX_FRIENDS) {
      throw new BadRequestException('Friend limit reached');
    }
    const [a, b] = pairKey(viewerId, requesterId);
    await this.prisma.friendship.update({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    await this.notifications
      .notify(requesterId, NotificationKind.FRIEND_ACCEPTED, viewerId, { url: '/social/friends' })
      .catch((err) => logger.warn(`friend-accepted notification failed: ${String(err)}`));
  }

  async acceptRequest(viewerId: string, requesterId: string): Promise<void> {
    const facts = await this.relationFacts(viewerId, requesterId);
    if (facts.blocked) throw new NotFoundException('No incoming request');
    await this.acceptPending(viewerId, requesterId, {
      status: facts.friendship?.status ?? 'PENDING',
      requestedById: facts.friendship?.requestedById ?? '',
    });
  }

  async declineRequest(viewerId: string, requesterId: string): Promise<void> {
    const facts = await this.relationFacts(viewerId, requesterId);
    if (!facts.friendship || facts.friendship.requestedById !== requesterId) {
      throw new NotFoundException('No incoming request');
    }
    if (facts.friendship.status === 'ACCEPTED') throw new NotFoundException('No incoming request');
    const [a, b] = pairKey(viewerId, requesterId);
    await this.prisma.friendship.delete({ where: { userAId_userBId: { userAId: a, userBId: b } } });
  }

  /** Unfriend or cancel an outgoing request. Silent: no error when nothing exists. */
  async removeFriend(viewerId: string, targetId: string): Promise<void> {
    const [a, b] = pairKey(viewerId, targetId);
    await this.prisma.friendship.deleteMany({ where: { userAId: a, userBId: b } });
  }

  // ── Invites ────────────────────────────────────────────────────────────────

  async createInvite(viewerId: string): Promise<FriendInviteDto> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    await this.prisma.friendInvite.create({
      data: { tokenHash: sha256Hex(token), createdById: viewerId, expiresAt },
    });
    return { url: `${FRONTEND_URL}/invite/${token}`, expiresAt: expiresAt.toISOString() };
  }

  private async findValidInvite(token: string) {
    const invite = await this.prisma.friendInvite.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { createdBy: { select: CARD_SELECT } },
    });
    if (!invite || invite.expiresAt < new Date() || invite.uses >= invite.maxUses) return null;
    return invite;
  }

  async previewInvite(viewerId: string, token: string): Promise<SocialUserDto> {
    const invite = await this.findValidInvite(token);
    const visible = invite ? await this.visibleCard(viewerId, invite.createdBy) : null;
    if (!visible) throw new NotFoundException('Invite not found or expired');
    return { ...visible.card, relation: visible.relation as SocialUserDto['relation'] };
  }

  async acceptInvite(viewerId: string, token: string): Promise<{ relation: SocialRelation }> {
    const invite = await this.findValidInvite(token);
    if (!invite) throw new NotFoundException('Invite not found or expired');
    if (invite.createdById === viewerId) {
      throw new BadRequestException('Cannot accept your own invite');
    }

    const inviter = invite.createdBy;
    const relation = await this.relation(viewerId, inviter.id);
    if (relation === 'BLOCKED' || !inviter.handle) throw new NotFoundException('Invite not found');
    if ((await this.friendCount(viewerId)) >= MAX_FRIENDS) {
      throw new BadRequestException('Friend limit reached');
    }

    const [a, b] = pairKey(viewerId, inviter.id);
    await this.prisma.$transaction(async (tx) => {
      // The invite link itself is the inviter's consent — straight to ACCEPTED.
      await tx.friendship.upsert({
        where: { userAId_userBId: { userAId: a, userBId: b } },
        create: {
          userAId: a,
          userBId: b,
          requestedById: inviter.id,
          status: 'ACCEPTED',
          acceptedAt: new Date(),
        },
        update: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
      const bumped = await tx.friendInvite.updateMany({
        where: { id: invite.id, uses: { lt: invite.maxUses } },
        data: { uses: { increment: 1 } },
      });
      if (bumped.count === 0) throw new NotFoundException('Invite is used up');
    });

    if (relation !== 'FRIEND') {
      await this.notifications
        .notify(inviter.id, NotificationKind.FRIEND_ACCEPTED, viewerId, {
          url: '/social/friends',
        })
        .catch((err) => logger.warn(`invite-accepted notification failed: ${String(err)}`));
    }
    return { relation: 'FRIEND' };
  }

  // ── Contact matching ───────────────────────────────────────────────────────

  /**
   * Hashes are matched in memory and discarded — never logged, never persisted.
   * Only opted-in users (discoverableByEmail) with a handle are returned.
   */
  async matchContacts(viewerId: string, hashes: string[]): Promise<SocialUserDto[]> {
    const count = await this.incrementCounter(`social:cmatch:${viewerId}`, DAY_SECONDS);
    if (count > MAX_CONTACT_SYNCS_PER_DAY) {
      throw new HttpException('Contact sync limit reached', HttpStatus.TOO_MANY_REQUESTS);
    }
    const unique = [...new Set(hashes)];
    const matches = await this.prisma.user.findMany({
      where: {
        emailLookupHash: { in: unique },
        discoverableByEmail: true,
        handle: { not: null },
        id: { not: viewerId },
      },
      select: CARD_SELECT,
    });

    const results: SocialUserDto[] = [];
    for (const match of matches) {
      const visible = await this.visibleCard(viewerId, match);
      if (visible) {
        results.push({
          ...visible.card,
          relation: visible.relation as SocialUserDto['relation'],
        });
      }
    }
    return results;
  }

  // ── Blocks ─────────────────────────────────────────────────────────────────

  async listBlocks(viewerId: string) {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId: viewerId },
      include: { blocked: { select: CARD_SELECT } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      userId: r.blockedId,
      handle: r.blocked.handle,
      avatarUrl: avatarUrlFor(r.blocked),
      blockedAt: r.createdAt.toISOString(),
    }));
  }

  /** Blocking removes any friendship/request between the pair in the same transaction. */
  async createBlock(viewerId: string, targetId: string): Promise<void> {
    if (viewerId === targetId) throw new BadRequestException('Cannot block yourself');
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found');

    const [a, b] = pairKey(viewerId, targetId);
    await this.prisma.$transaction([
      this.prisma.userBlock.upsert({
        where: { blockerId_blockedId: { blockerId: viewerId, blockedId: targetId } },
        create: { blockerId: viewerId, blockedId: targetId },
        update: {},
      }),
      this.prisma.friendship.deleteMany({ where: { userAId: a, userBId: b } }),
    ]);
  }

  async deleteBlock(viewerId: string, targetId: string): Promise<void> {
    await this.prisma.userBlock.deleteMany({
      where: { blockerId: viewerId, blockedId: targetId },
    });
  }

  // ── Reports ────────────────────────────────────────────────────────────────

  async createReport(
    viewerId: string,
    targetId: string,
    reason: ReportReason,
    details?: string,
  ): Promise<{ id: string }> {
    if (viewerId === targetId) throw new BadRequestException('Cannot report yourself');
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, handle: true, name: true, avatarKey: true },
    });
    if (!target) throw new NotFoundException('User not found');

    const count = await this.incrementCounter(`social:report:${viewerId}`, DAY_SECONDS);
    if (count > MAX_REPORTS_PER_DAY) {
      throw new HttpException('Report limit reached', HttpStatus.TOO_MANY_REQUESTS);
    }

    const report = await this.prisma.userReport.create({
      data: {
        reporterId: viewerId,
        reportedId: targetId,
        reason,
        details,
        handleSnapshot: target.handle,
        nameSnapshot: target.name,
        avatarKeySnapshot: target.avatarKey,
      },
      select: { id: true },
    });
    return report;
  }
}
