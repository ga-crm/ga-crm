import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Section 9.3 (TASK): the private calendar feed of each person (TASK-6), and the lease that keeps
 * the reminder rounds (TASK-7) to one API instance. The tasks table came with the leads.
 */
export class Work1763395200000 implements MigrationInterface {
  name = 'Work1763395200000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      -- TASK-6: one feed link per person; only the hash of its token is kept
      CREATE TABLE calendar_tokens (
        id         uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id  uuid NOT NULL REFERENCES tenants (id),
        user_id    uuid NOT NULL,
        token_hash text NOT NULL,
        created_at timestamptz NOT NULL,
        FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id)
      );
      -- The feed is read by its token alone, across GAs (TEN-6)
      CREATE UNIQUE INDEX calendar_tokens_hash_key ON calendar_tokens (token_hash);
      CREATE UNIQUE INDEX calendar_tokens_user_key ON calendar_tokens (tenant_id, user_id);

      ALTER TABLE calendar_tokens ENABLE ROW LEVEL SECURITY;
      ALTER TABLE calendar_tokens FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON calendar_tokens
        USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
      GRANT SELECT, INSERT, UPDATE, DELETE ON calendar_tokens TO crm_app, crm_platform;

      -- Which instance runs a scheduled job until when. Not tenant data: only the platform role
      CREATE TABLE job_locks (
        name  text PRIMARY KEY,
        owner text NOT NULL,
        until timestamptz NOT NULL
      );
      -- No policy: crm_app sees nothing, and crm_platform bypasses row-level security
      ALTER TABLE job_locks ENABLE ROW LEVEL SECURITY;
      ALTER TABLE job_locks FORCE ROW LEVEL SECURITY;
      GRANT SELECT, INSERT, UPDATE ON job_locks TO crm_platform;
    `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`DROP TABLE job_locks, calendar_tokens`);
  }
}
