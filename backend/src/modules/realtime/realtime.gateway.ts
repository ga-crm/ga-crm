import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { sha256 } from '../../common/crypto.js';
import type { Env } from '../../config/env.validation.js';
import { allowedOrigins } from '../auth/auth.guards.js';
import { AuthService } from '../auth/auth.service.js';
import { readSessionTokenFromHeader } from '../auth/session-cookie.js';
import { ChatService } from '../chat/chat.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { RealtimeService } from './realtime.service.js';
import {
  HEARTBEAT,
  RealtimeEvent,
  tenantRoom,
  TYPING,
  userRoom,
} from './realtime.events.js';
import type {
  HeartbeatPayload,
  RealtimeServer,
  TypingPayload,
  RealtimeSocket,
} from './realtime.events.js';

/** Heartbeats closer than this are dropped, unless the person went idle or came back. */
const MIN_BEAT_MS = 10_000;
/** Typing events closer than this are dropped; browsers send one every 3 seconds. */
const MIN_TYPING_MS = 2_000;

/** Handshake refusals, read by the browser as `connect_error` messages. */
export const HandshakeError = {
  Origin: 'forbidden_origin',
  Unauthenticated: 'unauthenticated',
} as const;

/**
 * Section 9: one WebSocket per tab, on the API's own port and path, so cookies and the reverse
 * proxy work as for REST. WebSocket transport only: long-polling would need sticky sessions
 * across instances (docs/thiet-ke-he-thong.md section 9.1).
 */
@WebSocketGateway({
  path: '/socket.io',
  transports: ['websocket'],
  serveClient: false,
  // Browsers send nothing yet; keep frames small
  maxHttpBufferSize: 16 * 1024,
})
export class RealtimeGateway
  implements
    OnGatewayInit<RealtimeServer>,
    OnGatewayConnection<RealtimeSocket>,
    OnGatewayDisconnect<RealtimeSocket>
{
  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly auth: AuthService,
    private readonly realtime: RealtimeService,
    private readonly presence: PresenceService,
    private readonly chat: ChatService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  afterInit(server: RealtimeServer): void {
    const origins = allowedOrigins(this.config);
    server.use((socket, next) => {
      this.admit(socket, origins).then(
        () => next(),
        (error: unknown) =>
          next(error instanceof Error ? error : new Error(String(error))),
      );
    });
    this.realtime.attach(server);
  }

  async handleConnection(socket: RealtimeSocket): Promise<void> {
    const { userId, tenantId, memberNo } = socket.data;
    await socket.join(
      tenantId ? [userRoom(userId), tenantRoom(tenantId)] : [userRoom(userId)],
    );
    if (!tenantId || memberNo === undefined) return;
    // Online at once for everyone in the GA, not at the next round
    socket.data.beatAt = Date.now();
    socket.data.active = true;
    await this.presence.heartbeat(tenantId, memberNo, true);
    await this.presence.publish(tenantId);
  }

  handleDisconnect(socket: RealtimeSocket): void {
    const { userId, tenantId, memberNo } = socket.data;
    if (!tenantId || memberNo === undefined) return;
    this.presence
      .disconnected(tenantId, userId, memberNo)
      .catch((error: unknown) =>
        this.logger.warn(`Presence update failed: ${String(error)}`),
      );
  }

  /** Every 30 seconds from each tab; `active` says whether the person used it in the last 5 minutes. */
  @SubscribeMessage(HEARTBEAT)
  async heartbeat(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() body: HeartbeatPayload,
  ): Promise<void> {
    const { tenantId, memberNo, beatAt = 0, active: wasActive } = socket.data;
    if (!tenantId || memberNo === undefined) return;
    const active = body?.active === true;
    const now = Date.now();
    const changed = active !== wasActive;
    if (!changed && now - beatAt < MIN_BEAT_MS) return;
    socket.data.beatAt = now;
    socket.data.active = active;
    await this.presence.heartbeat(tenantId, memberNo, active, now);
    // Going idle or coming back shows at once; otherwise the round picks it up
    if (changed) await this.presence.publish(tenantId, now);
  }

  /** C2: tells the other members of a conversation that this person is typing. Not stored. */
  @SubscribeMessage(TYPING)
  async typing(
    @ConnectedSocket() socket: RealtimeSocket,
    @MessageBody() body: TypingPayload,
  ): Promise<void> {
    const { tenantId, userId, typedAt = 0 } = socket.data;
    const conversationId = body?.conversationId;
    if (!tenantId || typeof conversationId !== 'string') return;
    const now = Date.now();
    if (now - typedAt < MIN_TYPING_MS) return;
    socket.data.typedAt = now;
    // Only a member is heard, and only by the other members (TEN-7: ids are checked under RLS)
    const others = await this.chat.typingTargets(
      tenantId,
      conversationId,
      userId,
    );
    this.realtime.toUsers(others, RealtimeEvent.ChatTyping, {
      conversationId,
      userId,
    });
  }

  /**
   * USER-18 and section 9.2: the session cookie decides who the socket belongs to, exactly as for
   * REST. Browsers always send Origin on a WebSocket, so a foreign one is refused (cross-site
   * WebSocket hijacking); a client without Origin is not a browser and carries no ambient cookie.
   */
  private async admit(
    socket: RealtimeSocket,
    origins: Set<string>,
  ): Promise<void> {
    const origin = socket.handshake.headers.origin;
    if (origin && !origins.has(origin)) throw new Error(HandshakeError.Origin);

    const token = readSessionTokenFromHeader(
      socket.handshake.headers.cookie,
      this.config,
    );
    const result = await this.auth.authenticate(token);
    // USER-16: a session still waiting for its MFA code, or one that must set MFA up, gets nothing
    if (!token || !result || result.mfa) {
      throw new Error(HandshakeError.Unauthenticated);
    }
    socket.data = {
      userId: result.actor.id,
      tenantId: result.actor.tenantId,
      tokenHash: sha256(token),
      memberNo: result.actor.memberNo,
    };
    this.logger.debug(`Socket for user ${result.actor.id}`);
  }
}
