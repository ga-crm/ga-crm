/**
 * Pure rules of chat (docs/thiet-ke-chat-realtime.md, slices C2 and C3). Decided with the owner on
 * 14/11/2026: anyone active in a GA may write to anyone else in it (K1); the GA head may read any
 * conversation, audited (K3); numbers that look like ID cards or bank accounts only warn (K4).
 */

export type ChatRole = 'OWNER' | 'ADMIN' | 'MEMBER';

/** Largest group, the creator included. */
export const GROUP_MAX = 500;
/** How long after sending a message its author may still edit it. */
export const EDIT_WINDOW_MS = 15 * 60_000;
export const BODY_MAX = 4000;

/** One one-to-one conversation per pair, whoever opened it first. */
export const directKey = (a: string, b: string): string =>
  a < b ? `${a}:${b}` : `${b}:${a}`;

const RANK: Record<ChatRole, number> = { OWNER: 3, ADMIN: 2, MEMBER: 1 };

/** Renaming and adding people: the owner and admins of a group. */
export const canManage = (role: ChatRole): boolean => RANK[role] >= RANK.ADMIN;

/** Removing someone else: only a higher role, so admins cannot remove each other or the owner. */
export const canRemove = (actor: ChatRole, target: ChatRole): boolean =>
  canManage(actor) && RANK[actor] > RANK[target];

export const canEdit = (createdAt: Date, now = Date.now()): boolean =>
  now - createdAt.getTime() <= EDIT_WINDOW_MS;

/**
 * Who owns a group after its owner leaves: the earliest admin, else the earliest member. Members
 * are given in the order they joined.
 */
export function nextOwner(
  members: { userId: string; role: ChatRole }[],
): string | null {
  return (
    members.find((member) => member.role === 'ADMIN')?.userId ??
    members[0]?.userId ??
    null
  );
}

/** Unread messages of one member: those after both what they read and when they joined. */
export const unreadOf = (
  lastSeq: number,
  lastReadSeq: number,
  joinedSeq: number,
): number => Math.max(0, lastSeq - Math.max(lastReadSeq, joinedSeq));
