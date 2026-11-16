import { HttpStatus, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  ApiException,
  ErrorCode,
  forbidden,
  notFound,
} from '../../common/errors.js';
import { escapeLike, isId } from '../../common/pagination.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { afterCommit } from '../../core/persistence/after-commit.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { ObjectStorage } from '../../core/storage/object-storage.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { RealtimeEvent } from '../realtime/realtime.events.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import {
  canEdit,
  canManage,
  canRemove,
  directKey,
  GROUP_MAX,
  nextOwner,
  unreadOf,
} from './chat-rules.js';
import type { ChatRole } from './chat-rules.js';
import type {
  ChatPrefsDto,
  CreateGroupDto,
  MessagesQueryDto,
  ReviewQueryDto,
  SendMessageDto,
} from './chat.dto.js';

type Kind = 'DIRECT' | 'GROUP';

/** What SYSTEM messages record; the browser words them. */
type SystemEvent =
  | { event: 'created' }
  | { event: 'renamed'; title: string }
  | { event: 'added'; userIds: string[] }
  | { event: 'removed'; userIds: string[] }
  | { event: 'left'; newOwnerId?: string }
  | { event: 'role'; userIds: string[]; role: 'ADMIN' | 'MEMBER' };

interface MessageRow {
  conversation_id: string;
  seq: string;
  id: string;
  sender_id: string | null;
  sender_name: string | null;
  kind: 'TEXT' | 'SYSTEM';
  body: string | null;
  data: Record<string, unknown>;
  mentions: string[];
  edited_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
}

interface Membership {
  conversation_id: string;
  kind: Kind;
  title: string | null;
  last_seq: string;
  role: ChatRole;
  joined_seq: string;
  last_read_seq: string;
}

const MESSAGE_COLUMNS = `m.conversation_id, m.seq, m.id, m.sender_id, u.name AS sender_name, m.kind,
  m.body, m.data, m.mentions, m.edited_at, m.deleted_at, m.created_at`;

export function toMessage(row: MessageRow) {
  return {
    conversationId: row.conversation_id,
    seq: Number(row.seq),
    id: row.id,
    senderId: row.sender_id,
    senderName: row.sender_name,
    kind: row.kind,
    body: row.body,
    data: row.data,
    mentions: row.mentions,
    editedAt: row.edited_at,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
  };
}
export type ChatMessage = ReturnType<typeof toMessage>;

const isUniqueViolation = (error: unknown) =>
  (error as { code?: string } | null)?.code === '23505';

/** How long the member list of a conversation is reused for typing indicators. */
const MEMBERS_CACHE_MS = 15_000;

/**
 * Realtime slices C2 and C3: one-to-one and group chat inside a GA. Rows live in PostgreSQL under
 * row-level security; each committed message is pushed to its members' sockets. Messages are not
 * audited one by one (the table itself is the record); conversations, membership changes and the
 * GA head reading others' chats are (decisions.md, 14/11/2026).
 */
