import { z } from 'zod';
import { ApiKeyScope } from '../enums';

// ─────────────────────────────────────────────────────────────────────────────
// Personal API keys: session-authenticated management routes (/api/api-keys)
// ─────────────────────────────────────────────────────────────────────────────

export const CreateApiKeySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40),
  scopes: z
    .array(z.enum(ApiKeyScope))
    .nonempty('Select at least one scope')
    .refine((scopes) => new Set(scopes).size === scopes.length, 'Scopes must be unique'),
  /** Days until the key expires; `null` = no expiry. Default 90. */
  expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]).default(90),
  /** Re-authentication: creating a long-lived credential requires the password. */
  currentPassword: z.string().min(1, 'Current password is required'),
});
export type CreateApiKeyDto = z.infer<typeof CreateApiKeySchema>;

export interface ApiKeyDto {
  /** The 8-char public id (lookup key; the full secret is never stored). */
  id: string;
  /** `lf_pat_<id>` — the display prefix. */
  prefix: string;
  name: string;
  scopes: ApiKeyScope[];
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  status: 'active' | 'expired';
}

export interface ApiKeyListDto {
  /** Global kill switch; when false the create UI is hidden. */
  enabled: boolean;
  keys: ApiKeyDto[];
}

/** Returned exactly once on creation — `key` is never stored or shown again. */
export interface CreatedApiKeyDto {
  apiKey: ApiKeyDto;
  key: string;
}
