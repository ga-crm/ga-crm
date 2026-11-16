import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Sessions, invitations, password resets, sign-in counters, the agent tree and the audit chain. */
export class IdentityAndAgents1762963200000 implements MigrationInterface {
  name = 'IdentityAndAgents1762963200000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      -- USER-14: the only hard delete is withdrawing an invite nobody accepted. The database refuses
      -- deleting any other user, whatever the code does.
      DROP POLICY tenant_isolation ON users;
      CREATE POLICY tenant_read ON users FOR SELECT USING (tenant_id = app_tenant());
      CREATE POLICY tenant_insert ON users FOR INSERT WITH CHECK (tenant_id = app_tenant());
      CREATE POLICY tenant_update ON users FOR UPDATE
        USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
      CREATE POLICY tenant_withdraw_invite ON users FOR DELETE
        USING (tenant_id = app_tenant() AND status = 'INVITED' AND last_login_at IS NULL);
      GRANT DELETE ON users TO crm_app, crm_platform;

      -- USER-17: the cookie holds a random token; only its hash is stored. Looked up by
      -- crm_platform (the tenant is not known yet); crm_app signs a GA's users out (USER-10).
      CREATE TABLE sessions (
        id                  uuid PRIMARY KEY DEFAULT uuidv7(),
        user_id             uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        tenant_id           uuid REFERENCES tenants (id),
        token_hash          text NOT NULL,
        expires_at          timestamptz NOT NULL,
        absolute_expires_at timestamptz NOT NULL,
        -- USER-16: the password was right, the MFA code is still to come
        mfa_pending         boolean NOT NULL DEFAULT false,
        created_at          timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX sessions_token_hash_key ON sessions (token_hash);
      CREATE INDEX sessions_user_created_idx ON sessions (user_id, created_at DESC);
      CREATE INDEX sessions_expires_idx ON sessions (expires_at);

      -- USER-3: only the token hash is stored
      CREATE TABLE invitations (
        id          uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id   uuid NOT NULL REFERENCES tenants (id),
        user_id     uuid NOT NULL,
        token_hash  text NOT NULL,
        expires_at  timestamptz NOT NULL,
        accepted_at timestamptz,
        created_by  uuid,
        created_at  timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX invitations_token_hash_key ON invitations (token_hash);
      CREATE INDEX invitations_user_idx ON invitations (tenant_id, user_id);

      -- USER-16: a single-use reset link
      CREATE TABLE password_resets (
        id         uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id  uuid NOT NULL REFERENCES tenants (id),
        user_id    uuid NOT NULL,
        token_hash text NOT NULL,
        expires_at timestamptz NOT NULL,
        created_by uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id) ON DELETE CASCADE
      );
      CREATE UNIQUE INDEX password_resets_token_hash_key ON password_resets (token_hash);
      CREATE INDEX password_resets_user_idx ON password_resets (tenant_id, user_id);

      -- USER-16 + section 22.4: sign-in counters and locks, keyed by hashes. No tenant: sign-in
      -- happens before one is known, so only crm_platform touches them.
      CREATE TABLE login_attempts (
        id           text PRIMARY KEY,
        count        integer NOT NULL DEFAULT 0,
        locked_until timestamptz,
        expires_at   timestamptz NOT NULL
      );
      CREATE INDEX login_attempts_expires_idx ON login_attempts (expires_at);

      -- Section 18.3 + AGT-1..7. DATA-1: the code is text and keeps leading zeros.
      CREATE TABLE agents (
        id                   uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id            uuid NOT NULL REFERENCES tenants (id),
        agent_code           text NOT NULL CHECK (agent_code <> ''),
        name                 text NOT NULL,
        name_norm            text NOT NULL,
        rank                 text NOT NULL CHECK (rank IN ('SUM', 'BM', 'UM', 'SA', 'FC')),
        -- Kept as written even when that manager is not loaded yet or the link is split off a cycle
        manager_code         text,
        -- AGT-3: root to direct manager
        ancestors            text[] NOT NULL DEFAULT '{}',
        depth                integer NOT NULL DEFAULT 0,
        status               text NOT NULL CHECK (status IN ('Đang hoạt động', 'Ngưng hoạt động')),
        gender               text,
        dob                  date,
        phone                text,
        start_date           date,
        end_date             date,
        office_code          text,
        -- AGT-5: set by a manual change; imports then keep this link
        manager_fixed        boolean NOT NULL DEFAULT false,
        updated_by_import_id uuid,
        last_seen_at         timestamptz,
        created_at           timestamptz NOT NULL DEFAULT now(),
        updated_at           timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX agents_code_key ON agents (tenant_id, agent_code);
      CREATE INDEX agents_manager_idx ON agents (tenant_id, manager_code);
      CREATE INDEX agents_ancestors_idx ON agents USING gin (ancestors);
      CREATE INDEX agents_name_idx ON agents (tenant_id, name_norm);
      CREATE TRIGGER agents_touch BEFORE UPDATE ON agents
        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

      -- AUD-1: each event carries the hash of the previous one of its tenant. The chain head is
      -- one row per tenant ('platform' for platform events), locked until the transaction ends.
      ALTER TABLE audit_events ADD COLUMN prev_hash text, ADD COLUMN hash text NOT NULL DEFAULT '';
      ALTER TABLE audit_events ALTER COLUMN hash DROP DEFAULT;
      CREATE INDEX audit_events_entity_idx ON audit_events (tenant_id, entity, entity_id, at DESC);
      CREATE TABLE audit_chains (
        id         text PRIMARY KEY,
        last_hash  text,
        touched_at timestamptz NOT NULL DEFAULT now()
      );

      ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
      ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON sessions
        USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
      ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
      ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON invitations
        USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
      ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;
      ALTER TABLE password_resets FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON password_resets
        USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
      ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
      ALTER TABLE agents FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON agents
        USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
      ALTER TABLE audit_chains ENABLE ROW LEVEL SECURITY;
      ALTER TABLE audit_chains FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_chain ON audit_chains
        USING (id = app_tenant()::text) WITH CHECK (id = app_tenant()::text);
      ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
      ALTER TABLE login_attempts FORCE ROW LEVEL SECURITY;

      GRANT SELECT, INSERT, UPDATE, DELETE ON sessions, invitations, password_resets, agents
        TO crm_app, crm_platform;
      GRANT SELECT, INSERT, UPDATE ON audit_chains TO crm_app, crm_platform;
      GRANT SELECT, INSERT, UPDATE, DELETE ON login_attempts TO crm_platform;
    `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`
      DROP TABLE audit_chains, agents, login_attempts, password_resets, invitations, sessions;
      DROP INDEX audit_events_entity_idx;
      ALTER TABLE audit_events DROP COLUMN hash, DROP COLUMN prev_hash;
      REVOKE DELETE ON users FROM crm_app, crm_platform;
      DROP POLICY tenant_withdraw_invite ON users;
      DROP POLICY tenant_update ON users;
      DROP POLICY tenant_insert ON users;
      DROP POLICY tenant_read ON users;
      CREATE POLICY tenant_isolation ON users
        USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
    `);
  }
}
