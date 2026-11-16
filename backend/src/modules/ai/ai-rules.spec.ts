import { describe, expect, it } from 'vitest';
import { chatModels, providerErrorCode } from './ai-providers.js';
import { decryptKey, encryptKey } from './key-crypto.js';

const SECRET = 'a'.repeat(64);

describe('AI keys and providers', () => {
  it('AI-15: a key decrypts only with the same secret, tenant and provider', () => {
    const stored = encryptKey(SECRET, 't1:gemini', 'AIza-secret-key-123');
    expect(stored).not.toContain('AIza');
    expect(decryptKey(SECRET, 't1:gemini', stored)).toBe('AIza-secret-key-123');
    expect(decryptKey(SECRET, 't2:gemini', stored)).toBeNull();
    expect(decryptKey(SECRET, 't1:qwen', stored)).toBeNull();
    expect(decryptKey('b'.repeat(64), 't1:gemini', stored)).toBeNull();
    expect(decryptKey(SECRET, 't1:gemini', 'garbage')).toBeNull();
    // A fresh IV every time
    expect(encryptKey(SECRET, 't1:gemini', 'x')).not.toBe(
      encryptKey(SECRET, 't1:gemini', 'x'),
    );
  });

  it('AI-17: only chat models are offered', () => {
    expect(
      chatModels([
        'models/gemini-3.5-flash',
        'models/text-embedding-004',
        'models/imagen-4',
        'qwen-plus',
        'qwen-tts',
        'models/gemini-3.5-flash',
      ]),
    ).toEqual(['gemini-3.5-flash', 'qwen-plus']);
  });

  it('AI-16: provider statuses map to the error codes of file 20', () => {
    expect(providerErrorCode(401)).toBe('ai_key_invalid');
    expect(providerErrorCode(403)).toBe('ai_key_invalid');
    expect(providerErrorCode(404)).toBe('ai_model_unavailable');
    expect(providerErrorCode(429)).toBe('ai_rate_limited');
    expect(providerErrorCode(500)).toBe('ai_provider_error');
    // Gemini: 400 with a message about the key
    expect(
      providerErrorCode(
        400,
        '{"error":{"message":"Please pass a valid API key"}}',
      ),
    ).toBe('ai_key_invalid');
    expect(providerErrorCode(400, 'max_tokens too small')).toBe(
      'ai_provider_error',
    );
  });
});
