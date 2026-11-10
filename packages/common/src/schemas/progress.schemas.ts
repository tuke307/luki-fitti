import { z } from 'zod';
import { BODY_GOALS, ProgressPhotoKind, ProgressPose } from '../enums';

// ─────────────────────────────────────────────────────────────────────────────
// Progress: dated body check-ins with pose photos (cloud backup is opt-in)
// ─────────────────────────────────────────────────────────────────────────────

const isoDateTime = z.iso.datetime({ offset: true });

export const UpsertProgressCheckInSchema = z.object({
  clientEntryId: z.string().min(8).max(64),
  takenAt: isoDateTime,
  note: z.string().trim().max(500).nullable().optional(),
  /** The BodyWeightEntry created for this check-in's weight (client-side). */
  bodyWeightClientEntryId: z.string().min(8).max(64).nullable().optional(),
});
export type UpsertProgressCheckInDto = z.infer<typeof UpsertProgressCheckInSchema>;

export const ProgressCheckInRangeQuerySchema = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
});
export type ProgressCheckInRangeQueryDto = z.infer<typeof ProgressCheckInRangeQuerySchema>;

/** Multipart form fields next to the `photo` file on POST .../photos. */
export const AttachProgressPhotoSchema = z
  .object({
    clientPhotoId: z.string().min(8).max(64),
    pose: z.enum(ProgressPose),
    kind: z.enum(ProgressPhotoKind).default(ProgressPhotoKind.PHOTO),
    /** AI provenance, only valid on kind=AI_TARGET uploads. */
    aiModel: z.string().max(100).optional(),
    aiGoal: z.enum(BODY_GOALS).optional(),
    aiHorizonMonths: z.union([z.literal(3), z.literal(6), z.literal(12)]).optional(),
  })
  .refine(
    (v) =>
      v.kind === ProgressPhotoKind.AI_TARGET ||
      (v.aiModel === undefined && v.aiGoal === undefined && v.aiHorizonMonths === undefined),
    { message: 'ai fields are only allowed for kind=AI_TARGET' },
  );
export type AttachProgressPhotoDto = z.infer<typeof AttachProgressPhotoSchema>;

export const ProgressPhotoDtoSchema = z.object({
  id: z.string(),
  clientPhotoId: z.string(),
  pose: z.enum(ProgressPose),
  kind: z.enum(ProgressPhotoKind),
  /** Authenticated stream URL: /api/progress/photos/:id — not a public link. */
  url: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  createdAt: z.string(),
});
export type ProgressPhotoDto = z.infer<typeof ProgressPhotoDtoSchema>;

export const ProgressCheckInDtoSchema = z.object({
  id: z.string(),
  clientEntryId: z.string(),
  takenAt: z.string(),
  note: z.string().nullable().optional(),
  bodyWeightClientEntryId: z.string().nullable().optional(),
  createdAt: z.string(),
  photos: z.array(ProgressPhotoDtoSchema),
});
export type ProgressCheckInDto = z.infer<typeof ProgressCheckInDtoSchema>;

// ─── Progress target: AI-edited "future you" image ───

const MAX_TARGET_IMAGE_BYTES = 6 * 1024 * 1024;

export const ProgressTargetRequestSchema = z.object({
  imageBase64: z
    .string()
    .refine(
      (v) => {
        try {
          return Buffer.from(v, 'base64').length <= MAX_TARGET_IMAGE_BYTES;
        } catch {
          return false;
        }
      },
      { message: 'imageBase64 must be base64-encoded JPEG under 6 MB' },
    ),
  goal: z.enum(BODY_GOALS),
  horizonMonths: z.union([z.literal(3), z.literal(6), z.literal(12)]),
  /** FRONT only for now; kept in the schema so other poses can come later. */
  pose: z.literal(ProgressPose.FRONT).default(ProgressPose.FRONT),
});
export type ProgressTargetRequestDto = z.infer<typeof ProgressTargetRequestSchema>;

export interface ProgressTargetResponseDto {
  imageBase64: string;
  mimeType: string;
  model: string;
  costUsd: number | null;
  runId: string;
}
