/**
 * AI-14: the provider registry. Each entry is enough to reach the provider through its
 * OpenAI-compatible endpoint, so a new provider is one more entry here.
 */
export const AI_PROVIDERS = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    platformKeyEnv: 'AI_PLATFORM_KEY_GEMINI',
    // AI-17: fallback suggestions (10/2026) when the live list cannot be read
    suggested: {
      FAST: 'gemini-3.5-flash-lite',
      BALANCED: 'gemini-3.5-flash',
      DEEP: 'gemini-3.1-pro-preview',
    },
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    platformKeyEnv: 'AI_PLATFORM_KEY_DEEPSEEK',
    suggested: {
      FAST: 'deepseek-v4-flash',
      BALANCED: 'deepseek-v4-flash',
      DEEP: 'deepseek-v4-pro',
    },
  },
  {
    id: 'qwen',
    label: 'Qwen (Alibaba Cloud quốc tế)',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    platformKeyEnv: 'AI_PLATFORM_KEY_QWEN',
    suggested: { FAST: 'qwen-flash', BALANCED: 'qwen-plus', DEEP: 'qwen-max' },
  },
] as const;

export type AiProviderId = (typeof AI_PROVIDERS)[number]['id'];
export const AI_PROVIDER_IDS = AI_PROVIDERS.map((item) => item.id);
export const AI_TIERS = ['FAST', 'BALANCED', 'DEEP'] as const;
export type AiTier = (typeof AI_TIERS)[number];

export const providerOf = (id: string) =>
  AI_PROVIDERS.find((item) => item.id === id);

/** AI-17: chat models only; embedding, speech, image and video models are left out. */
const NOT_CHAT =
  /embed|tts|audio|speech|transcri|whisper|image|imagen|veo|video|aqa|rerank|moderation|realtime/i;

export function chatModels(ids: string[]): string[] {
  return [
    ...new Set(
      ids
        // Gemini lists ids as `models/gemini-...`
        .map((id) => id.replace(/^models\//, ''))
        .filter((id) => id && !NOT_CHAT.test(id)),
    ),
  ].sort();
}

/**
 * AI-16: how a provider's answer reads to the GA. Gemini rejects a bad key with 400 and a message
 * about the API key rather than 401, so the message is read too.
 */
export function providerErrorCode(
  status: number,
  message = '',
):
  | 'ai_key_invalid'
  | 'ai_model_unavailable'
  | 'ai_rate_limited'
  | 'ai_provider_error' {
  if (status === 401 || status === 403) return 'ai_key_invalid';
  if (status === 400 && /api[ _-]?key/i.test(message)) return 'ai_key_invalid';
  if (status === 404) return 'ai_model_unavailable';
  if (status === 429) return 'ai_rate_limited';
  return 'ai_provider_error';
}
