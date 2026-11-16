import type { MigrationInterface, QueryRunner } from 'typeorm';

const TENANT_TABLES = ['ai_settings', 'ai_provider_keys'];

/** Section 18.8 (AI-11 to AI-17): each GA's models, router and budget, and its provider keys. */
export class Ai1763481600000 implements MigrationInterface {
  name = 'Ai1763481600000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      -- One per GA, created with the defaults on first read
      CREATE TABLE ai_settings (
        tenant_id           uuid PRIMARY KEY REFERENCES tenants (id),
        -- AI-13: off until the GA head turns it on
        enabled             boolean NOT NULL DEFAULT false,
        -- AI-11: { FAST, BALANCED, DEEP } -> { provider, model }
        tiers               jsonb NOT NULL,
        -- AI-10: the small model that classifies each question
        router              jsonb NOT NULL,
        -- AI-13: tokens a month, 0 = no limit
        monthly_token_limit bigint NOT NULL DEFAULT 0 CHECK (monthly_token_limit >= 0),
        updated_by          uuid,
        updated_at          timestamptz NOT NULL DEFAULT now()
      );

      -- AI-15: write only; no API returns encrypted_key
      CREATE TABLE ai_provider_keys (
        id            uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id     uuid NOT NULL REFERENCES tenants (id),
        provider      text NOT NULL,
        -- AES-256-GCM (common/secret-box.ts), owner "tenantId:provider"
        encrypted_key text NOT NULL,
        last4         text NOT NULL,
        updated_by    uuid NOT NULL,
        updated_at    timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX ai_provider_keys_provider_key ON ai_provider_keys (tenant_id, provider);
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
    await db.query(`DROP TABLE ai_provider_keys, ai_settings`);
  }
}
