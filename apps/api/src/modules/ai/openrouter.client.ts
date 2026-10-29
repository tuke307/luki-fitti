import { Injectable } from '@nestjs/common';
import { FRONTEND_URL, OPENROUTER_API_KEY, OPENROUTER_BASE_URL, OPENROUTER_TIMEOUT_MS } from '@/config/env.config';

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

@Injectable()
export class OpenRouterClient {
  get isConfigured(): boolean {
    return OPENROUTER_API_KEY.length > 0;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    if (!this.isConfigured) throw new AiProviderError('AI provider is not configured');

    const models = [request.model, ...(request.fallbackModels ?? [])].filter(
      (m, i, all) => all.indexOf(m) === i,
    );
    const body = {
      ...(models.length > 1 ? { models } : { model: request.model }),
      messages: request.messages,
      ...(request.tools?.length ? { tools: request.tools, tool_choice: request.toolChoice ?? 'auto' } : {}),
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
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': FRONTEND_URL,
          'X-Title': 'LukiFitti',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(OPENROUTER_TIMEOUT_MS),
      });
    } catch (err) {
      throw new AiProviderError('AI provider request failed', undefined, String(err));
    }

    const text = await response.text();
    let json: OpenRouterRawResponse;
    try {
      json = JSON.parse(text) as OpenRouterRawResponse;
    } catch {
      throw new AiProviderError('AI provider returned an invalid response', response.status, text.slice(0, 500));
    }
    if (!response.ok || json.error) {
      throw new AiProviderError(
        'AI provider returned an error',
        json.error?.code ?? response.status,
        json.error?.message ?? text.slice(0, 500),
      );
    }

    const choice = json.choices?.[0];
    if (!choice?.message) throw new AiProviderError('AI provider returned no answer', response.status);
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
}
