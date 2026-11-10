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
  supported_parameters: z
    .union([
      z.array(z.string()),
      // The /images/models endpoint reports a capability map, e.g. input_references.max.
      z.record(z.string(), z.object({ max: z.number().int().nullable().optional() }).loose()),
    ])
    .nullable()
    .optional(),
  architecture: z
    .object({ input_modalities: z.array(z.string()).nullable().optional() })
    .nullable()
    .optional(),
});

const takesImageReferences = (m: z.infer<typeof UpstreamModelSchema>) => {
  const params = m.supported_parameters;
  if (Array.isArray(params)) {
    return params.includes('input_references');
  }
  const max = params?.input_references?.max;
  return typeof max === 'number' ? max >= 1 : true;
};

const acceptsImageInput = (m: z.infer<typeof UpstreamModelSchema>) =>
  takesImageReferences(m) || (m.architecture?.input_modalities ?? []).includes('image');

const UpstreamListSchema = z.object({ data: z.array(z.unknown()) });

const perMTok = (perToken: number) => Math.round(perToken * 1_000_000 * 1e6) / 1e6;

function toModelInfo(m: z.infer<typeof UpstreamModelSchema>, imageOnly: boolean): AiModelInfoDto {
  return {
    id: m.id,
    name: (m.name ?? m.id).trim() || m.id,
    contextLength: m.context_length ?? null,
    pricing: {
      // Image skills don't price per endpoint; the estimate comes from recorded runs.
      promptPerMTokUsd: imageOnly ? 0 : perMTok(m.pricing.prompt),
      completionPerMTokUsd: imageOnly ? 0 : perMTok(m.pricing.completion),
      imageUsd: imageOnly ? null : (m.pricing.image ?? null),
    },
    supportsTools: imageOnly
      ? false
      : Array.isArray(m.supported_parameters) && m.supported_parameters.includes('tools'),
    supportsImages: acceptsImageInput(m),
  };
}

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
    models.push(toModelInfo(m, false));
  }
  return models;
}

/** The /images/models list: only models that accept image input are useful for image skills. */
export function parseOpenRouterImageModels(json: unknown): AiModelInfoDto[] {
  const list = UpstreamListSchema.safeParse(json);
  if (!list.success) throw new Error('Unexpected /images/models response shape');
  const seen = new Set<string>();
  const models: AiModelInfoDto[] = [];
  for (const raw of list.data.data.slice(0, MAX_MODELS)) {
    const parsed = UpstreamModelSchema.safeParse(raw);
    if (!parsed.success) continue;
    const m = parsed.data;
    if (m.id.length > 100 || !AI_MODEL_ID_PATTERN.test(m.id) || seen.has(m.id)) continue;
    if (!acceptsImageInput(m)) continue;
    seen.add(m.id);
    models.push(toModelInfo(m, true));
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
  private imageCache: { models: AiModelInfoDto[]; byId: Map<string, AiModelInfoDto> } | null = null;
  private imageRefreshAt = 0;
  private imageInflight: Promise<void> | null = null;

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

  /** Overridable in tests: the image-generation catalog, same caching semantics. */
  protected async fetchImageJson(): Promise<unknown> {
    const response = await fetch(`${OPENROUTER_BASE_URL}/images/models`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.arrayBuffer().catch(() => undefined);
      throw new Error(`OpenRouter /images/models returned ${response.status}`);
    }
    return response.json();
  }

  /** The image-model catalog (skills with `imageOutput`), cached alongside the chat list. */
  async imageCatalog(): Promise<ModelCatalog> {
    if (Date.now() >= this.imageRefreshAt) {
      const refresh = this.refreshImages();
      if (!this.imageCache) await refresh;
    }
    return { available: this.imageCache !== null, models: this.imageCache?.models ?? [] };
  }

  private refreshImages(): Promise<void> {
    this.imageInflight ??= (async () => {
      try {
        const models = parseOpenRouterImageModels(await this.fetchImageJson());
        this.imageCache = { models, byId: new Map(models.map((m) => [m.id, m])) };
        this.imageRefreshAt = Date.now() + CACHE_TTL_MS;
      } catch (err) {
        this.logger.warn(`Could not load the OpenRouter image model catalog: ${String(err)}`);
        this.imageRefreshAt = Date.now() + RETRY_AFTER_FAILURE_MS;
      } finally {
        this.imageInflight = null;
      }
    })();
    return this.imageInflight;
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
