import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** USER-16: TOTP as in RFC 6238 (HMAC-SHA1, 30 seconds, 6 digits), what authenticator apps use. */
const STEP_SECONDS = 30;
const DIGITS = 6;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new secret: 20 random bytes, as RFC 4226 recommends. */
export const newTotpSecret = (): string => base32Encode(randomBytes(20));

export const timeStep = (at: number): number =>
  Math.floor(at / 1000 / STEP_SECONDS);

/** The code for one time step. */
export function totpAt(secret: Buffer, step: number, digits = DIGITS): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac('sha1', secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const binary =
    ((hmac[offset] & 127) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

/**
 * Accepts the current step and one either side (clock drift), never a step at or before the last one
 * used, so a code cannot be replayed. Returns the matching step, or null.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  now: number,
  lastStep = -1,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const current = timeStep(now);
  for (const step of [current - 1, current, current + 1]) {
    if (step <= lastStep) continue;
    const expected = Buffer.from(totpAt(secret, step));
    if (timingSafeEqual(expected, Buffer.from(code))) return step;
  }
  return null;
}

/** What an authenticator app scans. */
export const otpauthUrl = (
  issuer: string,
  account: string,
  secret: string,
): string =>
  `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;

const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

/** USER-16: ten single-use codes for a lost phone, `xxxxx-xxxxx`. */
export function newRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () => {
    const chars = [...randomBytes(10)].map(
      (byte) => RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length],
    );
    return `${chars.slice(0, 5).join('')}-${chars.slice(5).join('')}`;
  });
}

export const normalizeRecoveryCode = (code: string): string =>
  code.trim().toLowerCase().replace(/\s+/g, '');
