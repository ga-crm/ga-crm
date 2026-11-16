import { open, seal } from '../../common/secret-box.js';

/**
 * AI-15: provider keys are stored AES-256-GCM encrypted under a key derived from AI_KEYS_SECRET,
 * with "tenantId:provider" as additional authenticated data, so a ciphertext copied to another GA or
 * provider does not decrypt.
 */
const PURPOSE = 'ai-provider-keys/v1';

export const encryptKey = (secret: string, aad: string, plain: string) =>
  seal(secret, PURPOSE, aad, plain);

/** Null when the secret changed, the AAD differs or the value was tampered with. */
export const decryptKey = (secret: string, aad: string, stored: string) =>
  open(secret, PURPOSE, aad, stored);
