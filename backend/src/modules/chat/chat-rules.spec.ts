import { describe, expect, it } from 'vitest';
import {
  canEdit,
  canManage,
  canRemove,
  directKey,
  EDIT_WINDOW_MS,
  nextOwner,
  unreadOf,
} from './chat-rules.js';

describe('Chat rules', () => {
  it('gives a pair the same one-to-one key whoever opens it', () => {
    expect(directKey('b', 'a')).toBe('a:b');
    expect(directKey('a', 'b')).toBe('a:b');
  });

  it('lets owners and admins manage, and remove only lower roles', () => {
    expect(canManage('OWNER')).toBe(true);
    expect(canManage('ADMIN')).toBe(true);
    expect(canManage('MEMBER')).toBe(false);
    expect(canRemove('OWNER', 'ADMIN')).toBe(true);
    expect(canRemove('ADMIN', 'MEMBER')).toBe(true);
    expect(canRemove('ADMIN', 'ADMIN')).toBe(false);
    expect(canRemove('ADMIN', 'OWNER')).toBe(false);
    expect(canRemove('MEMBER', 'MEMBER')).toBe(false);
  });

  it('allows edits for 15 minutes', () => {
    const now = Date.now();
    expect(canEdit(new Date(now - EDIT_WINDOW_MS), now)).toBe(true);
    expect(canEdit(new Date(now - EDIT_WINDOW_MS - 1), now)).toBe(false);
  });

  it('hands a group to the earliest admin, else the earliest member', () => {
    expect(
      nextOwner([
        { userId: 'm1', role: 'MEMBER' },
        { userId: 'a1', role: 'ADMIN' },
      ]),
    ).toBe('a1');
    expect(nextOwner([{ userId: 'm1', role: 'MEMBER' }])).toBe('m1');
    expect(nextOwner([])).toBeNull();
  });

  it('counts unread messages after what was read and after joining', () => {
    expect(unreadOf(10, 7, 0)).toBe(3);
    expect(unreadOf(10, 0, 8)).toBe(2);
    expect(unreadOf(10, 12, 0)).toBe(0);
  });
});
