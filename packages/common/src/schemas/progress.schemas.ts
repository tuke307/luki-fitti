import { z } from 'zod';
import { ProgressPhotoKind, ProgressPose } from '../enums';

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
export const AttachProgressPhotoSchema = z.object({
  clientPhotoId: z.string().min(8).max(64),
  pose: z.enum(ProgressPose),
  kind: z.enum(ProgressPhotoKind).default(ProgressPhotoKind.PHOTO),
});
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
