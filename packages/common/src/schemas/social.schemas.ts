import { z } from 'zod';
import { NotificationKind, PushPlatform, ReportReason, ReportStatus } from '../enums';
import { HANDLE_REGEX, isWebPushEndpointAllowed } from '../utils/social.util';

// ─────────────────────────────────────────────────────────────────────────────
// Social: profile, friends, invites, contacts, blocks, reports
// ─────────────────────────────────────────────────────────────────────────────

/** Viewer → target relation, resolved server-side. BLOCKED never reaches the client. */
export type SocialRelation = 'SELF' | 'FRIEND' | 'INCOMING' | 'OUTGOING' | 'NONE' | 'BLOCKED';

export const UpdateSocialProfileSchema = z.object({
  handle: z.string().trim().toLowerCase().regex(HANDLE_REGEX).optional(),
  name: z.string().trim().min(1).max(40).optional(),
  discoverableByEmail: z.boolean().optional(),
  socialPaused: z.boolean().optional(),
});
export type UpdateSocialProfileDto = z.infer<typeof UpdateSocialProfileSchema>;

export interface SocialProfileDto {
  handle: string | null;
  name: string | null;
  avatarUrl: string | null;
  discoverableByEmail: boolean;
  socialPaused: boolean;
  /** ISO date until which the handle is locked (null = changeable now). */
  handleChangeAvailableAt: string | null;
}

export type HandleUnavailableReason = 'invalid' | 'reserved' | 'blocked' | 'taken';

export interface HandleAvailabilityDto {
  available: boolean;
  reason?: HandleUnavailableReason;
}

/** Public card — the only shape strangers ever see. `name` is friends/self-only. */
export interface SocialCardDto {
  userId: string;
  handle: string;
  avatarUrl: string | null;
  name?: string | null;
}

export interface SocialUserDto extends SocialCardDto {
  relation: Exclude<SocialRelation, 'BLOCKED'>;
}

export interface FriendListsDto {
  friends: SocialCardDto[];
  incoming: SocialCardDto[];
  outgoing: SocialCardDto[];
}

export const FriendRequestSchema = z.object({
  userId: z.string().uuid(),
});
export type FriendRequestDto = z.infer<typeof FriendRequestSchema>;

export interface FriendInviteDto {
  url: string;
  expiresAt: string;
}

export const ContactMatchSchema = z.object({
  hashes: z
    .array(
      z
        .string()
        .toLowerCase()
        .regex(/^[0-9a-f]{64}$/),
    )
    .min(1)
    .max(2000),
});
export type ContactMatchDto = z.infer<typeof ContactMatchSchema>;

export const SocialSearchQuerySchema = z.object({
  // Handle characters only (an optional leading @ is dropped), so the prefix search
  // never receives LIKE wildcards such as `%`.
  q: z
    .string()
    .trim()
    .toLowerCase()
    .transform((q) => q.replace(/^@/, ''))
    .pipe(z.string().regex(/^[a-z0-9_]{2,20}$/)),
});
export type SocialSearchQueryDto = z.infer<typeof SocialSearchQuerySchema>;

export const CreateBlockSchema = z.object({
  userId: z.string().uuid(),
});
export type CreateBlockDto = z.infer<typeof CreateBlockSchema>;

export const CreateReportSchema = z.object({
  userId: z.string().uuid(),
  reason: z.enum(ReportReason),
  details: z.string().trim().max(500).optional(),
});
export type CreateReportDto = z.infer<typeof CreateReportSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Push: device registry, preferences, config
// ─────────────────────────────────────────────────────────────────────────────

export const RegisterPushDeviceSchema = z
  .object({
    platform: z.enum(PushPlatform),
    /** APNs hex token or Web Push endpoint URL. */
    token: z.string().trim().min(8).max(4096),
    p256dh: z.string().trim().min(1).max(512).optional(),
    auth: z.string().trim().min(1).max(512).optional(),
    apnsSandbox: z.boolean().default(false).optional(),
    locale: z.string().trim().min(2).max(20),
    timeZone: z.string().trim().min(1).max(64),
  })
  // The endpoint is stored and later POSTed to, so it must be an https URL of a
  // known push service — anything else would be an SSRF primitive.
  .superRefine((value, ctx) => {
    if (value.platform === PushPlatform.WEBPUSH && !isWebPushEndpointAllowed(value.token)) {
      ctx.addIssue({
        code: 'custom',
        path: ['token'],
        message: 'Web Push token must be an https URL of a known push service',
      });
    }
  });
export type RegisterPushDeviceDto = z.infer<typeof RegisterPushDeviceSchema>;

export const DeletePushDeviceSchema = z.object({
  token: z.string().trim().min(8).max(4096),
});
export type DeletePushDeviceDto = z.infer<typeof DeletePushDeviceSchema>;

export interface PushConfigDto {
  webPushPublicKey: string | null;
  apnsConfigured: boolean;
}

export const UpdatePushPreferencesSchema = z.object({
  friends: z.boolean().optional(),
  leagues: z.boolean().optional(),
  duels: z.boolean().optional(),
  streaks: z.boolean().optional(),
});
export type UpdatePushPreferencesDto = z.infer<typeof UpdatePushPreferencesSchema>;

export interface PushPreferencesDto {
  friends: boolean;
  leagues: boolean;
  duels: boolean;
  streaks: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications inbox
// ─────────────────────────────────────────────────────────────────────────────

export const NotificationsQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type NotificationsQueryDto = z.infer<typeof NotificationsQuerySchema>;

export interface NotificationDto {
  id: string;
  kind: NotificationKind;
  /** Resolved actor card; null for system notifications or blocked/deleted actors. */
  actor: SocialCardDto | null;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListDto {
  items: NotificationDto[];
  unreadCount: number;
  nextCursor: string | null;
}

export const MarkNotificationsReadSchema = z
  .object({
    ids: z.array(z.string().uuid()).max(200).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => (v.ids && v.ids.length > 0) || v.all === true, {
    message: 'Provide ids or all: true',
  });
export type MarkNotificationsReadDto = z.infer<typeof MarkNotificationsReadSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Admin: social settings + report queue
// ─────────────────────────────────────────────────────────────────────────────

export const UpdateSocialSettingsSchema = z.object({
  socialEnabled: z.boolean().optional(),
  socialBetaUserIds: z.array(z.string().uuid()).max(10_000).optional(),
});
export type UpdateSocialSettingsDto = z.infer<typeof UpdateSocialSettingsSchema>;

export interface SocialSettingsDto {
  socialEnabled: boolean;
  socialBetaUserIds: string[];
}

export const AdminReportsQuerySchema = z.object({
  status: z.enum(ReportStatus).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdminReportsQueryDto = z.infer<typeof AdminReportsQuerySchema>;

export const ResolveReportSchema = z.object({
  status: z.enum([ReportStatus.RESOLVED, ReportStatus.DISMISSED] as const),
  /** Optional moderation action applied to the reported user. */
  action: z.enum(['CLEAR_AVATAR', 'RESET_HANDLE']).optional(),
});
export type ResolveReportDto = z.infer<typeof ResolveReportSchema>;

export interface AdminReportDto {
  id: string;
  reporterId: string;
  reportedId: string;
  reason: ReportReason;
  details: string | null;
  handleSnapshot: string | null;
  nameSnapshot: string | null;
  avatarKeySnapshot: string | null;
  status: ReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  resolvedById: string | null;
}

export interface AdminReportListDto {
  items: AdminReportDto[];
  total: number;
  page: number;
  limit: number;
}
