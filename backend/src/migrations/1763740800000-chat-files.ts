import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Realtime slice C4 (docs/thiet-ke-chat-realtime.md): files and images in chat, search across one's
 * messages without diacritics, and the last message each member was told about (unread notices).
 */
export class ChatFiles1763740800000 implements MigrationInterface {
  name = 'ChatFiles1763740800000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      -- K8 (decided 14/11/2026): images, PDF and Office files up to 10 MB, 5 per message
      CREATE TABLE chat_files (
        id              uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id       uuid NOT NULL,
        conversation_id uuid NOT NULL,
        uploader_id     uuid NOT NULL,
        -- Null until sent with a message; unsent uploads are removed after a day
        message_seq     bigint,
        storage_key     text NOT NULL UNIQUE,
        name            text NOT NULL CHECK (length(name) BETWEEN 1 AND 255),
        content_type    text NOT NULL,
        size            integer NOT NULL CHECK (size > 0 AND size <= 10485760),
        kind            text NOT NULL CHECK (kind IN ('IMAGE', 'FILE')),
        created_at      timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id, conversation_id) REFERENCES conversations (tenant_id, id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, uploader_id) REFERENCES users (tenant_id, id)
      );
      CREATE INDEX chat_files_message_idx ON chat_files (conversation_id, message_seq);
      CREATE INDEX chat_files_unsent_idx ON chat_files (created_at) WHERE message_seq IS NULL;
      CREATE INDEX chat_files_tenant_idx ON chat_files (tenant_id);
      ALTER TABLE chat_files ENABLE ROW LEVEL SECURITY;
      ALTER TABLE chat_files FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON chat_files
        USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
      GRANT SELECT, INSERT, UPDATE, DELETE ON chat_files TO crm_app, crm_platform;

      -- K6: a member is told once about each run of unread messages
      ALTER TABLE conversation_members ADD COLUMN notified_seq bigint NOT NULL DEFAULT 0;

      -- unaccent() is only STABLE, so an index needs this wrapper with its dictionary named
      CREATE FUNCTION immutable_unaccent(text) RETURNS text
        LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
        AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
      CREATE INDEX messages_body_search_idx ON messages
        USING gin (immutable_unaccent(lower(body)) gin_trgm_ops) WHERE body IS NOT NULL;
    `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`
      DROP INDEX messages_body_search_idx;
      DROP FUNCTION immutable_unaccent(text);
      ALTER TABLE conversation_members DROP COLUMN notified_seq;
      DROP TABLE chat_files;
    `);
  }
}
