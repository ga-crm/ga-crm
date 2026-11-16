import type { MigrationInterface, QueryRunner } from 'typeorm';

const TENANT_TABLES = ['conversations', 'conversation_members', 'messages'];

/**
 * Realtime slices C2 and C3 (docs/thiet-ke-chat-realtime.md section 3): one-to-one and group chat
 * inside a GA. Each conversation numbers its messages 1, 2, 3... (`seq`), so unread counts are
 * `last_seq - last_read_seq` and a browser can tell when it missed one.
 */
export class Chat1763654400000 implements MigrationInterface {
  name = 'Chat1763654400000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      CREATE TABLE conversations (
        id              uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id       uuid NOT NULL REFERENCES tenants (id),
        kind            text NOT NULL CHECK (kind IN ('DIRECT', 'GROUP')),
        title           text CHECK (title IS NULL OR length(btrim(title)) BETWEEN 1 AND 100),
        -- DIRECT only: '<smaller user id>:<larger user id>', one conversation per pair
        direct_key      text,
        created_by      uuid NOT NULL,
        last_seq        bigint NOT NULL DEFAULT 0,
        last_message_at timestamptz,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),
        CHECK ((kind = 'DIRECT') = (direct_key IS NOT NULL)),
        CHECK ((kind = 'GROUP') = (title IS NOT NULL)),
        UNIQUE (tenant_id, id)
      );
      CREATE UNIQUE INDEX conversations_direct_key ON conversations (tenant_id, direct_key)
        WHERE direct_key IS NOT NULL;
      CREATE INDEX conversations_recent_idx ON conversations (tenant_id, last_message_at DESC NULLS LAST);

      CREATE TABLE conversation_members (
        tenant_id       uuid NOT NULL,
        conversation_id uuid NOT NULL,
        user_id         uuid NOT NULL,
        role            text NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
        -- A member sees the messages after this one: history from before they joined stays hidden
        joined_seq      bigint NOT NULL DEFAULT 0,
        last_read_seq   bigint NOT NULL DEFAULT 0,
        muted           boolean NOT NULL DEFAULT false,
        pinned_at       timestamptz,
        left_at         timestamptz,
        joined_at       timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (conversation_id, user_id),
        FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations (tenant_id, id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id)
      );
      CREATE INDEX conversation_members_user_idx ON conversation_members (tenant_id, user_id)
        WHERE left_at IS NULL;

      CREATE TABLE messages (
        tenant_id       uuid NOT NULL,
        conversation_id uuid NOT NULL,
        seq             bigint NOT NULL CHECK (seq > 0),
        id              uuid NOT NULL DEFAULT uuidv7() UNIQUE,
        -- Null for a SYSTEM message (group created, member added...)
        sender_id       uuid,
        kind            text NOT NULL CHECK (kind IN ('TEXT', 'SYSTEM')),
        -- Null once recalled: the text is wiped, not hidden
        body            text CHECK (body IS NULL OR length(body) <= 4000),
        data            jsonb NOT NULL DEFAULT '{}',
        mentions        uuid[] NOT NULL DEFAULT '{}',
        -- Idempotency: a retried send is the same message
        client_msg_id   uuid,
        edited_at       timestamptz,
        deleted_at      timestamptz,
        created_at      timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (conversation_id, seq),
        FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations (tenant_id, id) ON DELETE CASCADE,
        CHECK ((kind = 'TEXT') = (sender_id IS NOT NULL))
      );
      CREATE UNIQUE INDEX messages_client_msg_key ON messages (conversation_id, sender_id, client_msg_id)
        WHERE client_msg_id IS NOT NULL;
    `);
    for (const table of TENANT_TABLES)
      await db.query(`
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON ${table}
          USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
        GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO crm_app, crm_platform;
      `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`DROP TABLE messages, conversation_members, conversations`);
  }
}
