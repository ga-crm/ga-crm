import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decided on 26/11/2026 (docs/decisions.md): a lead may have supporters ("Người hỗ trợ"): users
 * asked to help with it besides its assignee. A supporter sees the lead as a line manager does:
 * every field but the phone, which the API masks (PDP-3), and may comment but not change it.
 */
export class LeadSupporters1764777600000 implements MigrationInterface {
  name = 'LeadSupporters1764777600000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      CREATE TABLE lead_supporters (
        id         uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id  uuid NOT NULL REFERENCES tenants (id),
        lead_id    uuid NOT NULL,
        user_id    uuid NOT NULL,
        added_by   uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id, lead_id) REFERENCES leads (tenant_id, id) ON DELETE CASCADE,
        FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX lead_supporters_pair_key ON lead_supporters (tenant_id, lead_id, user_id);
      CREATE INDEX lead_supporters_user_idx ON lead_supporters (tenant_id, user_id);

      ALTER TABLE lead_supporters ENABLE ROW LEVEL SECURITY;
      ALTER TABLE lead_supporters FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON lead_supporters
        USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
      GRANT SELECT, INSERT, UPDATE, DELETE ON lead_supporters TO crm_app, crm_platform;
    `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`DROP TABLE lead_supporters`);
  }
}
