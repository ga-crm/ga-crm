import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { HttpStatus } from '@nestjs/common';
import { ApiException, ErrorCode } from './errors.js';

const scryptAsync = promisify<
  string,
  Buffer,
  number,
  { N: number; r: number; p: number; maxmem: number },
  Buffer
>(scrypt);

const N = 2 ** 16;
const R = 8;
const P = 2;
const KEY_LENGTH = 32;
const MAX_MEMORY = 256 * 1024 * 1024;

// Hashing is deliberately slow and uses 64 MB each. Past this queue a flood would make every sign-in
// wait, so extra requests are refused at once and can retry. The queue drains in about 3 seconds.
const MAX_QUEUED_HASHES = 64;
let queuedHashes = 0;

async function runHash<T>(work: () => Promise<T>): Promise<T> {
  if (queuedHashes >= MAX_QUEUED_HASHES) {
    throw new ApiException(
      HttpStatus.SERVICE_UNAVAILABLE,
      ErrorCode.ServerBusy,
      undefined,
      5,
    );
  }
  queuedHashes++;
  try {
    return await work();
  } finally {
    queuedHashes--;
  }
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await runHash(() =>
    scryptAsync(password, salt, KEY_LENGTH, {
      N,
      r: R,
      p: P,
      maxmem: MAX_MEMORY,
    }),
  );
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [, n, r, p, salt, key] = stored.split('$');
  const expected = Buffer.from(key, 'base64url');
  const actual = await runHash(() =>
    scryptAsync(password, Buffer.from(salt, 'base64url'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAX_MEMORY,
    }),
  );
  return timingSafeEqual(actual, expected);
}

/** USER-3: at least 32 random bytes. Only the SHA-256 hash is ever stored. */
export const generateToken = (): string =>
  randomBytes(32).toString('base64url');
export const sha256 = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
