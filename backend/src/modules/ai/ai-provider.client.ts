import { Injectable } from '@nestjs/common';
import { chatModels, providerErrorCode, providerOf } from './ai-providers.js';

const TIMEOUT_MS = 15_000;

/** A provider call that failed, with the error code of file 20 it reads as. */
export class AiProviderFailure extends Error {
  constructor(
    readonly code: ReturnType<typeof providerErrorCode>,
    readonly status?: number,
  ) {
    super(code);
  }
}

/**
 * AI-16, AI-17: the calls the settings screen makes to a provider, through its OpenAI-compatible
 * endpoint. Kept apart so tests replace it and never reach the internet.
 */
@Injectable()
export class AiProviderClient {
  private async call(
    provider: string,
    apiKey: string,
    path: string,
    body?: unknown,
  ): Promise<unknown> {
    const entry = providerOf(provider);
    if (!entry) throw new AiProviderFailure('ai_provider_error');
    let response: Response;
    try {
      response = await fetch(`${entry.baseUrl}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new AiProviderFailure('ai_provider_error');
    }
    if (!response.ok) {
      const message = await response.text().catch(() => '');
      throw new AiProviderFailure(
        providerErrorCode(response.status, message.slice(0, 2000)),
        response.status,
      );
    }
    return response.json().catch(() => ({}));
  }

  /** AI-17: the chat models the key can use. */
  async listModels(provider: string, apiKey: string): Promise<string[]> {
    const body = (await this.call(provider, apiKey, '/models')) as {
      data?: { id?: string }[];
    };
    return chatModels((body.data ?? []).map((item) => item.id ?? ''));
  }

  /** AI-16: a minimal request (5 tokens) on one model. */
  async ping(provider: string, apiKey: string, model: string): Promise<void> {
    await this.call(provider, apiKey, '/chat/completions', {
      model,
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 5,
    });
  }
}
