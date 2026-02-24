import { HttpException, HttpStatus, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env';
import { z } from 'zod';

export type OpenRouterChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type OpenRouterChatOptions = {
  maxTokens?: number;
  temperature?: number;
};

const OpenRouterChatCompletionSchema = z
  .object({
    choices: z
      .array(
        z.object({
          message: z
            .object({
              content: z.string().nullable().optional(),
            })
            .optional(),
        }),
      )
      .min(1),
  })
  .passthrough();

@Injectable()
export class OpenRouterClient {
  constructor(private readonly config: ConfigService<Env, true>) {}

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private get apiKey(): string {
    return (this.config.get('OPENROUTER_API_KEY') ?? '').trim();
  }

  private get baseUrl(): string {
    return this.config.get('OPENROUTER_BASE_URL');
  }

  private get model(): string {
    const model = this.config.get('OPENROUTER_DEFAULT_MODEL');
    if (!model || !model.trim()) {
      throw new ServiceUnavailableException('OPENROUTER_DEFAULT_MODEL is not configured');
    }
    return model;
  }

  async chat(messages: OpenRouterChatMessage[], options: OpenRouterChatOptions = {}): Promise<string> {
    const maxTokens = options.maxTokens ?? 450;
    const temperature = options.temperature ?? 0.4;
    const timeoutMs = 120_000;

    if (!this.apiKey) {
      throw new ServiceUnavailableException('OPENROUTER_API_KEY is not configured');
    }

    const payload = {
      model: this.model,
      messages,
      max_tokens: maxTokens,
      temperature,
    };

    class RateLimitError extends Error {
      constructor(
        public readonly retryAfterMs: number,
        public readonly details: string,
      ) {
        super('RATE_LIMIT');
      }
    }

    const attemptOnce = async (): Promise<string> => {
      const res = await this.fetchWithTimeout(
        `${this.baseUrl}/chat/completions`,
        {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        },
        timeoutMs,
      );

      if (!res.ok) {
        if (res.status === 429) {
          const retryAfterHeader = res.headers.get('retry-after');
          const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
          const retryAfterMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0 ? retryAfterSec * 1000 : 1500;
          const text = await res.text().catch(() => '');
          throw new RateLimitError(Math.min(10_000, Math.max(500, retryAfterMs)), text);
        }
        const text = await res.text().catch(() => '');
        throw new ServiceUnavailableException(`OpenRouter error: ${res.status} ${text}`);
      }

      const json = await res.json();
      const parsed = OpenRouterChatCompletionSchema.safeParse(json);
      if (!parsed.success) {
        throw new ServiceUnavailableException('OpenRouter returned an unexpected response shape');
      }

      const content = parsed.data.choices?.[0]?.message?.content?.trim?.() ?? '';
      return content;
    };

    try {
      const first = await attemptOnce();
      if (first) return first;
    } catch (e) {
      if (e instanceof RateLimitError) {
        await this.sleep(e.retryAfterMs);
      }
      // fall through to retry once
    }

    try {
      const second = await attemptOnce();
      if (!second) throw new ServiceUnavailableException('OpenRouter returned an empty response');
      return second;
    } catch (e) {
      if (e instanceof RateLimitError) {
        throw new HttpException(
          `AI provider is temporarily rate-limited. Please retry shortly. ${e.details ? `Upstream: ${e.details}` : ''}`.trim(),
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      throw e;
    }
  }
}
