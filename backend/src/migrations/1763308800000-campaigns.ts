import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * CMP-4: how often a phone number used a GA's public forms on one day. MongoDB expired these by
 * TTL; here each submission deletes the tenant's expired rows (a sweep job comes in phase 3).
 */
export class Campaigns1763308800000 implements MigrationInterface {
  name = 'Campaigns1763308800000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      CREATE TABLE form_hits (
        id         uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id  uuid NOT NULL REFERENCES tenants (id),
        -- phone:<sha256 of the number>:<day>. PDP: never the number itself
        key        text NOT NULL,
        count      integer NOT NULL DEFAULT 0,
        expires_at timestamptz NOT NULL
      );
      CREATE UNIQUE INDEX form_hits_key ON form_hits (tenant_id, key);
      CREATE INDEX form_hits_expiry_idx ON form_hits (tenant_id, expires_at);

      ALTER TABLE form_hits ENABLE ROW LEVEL SECURITY;
      ALTER TABLE form_hits FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON form_hits
        USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
      GRANT SELECT, INSERT, UPDATE, DELETE ON form_hits TO crm_app, crm_platform;
    `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`DROP TABLE form_hits`);
  }
}
