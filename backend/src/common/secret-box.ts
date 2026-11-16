import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from 'node:crypto';

/**
 * AES-256-GCM under a key derived with HKDF from an application secret and a purpose, with
 * additional authenticated data that ties a value to its owner. Stored as "iv.ciphertext+tag".
 */
const keyFrom = (secret: string, purpose: string): Buffer =>
  Buffer.from(hkdfSync('sha256', secret, 'ga-crm/secret-box', purpose, 32));

export function seal(
  secret: string,
  purpose: string,
  aad: string,
  plain: string,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret, purpose), iv);
  cipher.setAAD(Buffer.from(aad));
  const body = Buffer.concat([
    cipher.update(plain, 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]);
  return `${iv.toString('base64')}.${body.toString('base64')}`;
}

/** Null when the secret, purpose or owner differ, or the value was changed. */
export function open(
  secret: string,
  purpose: string,
  aad: string,
  stored: string,
): string | null {
  try {
    const [ivText, bodyText] = stored.split('.');
    const iv = Buffer.from(ivText, 'base64');
    const body = Buffer.from(bodyText, 'base64');
    if (iv.length !== 12 || body.length < 17) return null;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      keyFrom(secret, purpose),
      iv,
    );
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(body.subarray(body.length - 16));
    return Buffer.concat([
      decipher.update(body.subarray(0, body.length - 16)),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}
