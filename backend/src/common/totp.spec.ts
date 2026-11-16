import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  newRecoveryCodes,
  otpauthUrl,
  totpAt,
  verifyTotp,
} from './totp.js';

// RFC 6238 appendix B, SHA1 seed
const SEED = Buffer.from('12345678901234567890');

describe('TOTP (USER-16)', () => {
  it('matches the RFC 6238 test vectors', () => {
    expect(totpAt(SEED, Math.floor(59 / 30), 8)).toBe('94287082');
    expect(totpAt(SEED, Math.floor(1111111109 / 30), 8)).toBe('07081804');
    expect(totpAt(SEED, Math.floor(2000000000 / 30), 8)).toBe('69279037');
  });

  it('round-trips base32', () => {
    const encoded = base32Encode(SEED);
    expect(encoded).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(encoded).equals(SEED)).toBe(true);
  });

  it('accepts one step of drift and never the same step twice', () => {
    const secret = base32Encode(SEED);
    const now = 1_700_000_000_000;
    const step = Math.floor(now / 30_000);
    const code = totpAt(SEED, step);
    expect(verifyTotp(secret, code, now)).toBe(step);
    expect(verifyTotp(secret, code, now + 30_000)).toBe(step);
    expect(verifyTotp(secret, code, now + 90_000)).toBeNull();
    expect(verifyTotp(secret, code, now, step)).toBeNull();
    expect(verifyTotp(secret, '12345', now)).toBeNull();
  });

  it('builds the otpauth link and recovery codes', () => {
    expect(otpauthUrl('GA CRM', 'a@b.vn', 'ABC')).toBe(
      'otpauth://totp/GA%20CRM%3Aa%40b.vn?secret=ABC&issuer=GA%20CRM&algorithm=SHA1&digits=6&period=30',
    );
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z2-9]{5}-[a-z2-9]{5}$/);
  });
});
