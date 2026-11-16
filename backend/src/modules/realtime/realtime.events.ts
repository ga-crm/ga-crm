import type { Server, Socket } from 'socket.io';

/**
 * Events the API pushes to browsers (docs/thiet-ke-he-thong.md section 9.2). Payloads carry an
 * event type and ids only: the browser reads the data again through REST, so masking and permission
 * checks stay in one place.
 */
export const RealtimeEvent = {
  /** A notification was created for this user. */
  NotificationNew: 'notification.new',
  /** This user marked notifications read, possibly in another tab. */
  NotificationRead: 'notification.read',
  /** Who came online, went idle or went offline in the GA: `{online, idle, offline}`, user ids. */
  PresenceChanged: 'presence.changed',
  /** C2: a new message, in full (members see the same text, so nothing needs masking). */
  ChatMessage: 'chat.message',
  /** A message was edited or recalled: `{conversationId, seq}`. */
  ChatUpdated: 'chat.updated',
  /** A member read up to `seq`: `{conversationId, userId, seq}`. */
  ChatRead: 'chat.read',
  /** Name, members or this user's settings of a conversation changed: `{conversationId}`. */
  ChatConversation: 'chat.conversation',
  /** Someone is typing: `{conversationId, userId}`; not stored, lasts a few seconds. */
  ChatTyping: 'chat.typing',
  /** Open question I: how far a batched import got: `{importId, done, total, failedBatches, failedRows, finished}`. */
  ImportProgress: 'import.progress',
  /** Home charts: lead data of the GA changed; at most one every 5 seconds per GA, no payload. */
  DashboardChanged: 'dashboard.changed',
  /** The session behind this socket ended (signed out, disabled, suspended); sent just before disconnecting. */
  SessionEnded: 'session.ended',
} as const;

export type RealtimeEventName =
  (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

export const userRoom = (userId: string) => `user:${userId}`;
export const tenantRoom = (tenantId: string) => `tenant:${tenantId}`;

/** What the handshake learned about the socket's session; also readable from other instances. */
export interface SocketData {
  userId: string;
  tenantId: string | null;
  /** sha256 of the session token, as stored in `sessions.token_hash` (never the token itself). */
  tokenHash: string;
  /** The user's bit in the GA's presence bitmaps; none for platform staff. */
  memberNo?: number;
  /** Last accepted typing event, for the per-socket rate limit. */
  typedAt?: number;
  /** Last accepted heartbeat, for the per-socket rate limit. */
  beatAt?: number;
  /** Whether the last heartbeat said the person was using the tab. */
  active?: boolean;
}

/** Sent by the browser every 30 seconds, and at once when the tab goes idle or active. */
export const HEARTBEAT = 'presence.heartbeat';
export interface HeartbeatPayload {
  active?: unknown;
}

/** Sent while the person types in a conversation, at most every 3 seconds. */
export const TYPING = 'chat.typing';
export interface TypingPayload {
  conversationId?: unknown;
}

/** Browsers only send heartbeats; everything else flows from the server. */
export type RealtimePayload = object;
type ServerToClient = Record<
  RealtimeEventName,
  (payload: RealtimePayload) => void
>;
type ClientToServer = {
  [HEARTBEAT]: (payload: HeartbeatPayload) => void;
  [TYPING]: (payload: TypingPayload) => void;
};

export type RealtimeServer = Server<
  ClientToServer,
  ServerToClient,
  Record<string, never>,
  SocketData
>;
export type RealtimeSocket = Socket<
  ClientToServer,
  ServerToClient,
  Record<string, never>,
  SocketData
>;
