import { Injectable } from '@nestjs/common';
import { FRONTEND_URL, OPENROUTER_BASE_URL, OPENROUTER_TIMEOUT_MS } from '@/config/env.config';

const KEY_VERIFY_TIMEOUT_MS = 5_000;

/* OpenAI-compatible chat types (the subset OpenRouter needs). */

export type ChatContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };

export interface ChatToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ChatContentPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: ChatToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ChatToolDefinition {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatRequest {
  model: string;
  /** Fallback models OpenRouter tries in order if the primary fails or is unavailable. */
  fallbackModels?: string[];
  messages: ChatMessage[];
  tools?: ChatToolDefinition[];
  toolChoice?: 'auto' | 'required' | { type: 'function'; function: { name: string } };
  temperature?: number;
  maxTokens?: number;
  /** End-user id hash for provider-side abuse detection (never the raw id/email). */
  user?: string;
}

export interface ChatResponse {
  model: string;
  message: { content: string | null; tool_calls?: ChatToolCall[] };
  finishReason: string | null;
  usage: { promptTokens: number; completionTokens: number; costUsd: number | null };
}

/**
 * Error from the LLM provider. `message` is safe to log; upstream bodies are kept in
 * `upstreamMessage` for logs only and never returned to clients.
 */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly upstreamMessage?: string,
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

interface OpenRouterRawResponse {
  model?: string;
  choices?: Array<{
    finish_reason?: string | null;
    message?: { content?: string | null; tool_calls?: ChatToolCall[] };
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string; code?: number };
}

/** Removes anything that looks like an OpenRouter key from upstream text before it is logged. */
export function redactKeys(text: string): string {
  return text.replace(/sk-or-[A-Za-z0-9_-]+/g, 'sk-or-[redacted]');
}

export type KeyVerification = 'valid' | 'invalid' | 'unknown';

export interface ImageGenerationRequest {
  model: string;
  /** Tried in order only on provider-side failures (5xx or an unavailable-model 4xx). */
  fallbackModels?: string[];
  prompt: string;
  referenceImageDataUrl: string;
  aspectRatio?: string;
  /** End-user id hash for provider-side abuse detection (never the raw id/email). */
  user?: string;
}

export interface ImageGenerationResponse {
  model: string;
  imageBase64: string;
  mimeType: string;
  costUsd: number | null;
}

interface OpenRouterImageRawResponse {
  model?: string;
  data?: Array<{ b64_json?: string; media_type?: string }>;
  usage?: { cost?: number };
  error?: { message?: string; code?: number };
}

/** A 4xx that means "this model can't do it", so the next fallback is worth a try. */
const isModelUnavailableError = (err: AiProviderError) => {
  if (err.status === undefined) return true;
  if (err.status === 401 || err.status === 402 || err.status === 429) return false;
  if (err.status === 404) return true;
  if (err.status === 400) return /model|unavailable/i.test(err.upstreamMessage ?? '');
  return err.status >= 500;
};

/**
 * Stateless OpenRouter client. The API key is passed per call (per-user keys); it is only
 * ever placed in the Authorization header and never logged or echoed.
 */
@Injectable()
export class OpenRouterClient {
  /**
   * Checks a key against OpenRouter's key-info endpoint. `unknown` = could not verify
   * (network/timeout/5xx) — callers may accept the key and let the first run decide.
   */
  async verifyKey(apiKey: string): Promise<KeyVerification> {
    try {
      const response = await fetch(`${OPENROUTER_BASE_URL}/key`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(KEY_VERIFY_TIMEOUT_MS),
      });
      // Drain the body without keeping it (it may describe the key's account).
      await response.arrayBuffer().catch(() => undefined);
      if (response.ok) return 'valid';
      if (response.status === 401 || response.status === 403) return 'invalid';
      return 'unknown';
    } catch {
      return 'unknown';
    }
  }

