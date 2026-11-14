import { z } from 'zod';
import { RaidDifficulty, RaidKind, RaidStatus, SquadRole } from '../enums';
import type { SocialCardDto } from './social.schemas';
import type { WeakSpot } from '../raid/raid-bosses';

// ─────────────────────────────────────────────────────────────────────────────
// Raids
// ─────────────────────────────────────────────────────────────────────────────

export const RaidPhasesSchema = z.number().int().min(0).max(3);

export interface RaidDto {
  id: string;
  kind: RaidKind;
  /** Only for SQUAD raids. */
  squad: { id: string; name: string } | null;
  bossSlug: string;
  /** Only for SQUAD raids. */
  difficulty: RaidDifficulty | null;
  weekKey: string;
  endsAt: string;
  maxHp: number;
  damage: number;
  /** 0–3 enrage thresholds crossed (75/50/25 % HP). */
  phase: number;
  status: RaidStatus;
  defeatedAt: string | null;
  /** The caller's total damage in this raid. */
  yourDamage: number;
  /** Hitter who landed the final blow, once DEFEATED. */
  finalBlow: SocialCardDto | null;
}

export type RaidOutcome = 'DEFEATED' | 'ESCAPED';

export interface RaidResultDto {
  raidId: string;
  outcome: RaidOutcome;
  bossSlug: string;
  bossName: string;
  /** 1–3 for crowned participants, null otherwise. */
  crownRank: number | null;
  finalBlow: boolean;
  /** The caller's total damage in that raid. */
  you: number;
}

export interface RaidListDto {
  community: RaidDto | null;
  squads: RaidDto[];
  /** Finished raids the caller participated in and has not seen yet. */
  pendingResults: RaidResultDto[];
}

export interface RaidTopEntryDto {
  card: SocialCardDto;
  damage: number;
  rank: number;
}

export interface RaidDetailDto extends RaidDto {
  top: RaidTopEntryDto[];
  you: { damage: number; rank: number | null; trophies: number };
}

export interface RaidFeedHitDto {
  card: SocialCardDto;
  damage: number;
  weakSpotDamage: number;
  /** Only for SELF/FRIEND hits — strangers never see workout content. */
  topExercise: string | null;
  at: string;
}

export interface RaidFeedDto {
  items: RaidFeedHitDto[];
  nextCursor: string | null;
}

export interface RaidBossDto {
  slug: string;
  name: { en: string; de: string };
  lore: { en: string; de: string };
  weakTo: WeakSpot[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Squads
// ─────────────────────────────────────────────────────────────────────────────

export const CreateSquadSchema = z.object({
  name: z.string().trim().min(1).max(30),
});
export type CreateSquadDto = z.infer<typeof CreateSquadSchema>;

export const RenameSquadSchema = CreateSquadSchema;
export type RenameSquadDto = CreateSquadDto;

export const CreateSquadInviteSchema = z.object({
  userId: z.string().uuid(),
});
export type CreateSquadInviteDto = z.infer<typeof CreateSquadInviteSchema>;

export const StartSquadRaidSchema = z.object({
  bossSlug: z.string().min(1),
  difficulty: z.enum(RaidDifficulty),
});
export type StartSquadRaidDto = z.infer<typeof StartSquadRaidSchema>;

export interface SquadMemberDto {
  card: SocialCardDto;
  role: SquadRole;
  joinedAt: string;
}

export interface SquadInviteDto {
  id: string;
  squadId: string;
  squadName: string;
  invitedBy: SocialCardDto;
  createdAt: string;
}

export interface SquadDto {
  id: string;
  name: string;
  role: SquadRole;
  members: SquadMemberDto[];
}

export interface SquadListDto {
  squads: SquadDto[];
  /** Invites addressed to the caller. */
  invites: SquadInviteDto[];
}
