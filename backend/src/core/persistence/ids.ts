import { randomBytes } from 'node:crypto';

let lastMs = 0;
let counter = 0;

/**
 * A UUID v7 (RFC 9562), the same kind the database gives by default: time-ordered, so ids made in
 * the code (rows an import writes and links before inserting) sort like ids the database makes.
 * Within one millisecond a counter keeps them in creation order.
 */
export function newId(now = Date.now()): string {
  if (now === lastMs) counter = (counter + 1) & 0xfff;
  else {
    lastMs = now;
    counter = randomBytes(2).readUInt16BE() & 0x7ff;
  }
  const bytes = randomBytes(16);
  bytes.writeUIntBE(now, 0, 6);
  bytes[6] = 0x70 | (counter >> 8);
  bytes[7] = counter & 0xff;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A stored row as the pure plans expect it: fields without a value are absent, not null. */
export function withoutNulls<T extends object>(row: T): T {
  return Object.fromEntries(
    Object.entries(row).filter(([, value]) => value !== null),
  ) as T;
}
