import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import { ApiException, ErrorCode, forbidden, notFound } from '../../common/errors.js';
import { isId } from '../../common/pagination.js';
import { Role } from '../../common/rbac.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { ObjectStorage } from '../../core/storage/object-storage.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { TenantsService } from '../tenants/tenants.service.js';
import { cleanFileName, MAX_FILE_BYTES, MAX_FILES, sniffFile, utf8FileName } from './chat-files.js';

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

export interface ChatFileInfo {
  id: string;
  name: string;
  size: number;
  contentType: string;
  kind: 'IMAGE' | 'FILE';
}

const MB = 1024 * 1024;

/**
 * Realtime slice C4, K8 (decided 14/11/2026): files and images in chat, kept in object storage.
 * Uploads go to one conversation and wait there until a message carries them; the API streams them
 * back only to someone who may read that message.
 */
@Injectable()
export class ChatFilesService {
  private readonly logger = new Logger(ChatFilesService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly storage: ObjectStorage,
    private readonly tenants: TenantsService,
  ) {}

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  async upload(actor: Actor, conversationId: string, files: UploadedFile[]): Promise<{ items: ChatFileInfo[] }> {
    const scope = this.scopeOf(actor);
    if (!this.storage.enabled)
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.StorageUnavailable);
    if (files.length === 0 || files.length > MAX_FILES)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.ChatTooManyFiles);
    const checked = files.map((file) => {
      if (file.size > MAX_FILE_BYTES)
        throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, ErrorCode.ChatFileTooLarge);
      const originalName = utf8FileName(file.originalname);
      const type = sniffFile(file.buffer, originalName);
      if (!type) throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, ErrorCode.ChatFileType);
      const id = randomUUID();
      return {
        id,
        name: cleanFileName(originalName),
        size: file.size,
        contentType: type.contentType,
        kind: type.kind,
        key: `t/${scope.tenantId}/chat/${conversationId}/${id}`,
        buffer: file.buffer,
      };
    });

    // Membership and the plan's storage limit first; no network call inside a transaction
    await this.tenantDb.run(scope, async (db) => {
      if (!isId(conversationId)) throw notFound();
      const [member] = await rowsOf(
        db,
        `SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 AND left_at IS NULL`,
        [conversationId, actor.id],
      );
      if (!member) throw notFound();
      const { storageMb } = await this.tenants.limits(scope, db);
      if (storageMb !== null && storageMb !== undefined) {
        const [{ used }] = await rowsOf<{ used: string }>(
          db,
          `SELECT coalesce(sum(size), 0) AS used FROM chat_files WHERE tenant_id = $1`,
          [scope.tenantId],
        );
        const adding = checked.reduce((sum, file) => sum + file.size, 0);
        if (Number(used) + adding > storageMb * MB)
          throw new ApiException(HttpStatus.CONFLICT, ErrorCode.PlanStorageLimit);
      }
    });

    for (const file of checked) await this.storage.put(file.key, file.buffer, file.contentType);
    try {
      await this.tenantDb.run(scope, async (db) => {
        for (const file of checked)
          await db.query(
            `INSERT INTO chat_files (id, tenant_id, conversation_id, uploader_id, storage_key, name, content_type, size, kind)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [file.id, scope.tenantId, conversationId, actor.id, file.key, file.name, file.contentType, file.size, file.kind],
          );
      });
    } catch (error) {
      await this.storage.remove(checked.map((file) => file.key)).catch(() => undefined);
      throw error;
    }
    return {
      items: checked.map(({ id, name, size, contentType, kind }) => ({ id, name, size, contentType, kind })),
    };
  }

  /**
   * A file for someone who may read it: a member who can see its message, the uploader before it is
   * sent, or the GA head (K3; reading the conversation is what gets audited).
   */
  async open(actor: Actor, fileId: string): Promise<{ file: ChatFileInfo; body: Readable }> {
    const scope = this.scopeOf(actor);
    if (!isId(fileId)) throw notFound();
    const [row] = await this.tenantDb.run(scope, (db) =>
      rowsOf<{
        id: string;
        name: string;
        size: number;
        content_type: string;
        kind: 'IMAGE' | 'FILE';
        storage_key: string;
        uploader_id: string;
        message_seq: string | null;
        joined_seq: string | null;
      }>(
        db,
        `SELECT f.id, f.name, f.size, f.content_type, f.kind, f.storage_key, f.uploader_id, f.message_seq,
                cm.joined_seq
           FROM chat_files f
           LEFT JOIN conversation_members cm
             ON cm.conversation_id = f.conversation_id AND cm.user_id = $2 AND cm.left_at IS NULL
          WHERE f.id = $1`,
        [fileId, actor.id],
      ),
    );
    if (!row) throw notFound();
    const sent = row.message_seq !== null;
    const allowed = sent
      ? (row.joined_seq !== null && Number(row.message_seq) > Number(row.joined_seq)) ||
        actor.roles.includes(Role.GAD)
      : row.uploader_id === actor.id;
    if (!allowed) throw notFound();
    return {
      file: { id: row.id, name: row.name, size: row.size, contentType: row.content_type, kind: row.kind },
      body: await this.storage.get(row.storage_key),
    };
  }

  /** Uploads never sent within a day go, across every GA (called by the scheduler). */
  async removeUnsent(tenantId: string, now: Date): Promise<number> {
    const keys = (
      await this.tenantDb.run({ tenantId }, (db) =>
        rowsOf<{ storage_key: string }>(
          db,
          `DELETE FROM chat_files WHERE tenant_id = $1 AND message_seq IS NULL AND created_at < $2
           RETURNING storage_key`,
          [tenantId, new Date(now.getTime() - 24 * 3_600_000)],
        ),
      )
    ).map((row) => row.storage_key);
    await this.storage.remove(keys).catch((error: unknown) => this.logger.warn(`Could not remove files: ${String(error)}`));
    return keys.length;
  }
}
