import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { AI_MODEL_ID_PATTERN, type AiModelInfoDto } from '@luki-fitti/common/schemas';
import { OPENROUTER_BASE_URL } from '@/config/env.config';

const MODELS_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
/** After a failed refresh, wait this long before trying again (keeps serving the last list). */
const RETRY_AFTER_FAILURE_MS = 5 * 60 * 1000;
const MAX_MODELS = 2000;

/** OpenRouter prices are decimal strings in USD per token (or per image). */
const PriceSchema = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) {
    ctx.addIssue({ code: 'custom', message: 'Invalid price' });
    return z.NEVER;
  }
  return n;
});

const UpstreamModelSchema = z.object({
  id: z.string().min(3).max(200),
  name: z.string().max(200).optional(),
  context_length: z.number().int().nonnegative().nullable().optional(),
  pricing: z.object({
    prompt: PriceSchema,
    completion: PriceSchema,
    image: PriceSchema.nullable().optional(),
  }),
  supported_parameters: z.array(z.string()).nullable().optional(),
  architecture: z
    .object({ input_modalities: z.array(z.string()).nullable().optional() })
    .nullable()
    .optional(),
});

const UpstreamListSchema = z.object({ data: z.array(z.unknown()) });


const perMTok = (perToken: number) => Math.round(perToken * 1_000_000 * 1e6) / 1e6;

/** Maps OpenRouter's `/models` JSON (untrusted) to catalog entries; malformed entries are dropped. */
export function parseOpenRouterModels(json: unknown): AiModelInfoDto[] {
  const list = UpstreamListSchema.safeParse(json);
  if (!list.success) throw new Error('Unexpected /models response shape');
  const seen = new Set<string>();
  const models: AiModelInfoDto[] = [];
  for (const raw of list.data.data.slice(0, MAX_MODELS)) {
    const parsed = UpstreamModelSchema.safeParse(raw);
    if (!parsed.success) continue;
    const m = parsed.data;
    // Same shape users may save (`AiModelIdSchema`), so every catalog id is also a valid choice.
    if (m.id.length > 100 || !AI_MODEL_ID_PATTERN.test(m.id) || seen.has(m.id)) continue;
    seen.add(m.id);
    models.push({
      id: m.id,
      name: (m.name ?? m.id).trim() || m.id,
      contextLength: m.context_length ?? null,
      pricing: {
        promptPerMTokUsd: perMTok(m.pricing.prompt),
        completionPerMTokUsd: perMTok(m.pricing.completion),
        imageUsd: m.pricing.image ? m.pricing.image : null,
      },
      supportsTools: (m.supported_parameters ?? []).includes('tools'),
      supportsImages: (m.architecture?.input_modalities ?? []).includes('image'),
    });
  }
  return models;
}

export interface ModelCatalog {
  /** False when no list could be loaded yet (models is then empty). */
  available: boolean;
  models: AiModelInfoDto[];
}

/**
 * OpenRouter model catalog (public endpoint, no API key). Cached in memory for 6 h with
 * stale-while-revalidate; on failure the last good list keeps being served.
 */
@Injectable()
export class OpenRouterModelsService {
  private readonly logger = new Logger(OpenRouterModelsService.name);
  private cache: { models: AiModelInfoDto[]; byId: Map<string, AiModelInfoDto> } | null = null;
  private refreshAt = 0;
  private inflight: Promise<void> | null = null;

  /** Overridable in tests. */
  protected async fetchJson(): Promise<unknown> {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.arrayBuffer().catch(() => undefined);
      throw new Error(`OpenRouter /models returned ${response.status}`);
    }
    return response.json();
  }

  async catalog(): Promise<ModelCatalog> {
    if (Date.now() >= this.refreshAt) {
      const refresh = this.refresh();
      // First load waits; later refreshes run in the background (stale-while-revalidate).
      if (!this.cache) await refresh;
    }
    return { available: this.cache !== null, models: this.cache?.models ?? [] };
  }

  async find(id: string): Promise<AiModelInfoDto | undefined> {
    await this.catalog();
    return this.cache?.byId.get(id);
  }

  private refresh(): Promise<void> {
    this.inflight ??= (async () => {
      try {
        const models = parseOpenRouterModels(await this.fetchJson());
        this.cache = { models, byId: new Map(models.map((m) => [m.id, m])) };
        this.refreshAt = Date.now() + CACHE_TTL_MS;
      } catch (err) {
        this.logger.warn(`Could not load the OpenRouter model catalog: ${String(err)}`);
        this.refreshAt = Date.now() + RETRY_AFTER_FAILURE_MS;
      } finally {
        this.inflight = null;
      }
    })();
    return this.inflight;
  }
}
