import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { Env } from '../../config/env.validation.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { PlatformDb } from '../../core/tenancy/platform-db.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PresenceService } from '../presence/presence.service.js';
import { ChatFilesService } from './chat-files.service.js';

/** K6 (decided 14/11/2026): how long a message waits unread before its member is notified. */
export const UNREAD_NOTICE_MS = 5 * 60_000;
const TICK_MS = 60_000;
const LOCK = 'chat-notices';

/**
 * Realtime slice C4: once a minute, members with messages unread for 5 minutes get one in-app
 * notification per conversation (not again until they read it or more arrive), unless the
 * conversation is muted or they are online and active right now. Unsent uploads are cleared in the
 * same round. One instance runs it, by a lease in job_locks like the reminder rounds.
 */
@Injectable()
export class ChatNoticesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ChatNoticesService.name);
  private readonly owner = randomUUID();
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly platformDb: PlatformDb,
    private readonly notifications: NotificationsService,
    private readonly presence: PresenceService,
    private readonly files: ChatFilesService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  onModuleInit(): void {
    // Tests call tick() with a fixed clock instead
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    this.timer = setInterval(() => {
      this.tick().catch((error: unknown) => this.logger.warn(`Chat notice round failed: ${String(error)}`));
    }, TICK_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  /** One round for every active GA. Returns false when another instance holds the lease. */
  async tick(now = new Date()): Promise<boolean> {
    const [won] = await this.platformDb.run('scheduler', (db) =>
      rowsOf<{ name: string }>(
        db,
        `INSERT INTO job_locks (name, owner, until) VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET owner = EXCLUDED.owner, until = EXCLUDED.until
           WHERE job_locks.until <= $4 OR job_locks.owner = $2
         RETURNING name`,
        [LOCK, this.owner, new Date(now.getTime() + TICK_MS - 5_000), now],
      ),
    );
    if (!won) return false;
    const tenants = await this.platformDb.run('scheduler', (db) =>
      rowsOf<{ id: string }>(db, `SELECT id FROM tenants WHERE status = 'active'`),
    );
    for (const { id } of tenants) {
      await this.unread(id, now);
      await this.files.removeUnsent(id, now);
    }
    return true;
  }

  private async unread(tenantId: string, now: Date): Promise<void> {
    const online = new Set((await this.presence.state(tenantId, now.getTime())).online);
    await this.tenantDb.run({ tenantId }, async (db) => {
      const due = await rowsOf<{
        conversation_id: string;
        user_id: string;
        member_no: number | null;
        kind: 'DIRECT' | 'GROUP';
        last_seq: string;
        from_seq: string;
        other_id: string | null;
      }>(
        db,
        `SELECT cm.conversation_id, cm.user_id, u.member_no, c.kind, c.last_seq,
                greatest(cm.last_read_seq, cm.joined_seq, cm.notified_seq) AS from_seq,
                (SELECT o.user_id FROM conversation_members o
                  WHERE c.kind = 'DIRECT' AND o.conversation_id = c.id AND o.user_id <> cm.user_id LIMIT 1) AS other_id
           FROM conversation_members cm
           JOIN conversations c ON c.id = cm.conversation_id
           JOIN users u ON u.id = cm.user_id AND u.status = 'ACTIVE'
          WHERE cm.tenant_id = $1 AND cm.left_at IS NULL AND NOT cm.muted
            AND c.last_seq > greatest(cm.last_read_seq, cm.joined_seq, cm.notified_seq)
            -- The first message they have not been told about has waited 5 minutes
            AND EXISTS (SELECT 1 FROM messages m
                         WHERE m.conversation_id = c.id
                           AND m.seq = greatest(cm.last_read_seq, cm.joined_seq, cm.notified_seq) + 1
                           AND m.created_at <= $2)`,
        [tenantId, new Date(now.getTime() - UNREAD_NOTICE_MS)],
      );
      for (const row of due) {
        // Online and active: they see the chat icon's count already
        if (row.member_no !== null && online.has(row.member_no)) continue;
        await this.notifications.notify(
          { tenantId },
          [row.user_id],
          {
            type: 'CHAT_UNREAD',
            data: {
              count: Number(row.last_seq) - Number(row.from_seq),
              ...(row.kind === 'GROUP' ? { conversationId: row.conversation_id } : { userId: row.other_id ?? '' }),
            },
            link: `/chat?c=${row.conversation_id}`,
          },
          db,
        );
        await db.query(
          `UPDATE conversation_members SET notified_seq = $3 WHERE conversation_id = $1 AND user_id = $2`,
          [row.conversation_id, row.user_id, row.last_seq],
        );
      }
    });
  }
}