  async chat(request: ChatRequest, apiKey: string): Promise<ChatResponse> {
    if (!apiKey) throw new AiProviderError('AI provider key missing');

    const models = [request.model, ...(request.fallbackModels ?? [])].filter(
      (m, i, all) => all.indexOf(m) === i,
    );
    const body = {
      ...(models.length > 1 ? { models } : { model: request.model }),
      messages: request.messages,
      ...(request.tools?.length
        ? { tools: request.tools, tool_choice: request.toolChoice ?? 'auto' }
        : {}),
      temperature: request.temperature ?? 0.4,
      max_tokens: request.maxTokens ?? 4000,
      usage: { include: true },
      ...(request.user ? { user: request.user } : {}),
    };

    let response: Response;
    try {
      response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': FRONTEND_URL,
          'X-Title': 'LukiFitti',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
      });
    } catch (err) {
      throw new AiProviderError('AI provider request failed', undefined, redactKeys(String(err)));
    }

    const text = await response.text();
    let json: OpenRouterRawResponse;
    try {
      json = JSON.parse(text) as OpenRouterRawResponse;
    } catch {
      throw new AiProviderError(
        'AI provider returned an invalid response',
        response.status,
        redactKeys(text.slice(0, 500)),
      );
    }
    if (!response.ok || json.error) {
      throw new AiProviderError(
        'AI provider returned an error',
        json.error?.code ?? response.status,
        redactKeys(json.error?.message ?? text.slice(0, 500)),
      );
    }

    const choice = json.choices?.[0];
    if (!choice?.message)
      throw new AiProviderError('AI provider returned no answer', response.status);
    return {
      model: json.model ?? request.model,
      message: { content: choice.message.content ?? null, tool_calls: choice.message.tool_calls },
      finishReason: choice.finish_reason ?? null,
      usage: {
        promptTokens: json.usage?.prompt_tokens ?? 0,
        completionTokens: json.usage?.completion_tokens ?? 0,
        costUsd: typeof json.usage?.cost === 'number' ? json.usage.cost : null,
      },
    };
  }

  /**
   * Image generation (`POST /images`). Unlike chat, the endpoint takes exactly one model per
   * call, so fallbacks are retried here — but never on client-side failures (401/402/429).
   */
  async generateImage(
    request: ImageGenerationRequest,
    apiKey: string,
  ): Promise<ImageGenerationResponse> {
    if (!apiKey) throw new AiProviderError('AI provider key missing');
    const models = [request.model, ...(request.fallbackModels ?? [])].filter(
      (m, i, all) => all.indexOf(m) === i,
    );
    let lastError: AiProviderError | null = null;
    for (const model of models) {
      try {
        return await this.callImagesApi(request, model, apiKey);
      } catch (err) {
        const wrapped = err instanceof AiProviderError ? err : new AiProviderError(String(err));
        if (!isModelUnavailableError(wrapped)) throw wrapped;
        lastError = wrapped;
      }
    }
    throw lastError ?? new AiProviderError('AI provider request failed');
  }

  private async callImagesApi(
    request: ImageGenerationRequest,
    model: string,
    apiKey: string,
  ): Promise<ImageGenerationResponse> {
    const body = {
      model,
      prompt: request.prompt,
      input_references: [{ type: 'image_url', image_url: { url: request.referenceImageDataUrl } }],
      aspect_ratio: request.aspectRatio ?? '2:3',
      n: 1,
      output_format: 'jpeg',
      ...(request.user ? { user: request.user } : {}),
    };
    let response: Response;
    try {
      response = await fetch(`${OPENROUTER_BASE_URL}/images`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': FRONTEND_URL,
          'X-Title': 'LukiFitti',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
      });
    } catch (err) {
      throw new AiProviderError('AI provider request failed', undefined, redactKeys(String(err)));
    }

    const text = await response.text();
    let json: OpenRouterImageRawResponse;
    try {
      json = JSON.parse(text) as OpenRouterImageRawResponse;
    } catch {
      throw new AiProviderError(
        'AI provider returned an invalid response',
        response.status,
        redactKeys(text.slice(0, 500)),
      );
    }
    if (!response.ok || json.error) {
      throw new AiProviderError(
        'AI provider returned an error',
        json.error?.code ?? response.status,
        redactKeys(json.error?.message ?? text.slice(0, 500)),
      );
    }
    const image = json.data?.[0];
    if (!image?.b64_json) {
      throw new AiProviderError('AI provider returned no image', response.status);
    }
    return {
      model: json.model ?? model,
      imageBase64: image.b64_json,
      mimeType: image.media_type ?? 'image/jpeg',
      costUsd: typeof json.usage?.cost === 'number' ? json.usage.cost : null,
    };
  }
}