@Injectable()
export class ChatService {
  private readonly memberCache = new Map<
    string,
    { at: number; ids: string[] }
  >();

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
    private readonly notifications: NotificationsService,
    private readonly storage: ObjectStorage,
  ) {}

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  /** K1: anyone active in the GA, to start a conversation with. */
  async people(actor: Actor, q?: string) {
    const scope = this.scopeOf(actor);
    const search = q ? `%${escapeLike(q)}%` : null;
    const rows = await this.tenantDb.run(scope, (db) =>
      rowsOf<{ id: string; name: string; email: string; agent_code: string | null }>(
        db,
        `SELECT id, name, email, agent_code FROM users
          WHERE tenant_id = $1 AND status = 'ACTIVE' AND id <> $2
            AND ($3::text IS NULL OR name ILIKE $3 OR email ILIKE $3 OR agent_code ILIKE $3)
          ORDER BY name LIMIT 20`,
        [scope.tenantId, actor.id, search],
      ),
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        agentCode: row.agent_code,
      })),
    };
  }

  /** The actor's conversations, pinned first then the most recent. */
  async list(actor: Actor) {
    const scope = this.scopeOf(actor);
    const rows = await this.tenantDb.run(scope, (db) =>
      rowsOf<{
        id: string;
        kind: Kind;
        title: string | null;
        last_seq: string;
        last_message_at: Date | null;
        created_at: Date;
        role: ChatRole;
        joined_seq: string;
        last_read_seq: string;
        muted: boolean;
        pinned_at: Date | null;
        member_count: number;
        other_id: string | null;
        other_name: string | null;
        other_status: string | null;
        lm_seq: string | null;
        lm_kind: 'TEXT' | 'SYSTEM' | null;
        lm_body: string | null;
        lm_data: Record<string, unknown> | null;
        lm_sender_id: string | null;
        lm_sender_name: string | null;
        lm_deleted_at: Date | null;
        lm_created_at: Date | null;
      }>(
        db,
        `SELECT c.id, c.kind, c.title, c.last_seq, c.last_message_at, c.created_at,
                cm.role, cm.joined_seq, cm.last_read_seq, cm.muted, cm.pinned_at,
                (SELECT count(*)::int FROM conversation_members x
                  WHERE x.conversation_id = c.id AND x.left_at IS NULL) AS member_count,
                other.id AS other_id, other.name AS other_name, other.status AS other_status,
                lm.seq AS lm_seq, lm.kind AS lm_kind, lm.body AS lm_body, lm.data AS lm_data,
                lm.sender_id AS lm_sender_id, su.name AS lm_sender_name,
                lm.deleted_at AS lm_deleted_at, lm.created_at AS lm_created_at
           FROM conversation_members cm
           JOIN conversations c ON c.id = cm.conversation_id
           LEFT JOIN LATERAL (
             SELECT u.id, u.name, u.status FROM conversation_members o JOIN users u ON u.id = o.user_id
              WHERE c.kind = 'DIRECT' AND o.conversation_id = c.id AND o.user_id <> cm.user_id
              LIMIT 1) other ON true
           LEFT JOIN messages lm
             ON lm.conversation_id = c.id AND lm.seq = c.last_seq AND c.last_seq > cm.joined_seq
           LEFT JOIN users su ON su.id = lm.sender_id
          WHERE cm.tenant_id = $1 AND cm.user_id = $2 AND cm.left_at IS NULL
            -- An empty one-to-one shows only to whoever opened it
            AND (c.kind = 'GROUP' OR c.last_seq > 0 OR c.created_by = cm.user_id)
          ORDER BY cm.pinned_at DESC NULLS LAST, coalesce(c.last_message_at, c.created_at) DESC
          LIMIT 200`,
        [scope.tenantId, actor.id],
      ),
    );
    return {
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.kind === 'DIRECT' ? row.other_name : row.title,
        other:
          row.kind === 'DIRECT' && row.other_id
            ? { id: row.other_id, name: row.other_name, active: row.other_status === 'ACTIVE' }
            : null,
        memberCount: row.member_count,
        role: row.role,
        muted: row.muted,
        pinned: !!row.pinned_at,
        lastSeq: Number(row.last_seq),
        unread: unreadOf(Number(row.last_seq), Number(row.last_read_seq), Number(row.joined_seq)),
        lastMessage: row.lm_seq
          ? {
              seq: Number(row.lm_seq),
              kind: row.lm_kind,
              body: row.lm_body,
              data: row.lm_data,
              senderId: row.lm_sender_id,
              senderName: row.lm_sender_name,
              deleted: !!row.lm_deleted_at,
              createdAt: row.lm_created_at,
            }
          : null,
        updatedAt: row.last_message_at ?? row.created_at,
      })),
    };
  }

  /** The number on the chat icon: unread messages of conversations that are not muted. */
  async unreadTotal(actor: Actor): Promise<{ unread: number }> {
    const scope = this.scopeOf(actor);
    const [row] = await this.tenantDb.run(scope, (db) =>
      rowsOf<{ unread: number }>(
        db,
        `SELECT coalesce(sum(greatest(0, c.last_seq - greatest(cm.last_read_seq, cm.joined_seq))), 0)::int AS unread
           FROM conversation_members cm JOIN conversations c ON c.id = cm.conversation_id
          WHERE cm.tenant_id = $1 AND cm.user_id = $2 AND cm.left_at IS NULL AND NOT cm.muted`,
        [scope.tenantId, actor.id],
      ),
    );
    return { unread: row.unread };
  }

  /** One conversation with its current members. TEN-3: not a member (or another GA) looks missing. */
  async get(actor: Actor, id: string) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const me = await this.membership(db, id, actor.id);
      const members = await this.members(db, id);
      const other =
        me.kind === 'DIRECT'
          ? members.find((member) => member.id !== actor.id)
          : undefined;
      return {
        id,
        kind: me.kind,
        title: me.kind === 'DIRECT' ? (other?.name ?? null) : me.title,
        role: me.role,
        lastSeq: Number(me.last_seq),
        members,
      };
    });
  }

  /** Opens the one-to-one conversation with a colleague, creating it the first time. */
  async openDirect(actor: Actor, userId: string): Promise<{ id: string }> {
    const scope = this.scopeOf(actor);
    if (userId === actor.id)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput);
    const key = directKey(actor.id, userId);
    return this.tenantDb.run(scope, async (db) => {
      await this.assertActive(db, scope.tenantId, [userId]);
      const [created] = await rowsOf<{ id: string }>(
        db,
        `INSERT INTO conversations (tenant_id, kind, direct_key, created_by)
         VALUES ($1, 'DIRECT', $2, $3)
         ON CONFLICT (tenant_id, direct_key) WHERE direct_key IS NOT NULL DO NOTHING
         RETURNING id`,
        [scope.tenantId, key, actor.id],
      );
      if (!created) {
        const [existing] = await rowsOf<{ id: string }>(
          db,
          `SELECT id FROM conversations WHERE tenant_id = $1 AND direct_key = $2`,
          [scope.tenantId, key],
        );
        return { id: existing.id };
      }
      await db.query(
        `INSERT INTO conversation_members (tenant_id, conversation_id, user_id, role)
         VALUES ($1, $2, $3, 'MEMBER'), ($1, $2, $4, 'MEMBER')`,
        [scope.tenantId, created.id, actor.id, userId],
      );
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Create,
          entity: 'conversation',
          entityId: created.id,
          meta: { kind: 'DIRECT' },
        },
        db,
      );
      return { id: created.id };
    });
  }

  /** C3: a group; the creator owns it. */
  async createGroup(actor: Actor, dto: CreateGroupDto): Promise<{ id: string }> {
    const scope = this.scopeOf(actor);
    const others = [...new Set(dto.memberIds)].filter((id) => id !== actor.id);
    if (others.length + 1 > GROUP_MAX)
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ChatGroupTooLarge);
    return this.tenantDb.run(scope, async (db) => {
      await this.assertActive(db, scope.tenantId, others);
      const [conversation] = await rowsOf<{ id: string }>(
        db,
        `INSERT INTO conversations (tenant_id, kind, title, created_by)
         VALUES ($1, 'GROUP', $2, $3) RETURNING id`,
        [scope.tenantId, dto.title, actor.id],
      );
      await db.query(
        `INSERT INTO conversation_members (tenant_id, conversation_id, user_id, role)
         SELECT $1, $2, member, CASE WHEN member = $3 THEN 'OWNER' ELSE 'MEMBER' END
           FROM unnest($4::uuid[]) AS member`,
        [scope.tenantId, conversation.id, actor.id, [actor.id, ...others]],
      );
      await this.system(db, scope.tenantId, conversation.id, actor, { event: 'created' });
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Create,
          entity: 'conversation',
          entityId: conversation.id,
          meta: { kind: 'GROUP', members: others.length + 1 },
        },
        db,
      );
      return conversation;
    });
  }

  async rename(actor: Actor, id: string, title: string): Promise<void> {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      const me = await this.membership(db, id, actor.id);
      if (me.kind !== 'GROUP' || !canManage(me.role)) throw forbidden();
      await db.query(
        `UPDATE conversations SET title = $2, updated_at = now() WHERE id = $1`,
        [id, title],
      );
      await this.system(db, scope.tenantId, id, actor, { event: 'renamed', title });
      await this.auditGroup(db, actor, id, { fields: ['title'] });
    });
  }

  /** Adds people, or brings back people who left; they see the history from now on only. */
  async addMembers(actor: Actor, id: string, userIds: string[]): Promise<void> {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      const me = await this.membership(db, id, actor.id);
      if (me.kind !== 'GROUP' || !canManage(me.role)) throw forbidden();
      const current = new Set((await this.members(db, id)).map((member) => member.id));
      const added = [...new Set(userIds)].filter((userId) => !current.has(userId));
      if (added.length === 0) return;
      if (current.size + added.length > GROUP_MAX)
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ChatGroupTooLarge);
      await this.assertActive(db, scope.tenantId, added);
      await db.query(
        `INSERT INTO conversation_members (tenant_id, conversation_id, user_id, role, joined_seq)
         SELECT $1, $2, member, 'MEMBER', (SELECT last_seq FROM conversations WHERE id = $2)
           FROM unnest($3::uuid[]) AS member
         ON CONFLICT (conversation_id, user_id) DO UPDATE
           SET left_at = NULL, role = 'MEMBER', joined_seq = EXCLUDED.joined_seq,
               last_read_seq = EXCLUDED.joined_seq, joined_at = now(), muted = false, pinned_at = NULL`,
        [scope.tenantId, id, added],
      );
      this.memberCache.delete(id);
      await this.system(db, scope.tenantId, id, actor, { event: 'added', userIds: added });
      await this.auditGroup(db, actor, id, { added });
    });
  }

  /** Removes someone, or leaves when it is the actor; an owner who leaves hands the group on. */
  async removeMember(actor: Actor, id: string, userId: string): Promise<void> {
    const scope = this.scopeOf(actor);
    const removed = await this.tenantDb.run(scope, async (db) => {
      const me = await this.membership(db, id, actor.id);
      if (me.kind !== 'GROUP') throw forbidden();
      const members = await this.members(db, id);
      const target = members.find((member) => member.id === userId);
      if (!target) throw notFound();
      const leaving = userId === actor.id;
      if (!leaving && !canRemove(me.role, target.role)) throw forbidden();

      await db.query(
        `UPDATE conversation_members SET left_at = now(), pinned_at = NULL
          WHERE conversation_id = $1 AND user_id = $2`,
        [id, userId],
      );
      let newOwnerId: string | undefined;
      if (leaving && me.role === 'OWNER') {
        newOwnerId =
          nextOwner(
            members
              .filter((member) => member.id !== actor.id)
              .map((member) => ({ userId: member.id, role: member.role })),
          ) ?? undefined;
        if (newOwnerId)
          await db.query(
            `UPDATE conversation_members SET role = 'OWNER' WHERE conversation_id = $1 AND user_id = $2`,
            [id, newOwnerId],
          );
      }
      this.memberCache.delete(id);
      await this.system(
        db,
        scope.tenantId,
        id,
        actor,
        leaving ? { event: 'left', ...(newOwnerId && { newOwnerId }) } : { event: 'removed', userIds: [userId] },
      );
      await this.auditGroup(db, actor, id, leaving ? { left: true } : { removed: [userId] });
      return userId;
    });
    // The person who is no longer a member drops the conversation from their list
    this.realtime.toUsers([removed], RealtimeEvent.ChatConversation, { conversationId: id });
  }

  /** The owner names admins, or takes the role back. */
  async setRole(
    actor: Actor,
    id: string,
    userId: string,
    role: 'ADMIN' | 'MEMBER',
  ): Promise<void> {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      const me = await this.membership(db, id, actor.id);
      if (me.kind !== 'GROUP' || me.role !== 'OWNER' || userId === actor.id)
        throw forbidden();
      const target = (await this.members(db, id)).find((member) => member.id === userId);
      if (!target) throw notFound();
      if (target.role === role) return;
      await db.query(
        `UPDATE conversation_members SET role = $3 WHERE conversation_id = $1 AND user_id = $2`,
        [id, userId, role],
      );
      await this.system(db, scope.tenantId, id, actor, { event: 'role', userIds: [userId], role });
      await this.auditGroup(db, actor, id, { role, userId });
    });
  }

  /** Mute (left out of the chat icon's count) and pin (listed first), for the actor only. */
  async setPrefs(actor: Actor, id: string, dto: ChatPrefsDto): Promise<void> {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      await this.membership(db, id, actor.id);
      await db.query(
        `UPDATE conversation_members
            SET muted = coalesce($3, muted),
                pinned_at = CASE WHEN $4::boolean IS NULL THEN pinned_at
                                 WHEN $4 THEN coalesce(pinned_at, now()) ELSE NULL END
          WHERE conversation_id = $1 AND user_id = $2`,
        [id, actor.id, dto.muted ?? null, dto.pinned ?? null],
      );
      afterCommit(db, () =>
        this.realtime.toUsers([actor.id], RealtimeEvent.ChatConversation, { conversationId: id }),
      );
    });
  }

  /** A page of messages, oldest first. A member never sees what was sent before they joined. */
  async messages(actor: Actor, id: string, query: MessagesQueryDto) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const me = await this.membership(db, id, actor.id);
      return this.page(db, id, Number(me.joined_seq), query);
    });
  }

  /**
   * Sends a message. The conversation row is locked while its number is taken, so one
   * conversation's messages are numbered 1, 2, 3... without gaps; different conversations still
   * write in parallel. A retry with the same clientMsgId returns the first message.
   */
  async send(actor: Actor, id: string, dto: SendMessageDto): Promise<ChatMessage> {
    const scope = this.scopeOf(actor);
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.tenantDb.run(scope, async (db) => {
          const me = await this.membership(db, id, actor.id);
          const [existing] = await rowsOf<MessageRow>(
            db,
            `SELECT ${MESSAGE_COLUMNS} FROM messages m LEFT JOIN users u ON u.id = m.sender_id
              WHERE m.conversation_id = $1 AND m.sender_id = $2 AND m.client_msg_id = $3`,
            [id, actor.id, dto.clientMsgId],
          );
          if (existing) return toMessage(existing);

          const members = await this.members(db, id);
          // A one-to-one with someone who has left the GA is read-only
          if (me.kind === 'DIRECT' && members.some((member) => !member.active))
            throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ChatMemberInactive);
          const memberIds = new Set(members.map((member) => member.id));
          const mentions =
            me.kind === 'GROUP'
              ? [...new Set(dto.mentions ?? [])].filter(
                  (userId) => memberIds.has(userId) && userId !== actor.id,
                )
              : [];
          const body = dto.body ?? '';
          const fileIds = [...new Set(dto.fileIds ?? [])];
          if (!body && fileIds.length === 0)
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput);
          // K8: files uploaded to this conversation by the sender and not sent yet
          const files = fileIds.length
            ? await rowsOf<{ id: string; name: string; size: number; content_type: string; kind: string }>(
                db,
                `SELECT id, name, size, content_type, kind FROM chat_files
                  WHERE id = ANY($1::uuid[]) AND conversation_id = $2 AND uploader_id = $3 AND message_seq IS NULL`,
                [fileIds, id, actor.id],
              )
            : [];
          if (files.length !== fileIds.length) throw notFound();
          const ordered = fileIds.map((fileId) => files.find((file) => file.id === fileId)!);
          const message = await this.append(db, scope.tenantId, id, {
            senderId: actor.id,
            senderName: actor.name,
            kind: 'TEXT',
            body,
            mentions,
            clientMsgId: dto.clientMsgId,
            ...(ordered.length > 0 && {
              data: {
                files: ordered.map((file) => ({
                  id: file.id,
                  name: file.name,
                  size: file.size,
                  contentType: file.content_type,
                  kind: file.kind,
                })),
              },
            }),
          });
          if (fileIds.length)
            await db.query(`UPDATE chat_files SET message_seq = $2 WHERE id = ANY($1::uuid[])`, [fileIds, message.seq]);
          // K6: someone named in a group hears about it at once, even with the group muted
          if (mentions.length)
            await this.notifications.notify(
              scope,
              mentions,
              {
                type: 'CHAT_MENTION',
                data: { userId: actor.id, conversationId: id },
                link: `/chat?c=${id}&m=${message.seq}`,
              },
              db,
            );
          // Your own message counts as read
          await db.query(
            `UPDATE conversation_members SET last_read_seq = $3 WHERE conversation_id = $1 AND user_id = $2`,
            [id, actor.id, message.seq],
          );
          return message;
        });
      } catch (error) {
        // Two sends of the same clientMsgId at once: the second finds the first on retry
        if (attempt === 0 && isUniqueViolation(error)) continue;
        throw error;
      }
    }
  }

  /** The author fixes a message within 15 minutes. */
  async edit(actor: Actor, id: string, seq: number, body: string): Promise<void> {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      await this.membership(db, id, actor.id);
      const row = await this.ownMessage(db, id, seq, actor.id);
      if (!canEdit(row.created_at))
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ChatEditWindowClosed);
      await db.query(
        `UPDATE messages SET body = $3, edited_at = now() WHERE conversation_id = $1 AND seq = $2`,
        [id, seq, body],
      );
      await this.announceUpdate(db, id, seq);
    });
  }

  /** The author recalls a message; its text is wiped, not hidden. */
  async recall(actor: Actor, id: string, seq: number): Promise<void> {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      await this.membership(db, id, actor.id);
      await this.ownMessage(db, id, seq, actor.id);
      await db.query(
        `UPDATE messages SET body = NULL, mentions = '{}', data = data - 'files', deleted_at = now()
          WHERE conversation_id = $1 AND seq = $2`,
        [id, seq],
      );
      // PDP: a recalled file is deleted, not hidden
      const keys = (
        await rowsOf<{ storage_key: string }>(
          db,
          `DELETE FROM chat_files WHERE conversation_id = $1 AND message_seq = $2 RETURNING storage_key`,
          [id, seq],
        )
      ).map((row) => row.storage_key);
      if (keys.length) afterCommit(db, () => this.storage.remove(keys));
      await this.announceUpdate(db, id, seq);
    });
  }

  /** Read up to `seq`; never goes back, never past the last message. Other members see it ("seen"). */
  async markRead(actor: Actor, id: string, seq: number): Promise<void> {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      await this.membership(db, id, actor.id);
      const [row] = await rowsOf<{ last_read_seq: string }>(
        db,
        `UPDATE conversation_members cm
            SET last_read_seq = least($3, c.last_seq)
           FROM conversations c
          WHERE c.id = cm.conversation_id AND cm.conversation_id = $1 AND cm.user_id = $2
            AND cm.last_read_seq < least($3, c.last_seq)
         RETURNING cm.last_read_seq`,
        [id, actor.id, seq],
      );
      if (!row) return;
      const members = (await this.members(db, id)).map((member) => member.id);
      afterCommit(db, () =>
        this.realtime.toUsers(members, RealtimeEvent.ChatRead, {
          conversationId: id,
          userId: actor.id,
          seq: Number(row.last_read_seq),
        }),
      );
    });
  }

  /**
   * Messages of the actor's conversations containing `q`, newest first. Diacritics and case are
   * ignored ("khach" finds "Khách"); a member never finds what was said before they joined.
   */
  async search(actor: Actor, q: string) {
    const scope = this.scopeOf(actor);
    const rows = await this.tenantDb.run(scope, (db) =>
      rowsOf<{
        conversation_id: string;
        seq: string;
        body: string;
        created_at: Date;
        sender_name: string | null;
        kind: Kind;
        title: string | null;
        other_name: string | null;
      }>(
        db,
        `SELECT m.conversation_id, m.seq, m.body, m.created_at, u.name AS sender_name,
                c.kind, c.title, other.name AS other_name
           FROM messages m
           JOIN conversation_members cm
             ON cm.conversation_id = m.conversation_id AND cm.user_id = $2 AND cm.left_at IS NULL
           JOIN conversations c ON c.id = m.conversation_id
           LEFT JOIN users u ON u.id = m.sender_id
           LEFT JOIN LATERAL (
             SELECT ou.name FROM conversation_members o JOIN users ou ON ou.id = o.user_id
              WHERE c.kind = 'DIRECT' AND o.conversation_id = c.id AND o.user_id <> $2 LIMIT 1) other ON true
          WHERE m.tenant_id = $1 AND m.kind = 'TEXT' AND m.deleted_at IS NULL AND m.body IS NOT NULL
            AND m.seq > cm.joined_seq
            AND immutable_unaccent(lower(m.body)) LIKE '%' || immutable_unaccent(lower($3)) || '%'
          ORDER BY m.created_at DESC
          LIMIT 30`,
        [scope.tenantId, actor.id, escapeLike(q)],
      ),
    );
    return {
      items: rows.map((row) => ({
        conversationId: row.conversation_id,
        conversationTitle: row.kind === 'DIRECT' ? row.other_name : row.title,
        kind: row.kind,
        seq: Number(row.seq),
        body: row.body,
        senderName: row.sender_name,
        createdAt: row.created_at,
      })),
    };
  }

  /** For typing indicators: the other members, if `userId` is one (cached briefly). */
  async typingTargets(tenantId: string, id: string, userId: string): Promise<string[]> {
    if (!isId(id)) return [];
    const cached = this.memberCache.get(id);
    let ids = cached && Date.now() - cached.at < MEMBERS_CACHE_MS ? cached.ids : null;
    if (!ids) {
      ids = await this.tenantDb.run({ tenantId }, async (db) =>
        (
          await rowsOf<{ user_id: string }>(
            db,
            `SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND left_at IS NULL`,
            [id],
          )
        ).map((row) => row.user_id),
      );
      this.memberCache.set(id, { at: Date.now(), ids });
    }
    return ids.includes(userId) ? ids.filter((member) => member !== userId) : [];
  }

  /** K3: every conversation of the GA, for the GA head (who chats with whom, not what). */
  async reviewList(actor: Actor, query: ReviewQueryDto) {
    const scope = this.scopeOf(actor);
    const search = query.q ? `%${escapeLike(query.q)}%` : null;
    return this.tenantDb.run(scope, async (db) => {
      const rows = await rowsOf<{
        id: string;
        kind: Kind;
        title: string | null;
        last_seq: string;
        last_message_at: Date | null;
        created_at: Date;
        member_names: string[];
        total: number;
      }>(
        db,
        `SELECT c.id, c.kind, c.title, c.last_seq, c.last_message_at, c.created_at,
                array(SELECT u.name FROM conversation_members x JOIN users u ON u.id = x.user_id
                       WHERE x.conversation_id = c.id AND x.left_at IS NULL ORDER BY u.name) AS member_names,
                count(*) OVER ()::int AS total
           FROM conversations c
          WHERE c.tenant_id = $1 AND c.last_seq > 0
            AND ($2::text IS NULL OR c.title ILIKE $2 OR EXISTS (
                  SELECT 1 FROM conversation_members x JOIN users u ON u.id = x.user_id
                   WHERE x.conversation_id = c.id AND u.name ILIKE $2))
          ORDER BY c.last_message_at DESC NULLS LAST
          LIMIT $3 OFFSET $4`,
        [scope.tenantId, search, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        items: rows.map((row) => ({
          id: row.id,
          kind: row.kind,
          title: row.title,
          memberNames: row.member_names,
          messages: Number(row.last_seq),
          lastMessageAt: row.last_message_at,
        })),
        page: query.page,
        pageSize: query.pageSize,
        total: rows[0]?.total ?? 0,
      };
    });
  }

  /** K3: the GA head reads a conversation; each page read is audited in the same transaction. */
  async reviewMessages(actor: Actor, id: string, query: MessagesQueryDto) {
    const scope = this.scopeOf(actor);
    if (!isId(id)) throw notFound();
    return this.tenantDb.run(scope, async (db) => {
      const [conversation] = await rowsOf<{ kind: Kind; title: string | null }>(
        db,
        `SELECT kind, title FROM conversations WHERE id = $1 AND tenant_id = $2`,
        [id, scope.tenantId],
      );
      if (!conversation) throw notFound();
      const page = await this.page(db, id, 0, query);
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.ChatRead,
          entity: 'conversation',
          entityId: id,
          meta: {
            from: page.items[0]?.seq ?? null,
            to: page.items.at(-1)?.seq ?? null,
          },
        },
        db,
      );
      return {
        conversation: {
          id,
          kind: conversation.kind,
          title: conversation.title,
          members: await this.members(db, id),
        },
        ...page,
      };
    });
  }

  // ---- helpers ----

  private async membership(db: EntityManager, id: string, userId: string): Promise<Membership> {
    if (!isId(id)) throw notFound();
    const [row] = await rowsOf<Membership>(
      db,
      `SELECT cm.conversation_id, c.kind, c.title, c.last_seq, cm.role, cm.joined_seq, cm.last_read_seq
         FROM conversation_members cm JOIN conversations c ON c.id = cm.conversation_id
        WHERE cm.conversation_id = $1 AND cm.user_id = $2 AND cm.left_at IS NULL`,
      [id, userId],
    );
    if (!row) throw notFound();
    return row;
  }

  /** Current members, in the order they joined. */
  private async members(db: EntityManager, id: string) {
    const rows = await rowsOf<{
      user_id: string;
      name: string;
      role: ChatRole;
      last_read_seq: string;
      status: string;
    }>(
      db,
      `SELECT cm.user_id, u.name, cm.role, cm.last_read_seq, u.status
         FROM conversation_members cm JOIN users u ON u.id = cm.user_id
        WHERE cm.conversation_id = $1 AND cm.left_at IS NULL
        ORDER BY cm.joined_at, cm.user_id`,
      [id],
    );
    return rows.map((row) => ({
      id: row.user_id,
      name: row.name,
      role: row.role,
      lastReadSeq: Number(row.last_read_seq),
      active: row.status === 'ACTIVE',
    }));
  }

  /** K1: the people exist in this GA (else 404) and can sign in (else chat_member_inactive). */
  private async assertActive(db: EntityManager, tenantId: string, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    if (!ids.every(isId)) throw notFound();
    const rows = await rowsOf<{ id: string; status: string }>(
      db,
      `SELECT id, status FROM users WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
      [tenantId, ids],
    );
    if (rows.length !== new Set(ids).size) throw notFound();
    if (rows.some((row) => row.status !== 'ACTIVE'))
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ChatMemberInactive);
  }

  private async page(db: EntityManager, id: string, joinedSeq: number, query: MessagesQueryDto) {
    const limit = query.limit ?? 50;
    let rows: MessageRow[];
    if (query.after !== undefined) {
      rows = await rowsOf<MessageRow>(
        db,
        `SELECT ${MESSAGE_COLUMNS} FROM messages m LEFT JOIN users u ON u.id = m.sender_id
          WHERE m.conversation_id = $1 AND m.seq > greatest($2::bigint, $3::bigint)
          ORDER BY m.seq LIMIT $4`,
        [id, joinedSeq, query.after, limit + 1],
      );
      const hasMore = rows.length > limit;
      return { items: rows.slice(0, limit).map(toMessage), hasMore };
    }
    rows = await rowsOf<MessageRow>(
      db,
      `SELECT ${MESSAGE_COLUMNS} FROM messages m LEFT JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = $1 AND m.seq > $2 AND ($3::bigint IS NULL OR m.seq < $3)
        ORDER BY m.seq DESC LIMIT $4`,
      [id, joinedSeq, query.before ?? null, limit + 1],
    );
    const hasMore = rows.length > limit;
    return { items: rows.slice(0, limit).reverse().map(toMessage), hasMore };
  }

  private async ownMessage(db: EntityManager, id: string, seq: number, userId: string) {
    const [row] = await rowsOf<{ created_at: Date }>(
      db,
      `SELECT created_at FROM messages
        WHERE conversation_id = $1 AND seq = $2 AND sender_id = $3 AND kind = 'TEXT' AND deleted_at IS NULL`,
      [id, seq, userId],
    );
    if (!row) throw notFound();
    return row;
  }

  /** Takes the next number of the conversation and stores the message; pushed after commit. */
  private async append(
    db: EntityManager,
    tenantId: string,
    id: string,
    input: {
      senderId: string | null;
      senderName: string | null;
      kind: 'TEXT' | 'SYSTEM';
      body: string | null;
      data?: Record<string, unknown>;
      mentions?: string[];
      clientMsgId?: string;
    },
  ): Promise<ChatMessage> {
    const [{ last_seq: seq }] = await rowsOf<{ last_seq: string }>(
      db,
      `UPDATE conversations SET last_seq = last_seq + 1, last_message_at = now(), updated_at = now()
        WHERE id = $1 RETURNING last_seq`,
      [id],
    );
    const [row] = await rowsOf<Omit<MessageRow, 'sender_name'>>(
      db,
      `INSERT INTO messages (tenant_id, conversation_id, seq, sender_id, kind, body, data, mentions, client_msg_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING conversation_id, seq, id, sender_id, kind, body, data, mentions, edited_at, deleted_at, created_at`,
      [
        tenantId,
        id,
        seq,
        input.senderId,
        input.kind,
        input.body,
        input.data ?? {},
        input.mentions ?? [],
        input.clientMsgId ?? null,
      ],
    );
    const message = toMessage({ ...row, sender_name: input.senderName });
    const members = (await this.members(db, id)).map((member) => member.id);
    afterCommit(db, () => {
      this.realtime.toUsers(members, RealtimeEvent.ChatMessage, message);
    });
    return message;
  }

  /** A SYSTEM message ("X added Y"); the actor is in `data` so the browser can word it. */
  private async system(
    db: EntityManager,
    tenantId: string,
    id: string,
    actor: Actor,
    event: SystemEvent,
  ): Promise<void> {
    // Names as they were at the time, so "A removed B" still reads right after B has gone
    const named = 'userIds' in event ? event.userIds : 'newOwnerId' in event && event.newOwnerId ? [event.newOwnerId] : [];
    const names = named.length
      ? Object.fromEntries(
          (
            await rowsOf<{ id: string; name: string }>(
              db,
              `SELECT id, name FROM users WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
              [tenantId, named],
            )
          ).map((row) => [row.id, row.name]),
        )
      : {};
    await this.append(db, tenantId, id, {
      senderId: null,
      senderName: null,
      kind: 'SYSTEM',
      body: null,
      data: { ...event, actorId: actor.id, actorName: actor.name, names },
    });
    const members = (await this.members(db, id)).map((member) => member.id);
    afterCommit(db, () =>
      this.realtime.toUsers(members, RealtimeEvent.ChatConversation, { conversationId: id }),
    );
  }

  private async announceUpdate(db: EntityManager, id: string, seq: number): Promise<void> {
    await db.query(`UPDATE conversations SET updated_at = now() WHERE id = $1`, [id]);
    const members = (await this.members(db, id)).map((member) => member.id);
    afterCommit(db, () =>
      this.realtime.toUsers(members, RealtimeEvent.ChatUpdated, { conversationId: id, seq }),
    );
  }

  private async auditGroup(
    db: EntityManager,
    actor: Actor,
    id: string,
    meta: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record(
      {
        tenantId: actor.tenantId,
        userId: actor.id,
        action: AuditAction.Update,
        entity: 'conversation',
        entityId: id,
        meta,
      },
      db,
    );
  }
}
