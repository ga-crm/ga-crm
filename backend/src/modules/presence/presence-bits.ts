/**
 * Pure helpers for the presence and activity bitmaps (docs/thiet-ke-chat-realtime.md section 6).
 * A bitmap holds one bit per user of a GA at offset `users.member_no`. Redis numbers bits from the
 * most significant bit of the first byte.
 */

export const MINUTE_MS = 60_000;
const VIETNAM_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

/** How long a day's activity bitmap stays in Redis; older days are read from PostgreSQL. */
export const DAU_TTL_SECONDS = 35 * 86_400;
/** A minute bitmap lives through the next minute's "online" window, plus slack. */
export const MINUTE_TTL_SECONDS = 180;

export const minuteOf = (now: number): number => Math.floor(now / MINUTE_MS);

/** DATA-2: days are Vietnam days, as YYYY-MM-DD. */
export const vietnamDay = (now: number): string =>
  new Date(now + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);

/** The `count` Vietnam days ending with today, oldest first. */
export function lastDays(now: number, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    vietnamDay(now - (count - 1 - index) * DAY_MS),
  );
}

/**
 * Keys of one GA. The braces are a Redis Cluster hash tag, so every key of a GA lands in one slot
 * and BITOP across them keeps working if the cache ever becomes a cluster.
 */
export const presenceKeys = (tenantId: string) => {
  const prefix = `t:{${tenantId}}`;
  return {
    online: (minute: number) => `${prefix}:on:${minute}`,
    active: (minute: number) => `${prefix}:act:${minute}`,
    day: (day: string) => `${prefix}:dau:${day.replaceAll('-', '')}`,
    onlineNow: `${prefix}:online`,
    activeNow: `${prefix}:active`,
    snapshot: `${prefix}:presence:snap`,
    /** member_no → epoch ms of the last heartbeat or disconnect (K5: "active 12 minutes ago"). */
    seen: `${prefix}:seen`,
    /** member_no → epoch ms when the current online stretch began ("online since 08:15"). */
    since: `${prefix}:since`,
    lock: `${prefix}:lock:presence`,
    union: `${prefix}:tmp:union`,
    restore: `${prefix}:tmp:restore`,
  };
};

/** The member numbers whose bit is set. */
export function setBits(bits: Buffer | null | undefined): number[] {
  const found: number[] = [];
  if (!bits) return found;
  for (let byte = 0; byte < bits.length; byte++) {
    const value = bits[byte];
    if (value === 0) continue;
    for (let bit = 0; bit < 8; bit++)
      if (value & (0x80 >> bit)) found.push(byte * 8 + bit);
  }
  return found;
}

export function countBits(bits: Buffer | null | undefined): number {
  let count = 0;
  for (const value of bits ?? []) {
    let rest = value;
    while (rest) {
      rest &= rest - 1;
      count++;
    }
  }
  return count;
}

/** Bitwise OR of two bitmaps of any length. */
export function orBits(a: Buffer | null, b: Buffer | null): Buffer {
  const result = Buffer.alloc(Math.max(a?.length ?? 0, b?.length ?? 0));
  for (let index = 0; index < result.length; index++)
    result[index] = (a?.[index] ?? 0) | (b?.[index] ?? 0);
  return result;
}

export type PresenceStatus = 'online' | 'idle';

/** Who is in each state: "online" has a recent heartbeat with activity, "idle" one without. */
export interface PresenceState {
  online: number[];
  idle: number[];
}

export function presenceState(
  onlineBits: Buffer | null,
  activeBits: Buffer | null,
): PresenceState {
  const active = new Set(setBits(activeBits));
  const state: PresenceState = { online: [], idle: [] };
  for (const no of setBits(onlineBits))
    (active.has(no) ? state.online : state.idle).push(no);
  return state;
}

/** What changed between two states, for the `presence.changed` event. */
export function presenceDiff(before: PresenceState, after: PresenceState) {
  const was = new Map<number, PresenceStatus>();
  for (const no of before.online) was.set(no, 'online');
  for (const no of before.idle) was.set(no, 'idle');
  const now = new Map<number, PresenceStatus>();
  for (const no of after.online) now.set(no, 'online');
  for (const no of after.idle) now.set(no, 'idle');

  const diff = { online: [] as number[], idle: [] as number[], offline: [] as number[] };
  for (const [no, status] of now) if (was.get(no) !== status) diff[status].push(no);
  for (const no of was.keys()) if (!now.has(no)) diff.offline.push(no);
  return diff;
}
