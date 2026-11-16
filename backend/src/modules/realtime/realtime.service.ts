import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { PlatformDb } from '../../core/tenancy/platform-db.js';
import { RealtimeEvent, tenantRoom, userRoom } from './realtime.events.js';
import type {
  RealtimeEventName,
  RealtimePayload,
  RealtimeServer,
  SocketData,
} from './realtime.events.js';

/** Sessions can also end without a hook (expiry, a missed event); each instance checks its sockets this often. */
const SWEEP_MS = 60_000;
/** At most one `dashboard.changed` per GA this often. */
export const DASHBOARD_THROTTLE_MS = 5_000;

interface CheckedSocket {
  data: SocketData;
  emit: (
    event: typeof RealtimeEvent.SessionEnded,
    payload: Record<string, never>,
  ) => unknown;
  disconnect: (close?: boolean) => unknown;
}

/**
 * Pushes events to signed-in browsers and ends sockets whose session no longer holds. Other
 * modules call it after their transaction commits (`afterCommit`), so a rolled-back change is
 * never announced. Without a gateway (seed scripts) every call does nothing.
 */
@Injectable()
export class RealtimeService implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeService.name);
  private server?: RealtimeServer;
  private sweep?: NodeJS.Timeout;
  /** Pending `dashboard.changed` per GA, and when the last one went out. */
  private readonly dashboardTimers = new Map<string, NodeJS.Timeout>();
  private readonly dashboardSentAt = new Map<string, number>();

  constructor(
    private readonly platformDb: PlatformDb,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Called once by the gateway when Socket.IO starts. */
  attach(server: RealtimeServer): void {
    this.server = server;
    // Tests call recheckLocal() themselves, like RemindersService.tick
    if (this.config.get('NODE_ENV', { infer: true }) !== 'test') {
      this.sweep = setInterval(() => {
        this.recheckLocal().catch((error: unknown) =>
          this.logger.warn(`Session sweep failed: ${String(error)}`),
        );
      }, SWEEP_MS);
      this.sweep.unref();
    }
  }

  onModuleDestroy(): void {
    clearInterval(this.sweep);
    for (const timer of this.dashboardTimers.values()) clearTimeout(timer);
  }

  /**
   * The home charts of a GA are out of date. A busy GA changes leads many times a second, so at
   * most one `dashboard.changed` goes out every DASHBOARD_THROTTLE_MS, and the last change is
   * always followed by one. Each browser then reads its own figures again through REST.
   */
  touchDashboard(tenantId: string): void {
    if (this.dashboardTimers.has(tenantId)) return;
    const send = () => {
      this.dashboardTimers.delete(tenantId);
      this.dashboardSentAt.set(tenantId, Date.now());
      this.toTenant(tenantId, RealtimeEvent.DashboardChanged);
    };
    const wait =
      (this.dashboardSentAt.get(tenantId) ?? 0) +
      DASHBOARD_THROTTLE_MS -
      Date.now();
    if (wait <= 0) {
      send();
      return;
    }
    const timer = setTimeout(send, wait);
    timer.unref();
    this.dashboardTimers.set(tenantId, timer);
  }

  /** One publish however many users; through the Redis adapter it reaches every instance. */
  toUsers(
    userIds: string[],
    event: RealtimeEventName,
    payload: RealtimePayload = {},
  ): void {
    const rooms = [...new Set(userIds)].map(userRoom);
    if (!this.server || rooms.length === 0) return;
    this.server.to(rooms).emit(event, payload);
  }

  /** Every signed-in user of one GA (TEN-7: the room name carries the tenant). */
  toTenant(
    tenantId: string,
    event: RealtimeEventName,
    payload: RealtimePayload = {},
  ): void {
    this.server?.to(tenantRoom(tenantId)).emit(event, payload);
  }

  /** Whether the user still has a socket on any instance. */
  async isConnected(userId: string): Promise<boolean> {
    if (!this.server) return false;
    return (await this.server.in(userRoom(userId)).fetchSockets()).length > 0;
  }

  /** GAs with at least one socket on this instance, for the presence round. */
  localTenantIds(): string[] {
    const rooms = this.server?.of('/').adapter.rooms;
    if (!rooms) return [];
    return [...rooms.keys()]
      .filter((room) => room.startsWith('tenant:'))
      .map((room) => room.slice('tenant:'.length));
  }

  /** After a sign-out, password change, MFA reset, disabling or archiving: end what no longer holds. */
  async recheckUsers(userIds: string[]): Promise<void> {
    const rooms = [...new Set(userIds)].map(userRoom);
    if (!this.server || rooms.length === 0) return;
    await this.recheck(await this.server.in(rooms).fetchSockets());
  }

  /** TENANT-3: after a GA is suspended. */
  async recheckTenant(tenantId: string): Promise<void> {
    if (!this.server) return;
    await this.recheck(
      await this.server.in(tenantRoom(tenantId)).fetchSockets(),
    );
  }

  /** The periodic sweep: only this instance's sockets, so instances do not repeat each other's work. */
  async recheckLocal(): Promise<void> {
    if (!this.server) return;
    await this.recheck(await this.server.local.fetchSockets());
  }

  private async recheck(sockets: CheckedSocket[]): Promise<void> {
    if (sockets.length === 0) return;
    const valid = await this.validTokens([
      ...new Set(sockets.map((socket) => socket.data.tokenHash)),
    ]);
    for (const socket of sockets) {
      if (valid.has(socket.data.tokenHash)) continue;
      socket.emit(RealtimeEvent.SessionEnded, {});
      socket.disconnect(true);
    }
  }

  /**
   * The same conditions as AuthService.authenticate, for many sessions in one query: the session
   * exists and has not expired or waits for its MFA code, the account is ACTIVE, the GA is active.
   */
  private async validTokens(hashes: string[]): Promise<Set<string>> {
    const rows = await this.platformDb.run('session', (db) =>
      rowsOf<{ token_hash: string }>(
        db,
        `SELECT s.token_hash
           FROM sessions s
           JOIN users u ON u.id = s.user_id
           LEFT JOIN tenants t ON t.id = u.tenant_id
          WHERE s.token_hash = ANY($1::text[])
            AND s.expires_at > now()
            AND NOT s.mfa_pending
            AND u.status = 'ACTIVE'
            AND (u.tenant_id IS NULL OR t.status = 'active')`,
        [hashes],
      ),
    );
    return new Set(rows.map((row) => row.token_hash));
  }
}
