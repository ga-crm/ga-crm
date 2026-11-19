import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * USER-16, as decided on 20/11/2026 (docs/decisions.md): the Platform Admin may stop forcing MFA
 * set-up for every GA at once. One row for the whole platform, so it has no tenant_id.
 */
export class PlatformSettings1764086400000 implements MigrationInterface {
  name = 'PlatformSettings1764086400000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      CREATE TABLE platform_settings (
        -- A single row: the key can only be true
        id           boolean PRIMARY KEY DEFAULT true CHECK (id),
        mfa_enforced boolean NOT NULL DEFAULT true,
        updated_at   timestamptz NOT NULL DEFAULT now(),
        updated_by   uuid
      );
      INSERT INTO platform_settings DEFAULT VALUES;

      -- No policy: crm_app sees nothing, and crm_platform bypasses row-level security
      ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE platform_settings FORCE ROW LEVEL SECURITY;
      GRANT SELECT, UPDATE ON platform_settings TO crm_platform;
    `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`DROP TABLE platform_settings`);
  }
}
