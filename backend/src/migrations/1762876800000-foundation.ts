import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Foundation: tenancy (TEN-1..TEN-7), identity tables, audit, outbox, idempotency.
 * Runs as the owner. The API roles crm_app and crm_platform come from infra/postgres/init.
 */
export class Foundation1762876800000 implements MigrationInterface {
  name = 'Foundation1762876800000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      CREATE EXTENSION IF NOT EXISTS pg_trgm;
      CREATE EXTENSION IF NOT EXISTS unaccent;
      CREATE EXTENSION IF NOT EXISTS ltree;

      -- TEN-1: the tenant pinned by the current transaction. It errors when nothing was pinned,
      -- so a query that forgot its tenant fails loudly instead of returning someone else's rows.
      CREATE FUNCTION app_tenant() RETURNS uuid
        LANGUAGE sql STABLE PARALLEL SAFE
        AS $$ SELECT current_setting('app.tenant_id')::uuid $$;

      CREATE FUNCTION touch_updated_at() RETURNS trigger
        LANGUAGE plpgsql
        AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

      -- TENANT-1
      CREATE TABLE tenants (
        id                  uuid PRIMARY KEY DEFAULT uuidv7(),
        ga_code             text NOT NULL CHECK (ga_code <> '' AND ga_code = upper(btrim(ga_code))),
        name                text NOT NULL CHECK (btrim(name) <> ''),
        status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
        plan                text NOT NULL DEFAULT 'standard',
        -- Section 5.2: null = no limit
        max_users           integer CHECK (max_users > 0),
        ai_tokens_per_month integer CHECK (ai_tokens_per_month > 0),
        storage_mb          integer CHECK (storage_mb > 0),
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX tenants_ga_code_key ON tenants (ga_code);

      -- Section 18.2: one row per tenant
      CREATE TABLE tenant_settings (
        tenant_id           uuid PRIMARY KEY REFERENCES tenants (id),
        grants              jsonb NOT NULL,
        lead_rules          jsonb NOT NULL,
        profile             jsonb NOT NULL DEFAULT '{}',
        notifications       jsonb NOT NULL,
        security            jsonb NOT NULL DEFAULT '{"mfaForAll": false}',
        version             integer NOT NULL DEFAULT 0,
        permissions_version integer NOT NULL DEFAULT 1,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE users (
        id                 uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id          uuid REFERENCES tenants (id),
        email              text NOT NULL CHECK (email = lower(btrim(email))),
        name               text NOT NULL CHECK (btrim(name) <> ''),
        roles              text[] NOT NULL CHECK (cardinality(roles) > 0),
        agent_code         text,
        status             text NOT NULL DEFAULT 'INVITED'
                           CHECK (status IN ('INVITED', 'ACTIVE', 'DISABLED', 'ARCHIVED')),
        password_hash      text,
        last_login_at      timestamptz,
        archived_at        timestamptz,
        archived_by        uuid,
        archive_reason     text,
        appearance         jsonb NOT NULL DEFAULT '{}',
        mfa_enabled        boolean NOT NULL DEFAULT false,
        mfa_secret         text,
        mfa_pending_secret text,
        mfa_recovery_codes text[],
        mfa_last_step      bigint,
        mfa_enabled_at     timestamptz,
        notification_prefs jsonb,
        auth_version       integer NOT NULL DEFAULT 0,
        version            integer NOT NULL DEFAULT 0,
        created_at         timestamptz NOT NULL DEFAULT now(),
        updated_at         timestamptz NOT NULL DEFAULT now(),
        -- ROLE-3: only a Platform Admin has no tenant, and a Platform Admin has no tenant
        CONSTRAINT users_platform_admin_has_no_tenant
          CHECK ((tenant_id IS NULL) = (roles = ARRAY['PLATFORM_ADMIN'])),
        -- Target of tenant-scoped foreign keys: a row can only point at a user of its own tenant
        CONSTRAINT users_tenant_id_id_key UNIQUE (tenant_id, id)
      );
      -- USER-2
      CREATE UNIQUE INDEX users_email_key ON users (email);
      -- ROLE-2 + USER-13: one user per agent code in a tenant, among users who are not archived
      CREATE UNIQUE INDEX users_agent_code_key ON users (tenant_id, agent_code)
        WHERE agent_code IS NOT NULL AND status <> 'ARCHIVED';
      CREATE INDEX users_tenant_status_idx ON users (tenant_id, status);

      -- AUD-1..5: insert-only for the API roles (section 22.4). Sealing (hash chain) waits on question H.
      CREATE TABLE audit_events (
        id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id  uuid REFERENCES tenants (id),
        user_id    uuid,
        action     text NOT NULL,
        entity     text NOT NULL,
        entity_id  text,
        meta       jsonb,
        ip         text,
        user_agent text,
        at         timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX audit_events_tenant_at_idx ON audit_events (tenant_id, at DESC);
      CREATE INDEX audit_events_tenant_user_at_idx ON audit_events (tenant_id, user_id, at DESC);

      CREATE TABLE outbox (
        id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        tenant_id    uuid NOT NULL REFERENCES tenants (id),
        topic        text NOT NULL,
        payload      jsonb NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now(),
        published_at timestamptz
      );
      CREATE INDEX outbox_pending_idx ON outbox (id) WHERE published_at IS NULL;

      CREATE TABLE idempotency_keys (
        tenant_id    uuid NOT NULL REFERENCES tenants (id),
        key          text NOT NULL CHECK (length(key) BETWEEN 8 AND 200),
        request_hash text NOT NULL,
        status_code  integer,
        response     jsonb,
        created_at   timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, key)
      );

      CREATE TRIGGER tenants_touch BEFORE UPDATE ON tenants
        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
      CREATE TRIGGER tenant_settings_touch BEFORE UPDATE ON tenant_settings
        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
      CREATE TRIGGER users_touch BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

      -- TEN-1 + TEN-3: row-level security. FORCE so the owner is bound too outside development.
      ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_self ON tenants USING (id = app_tenant());

      ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
      ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON tenant_settings
        USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());

      -- Platform Admins (no tenant) are invisible to crm_app
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      ALTER TABLE users FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON users
        USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());

      ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
      ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_read ON audit_events FOR SELECT USING (tenant_id = app_tenant());
      CREATE POLICY tenant_write ON audit_events FOR INSERT WITH CHECK (tenant_id = app_tenant());

      ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
      ALTER TABLE outbox FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_write ON outbox FOR INSERT WITH CHECK (tenant_id = app_tenant());

      ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
      ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON idempotency_keys
        USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());

      -- Least privilege. crm_platform bypasses RLS but not these grants.
      GRANT USAGE ON SCHEMA public TO crm_app, crm_platform;
      GRANT SELECT ON tenants TO crm_app;
      GRANT SELECT, INSERT, UPDATE ON tenants TO crm_platform;
      GRANT SELECT, INSERT, UPDATE ON tenant_settings TO crm_app, crm_platform;
      -- USER-14: users are archived, never deleted
      GRANT SELECT, INSERT, UPDATE ON users TO crm_app, crm_platform;
      -- Section 22.4: the audit log only grows
      GRANT SELECT, INSERT ON audit_events TO crm_app, crm_platform;
      GRANT INSERT ON outbox TO crm_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON outbox TO crm_platform;
      GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_keys TO crm_app, crm_platform;
      GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO crm_app, crm_platform;
    `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`
      DROP TABLE idempotency_keys, outbox, audit_events, users, tenant_settings, tenants;
      DROP FUNCTION touch_updated_at();
      DROP FUNCTION app_tenant();
    `);
  }
}
