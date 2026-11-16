import { describe, expect, it } from 'vitest';
import {
  countBits,
  lastDays,
  orBits,
  presenceDiff,
  presenceKeys,
  presenceState,
  setBits,
  vietnamDay,
} from './presence-bits.js';

/** Bits the way Redis SETBIT writes them: offset 0 is the top bit of the first byte. */
function bitmap(...offsets: number[]): Buffer {
  const bits = Buffer.alloc(Math.floor(Math.max(...offsets) / 8) + 1);
  for (const offset of offsets) bits[offset >> 3] |= 0x80 >> (offset & 7);
  return bits;
}

describe('Presence bitmaps', () => {
  it('reads member numbers back from Redis bit order', () => {
    expect(setBits(bitmap(1, 7, 8, 42))).toEqual([1, 7, 8, 42]);
    expect(setBits(null)).toEqual([]);
    expect(countBits(bitmap(0, 3, 900))).toBe(3);
  });

  it('ORs bitmaps of different lengths', () => {
    expect(setBits(orBits(bitmap(1), bitmap(2, 40)))).toEqual([1, 2, 40]);
    expect(setBits(orBits(null, bitmap(5)))).toEqual([5]);
  });

  it('splits online and idle, and reports only what changed', () => {
    const before = presenceState(bitmap(1, 2, 3), bitmap(1, 2));
    expect(before).toEqual({ online: [1, 2], idle: [3] });
    const after = presenceState(bitmap(2, 3, 4), bitmap(3, 4));
    expect(presenceDiff(before, after)).toEqual({
      online: [3, 4],
      idle: [2],
      offline: [1],
    });
  });

  it('DATA-2: days are Vietnam days', () => {
    // 17:30 UTC is already the next day in Vietnam
    expect(vietnamDay(Date.parse('2026-11-14T17:30:00Z'))).toBe('2026-11-15');
    expect(lastDays(Date.parse('2026-11-14T03:00:00Z'), 3)).toEqual([
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
    ]);
  });

  it('keeps every key of a GA in one cluster slot', () => {
    const keys = presenceKeys('abc');
    expect(keys.day('2026-11-14')).toBe('t:{abc}:dau:20261114');
    expect(keys.online(5)).toBe('t:{abc}:on:5');
  });
});
