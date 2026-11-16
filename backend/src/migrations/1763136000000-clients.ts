import type { MigrationInterface, QueryRunner } from 'typeorm';

const TENANT_TABLES = [
  'clients',
  'policies',
  'applications',
  'family_links',
  'insurance_programs',
  'record_changes',
];

/**
 * Clients, policies and applications (section 18.5), family links (FAM), the programme catalogue
 * (PRG) and the field history of imports and hand edits (IMP-21).
 */
export class Clients1763136000000 implements MigrationInterface {
  name = 'Clients1763136000000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      -- Section 18.5. DATA-1: client_code is text and keeps its leading zeros.
      CREATE TABLE clients (
        id                     uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id              uuid NOT NULL REFERENCES tenants (id),
        client_code            text NOT NULL CHECK (client_code <> ''),
        name                   text NOT NULL,
        name_norm              text NOT NULL,
        -- CUS-3: kept by the GA; no file ever writes or clears it
        phone                  text,
        tier                   text,
        active_policies        integer,
        lapsed_policies        integer,
        dob                    text,
        gender                 text,
        marital_status         text,
        loyalty_points         integer,
        uses_dconnect          boolean,
        dconnect_last_login_at timestamptz,
        -- PDP-1: only whether the ID card was updated, never its number
        id_updated             boolean,
        ekyc_registered        boolean,
        ekyc_registered_at     timestamptz,
        -- dd/mm
        birth_day_month        text,
        birth_month            integer CHECK (birth_month BETWEEN 1 AND 12),
        age_band               text,
        -- CUS-4: why an agent sees (and maybe owns) the client; at most one MANUAL link (ASG-2)
        agent_links            jsonb NOT NULL DEFAULT '[]',
        -- CUS-5: every agent with a link
        visible_agent_codes    text[] NOT NULL DEFAULT '{}',
        -- CUS-6: the agents whose link makes the client theirs
        owner_agent_codes      text[] NOT NULL DEFAULT '{}',
        origin                 text NOT NULL CHECK (origin IN ('IMPORT', 'MANUAL')),
        created_by             uuid,
        last_import_id         uuid,
        last_seen_at           timestamptz,
        created_at             timestamptz NOT NULL,
        updated_at             timestamptz NOT NULL
      );
      CREATE UNIQUE INDEX clients_code_key ON clients (tenant_id, client_code);
      CREATE INDEX clients_visible_idx ON clients USING gin (visible_agent_codes);
      CREATE INDEX clients_owner_idx ON clients USING gin (owner_agent_codes);
      CREATE INDEX clients_name_idx ON clients (tenant_id, name_norm, client_code);
      CREATE INDEX clients_name_trgm_idx ON clients USING gin (name_norm gin_trgm_ops);
      CREATE INDEX clients_phone_trgm_idx ON clients USING gin (phone gin_trgm_ops);
      CREATE INDEX clients_birth_month_idx ON clients (tenant_id, birth_month);
      CREATE INDEX clients_tier_idx ON clients (tenant_id, tier);

      -- Section 18.5. DATA-1: policy_no is a 9-digit string. Agents, people and product lines
      -- keep the shape Success gives them (JSON arrays); the code arrays are what queries use.
      CREATE TABLE policies (
        id                   uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id            uuid NOT NULL REFERENCES tenants (id),
        policy_no            text NOT NULL CHECK (policy_no <> ''),
        holder_client_code   text NOT NULL,
        insured_client_code  text,
        servicing_agent_code text,
        holder_name          text NOT NULL,
        holder_name_norm     text NOT NULL,
        insured_name         text NOT NULL,
        insured_name_norm    text NOT NULL,
        -- As Success writes it, for example "Đang hiệu lực" (CUS-10)
        status               text NOT NULL,
        effective_date       date NOT NULL,
        maturity_date        date NOT NULL,
        premium_frequency    text NOT NULL,
        premium_due_date     date,
        planned_premium_vnd  bigint,
        base_premium_vnd     bigint NOT NULL,
        unpaid_premium_vnd   bigint,
        apl_debt_vnd         bigint,
        has_beneficiary      boolean,
        -- CUS-12: each agent's share; ended links stay for history (IMP-17)
        agents               jsonb NOT NULL DEFAULT '[]',
        -- SCOPE-5: the agents whose link has not ended
        current_agent_codes  text[] NOT NULL DEFAULT '{}',
        -- CUS-11: PO, LI and BEN links, ended ones included
        clients              jsonb NOT NULL DEFAULT '[]',
        -- Every client code in clients, kept by a trigger, for "the policies naming these clients"
        client_codes         text[] NOT NULL DEFAULT '{}',
        -- PRD-1..6
        products             jsonb NOT NULL DEFAULT '[]',
        origin               text NOT NULL CHECK (origin IN ('IMPORT', 'MANUAL')),
        created_by           uuid,
        last_import_id       uuid,
        last_seen_at         timestamptz,
        created_at           timestamptz NOT NULL,
        updated_at           timestamptz NOT NULL
      );
      CREATE UNIQUE INDEX policies_no_key ON policies (tenant_id, policy_no);
      CREATE INDEX policies_agents_idx ON policies USING gin (current_agent_codes);
      CREATE INDEX policies_clients_idx ON policies USING gin (client_codes);
      CREATE INDEX policies_products_idx ON policies USING gin (products jsonb_path_ops);
      CREATE INDEX policies_due_idx ON policies (tenant_id, premium_due_date);
      CREATE INDEX policies_maturity_idx ON policies (tenant_id, maturity_date);
      CREATE FUNCTION policies_client_codes() RETURNS trigger
        LANGUAGE plpgsql
        AS $$ BEGIN
          NEW.client_codes := ARRAY(
            SELECT DISTINCT item ->> 'clientCode' FROM jsonb_array_elements(NEW.clients) AS item
             WHERE item ->> 'clientCode' IS NOT NULL);
          RETURN NEW;
        END $$;
      CREATE TRIGGER policies_client_codes BEFORE INSERT OR UPDATE OF clients ON policies
        FOR EACH ROW EXECUTE FUNCTION policies_client_codes();

      -- CUS-13
      CREATE TABLE applications (
        id               uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id        uuid NOT NULL REFERENCES tenants (id),
        application_no   text NOT NULL,
        policy_no        text,
        agent_code       text NOT NULL,
        client_code      text,
        holder_name      text NOT NULL,
        holder_name_norm text NOT NULL,
        created_date     date NOT NULL,
        received_date    date,
        status           text NOT NULL,
        issued_date      date,
        product_code     text,
        ape_vnd          bigint,
        last_import_id   uuid,
        last_seen_at     timestamptz
      );
      CREATE UNIQUE INDEX applications_no_key ON applications (tenant_id, application_no);
      CREATE INDEX applications_agent_idx ON applications (tenant_id, agent_code, created_date);
      CREATE INDEX applications_client_idx ON applications (tenant_id, client_code);

      -- FAM-1..4: a relation to another client, or to a relative who is not a client yet. relation is
      -- seen from client_code's side; the other side reads it the other way round (FAM-2).
      CREATE TABLE family_links (
        id                  uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id           uuid NOT NULL REFERENCES tenants (id),
        client_code         text NOT NULL,
        related_client_code text,
        full_name           text,
        birth_day           integer CHECK (birth_day BETWEEN 1 AND 31),
        birth_month         integer CHECK (birth_month BETWEEN 1 AND 12),
        birth_year          integer,
        gender              text CHECK (gender IN ('Nam', 'Nữ')),
        relation            text NOT NULL,
        note                text,
        -- FAM-6
        lead_id             uuid,
        created_by          uuid NOT NULL,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now(),
        -- A relation names a client or a relative, never both
        CHECK ((related_client_code IS NULL) <> (full_name IS NULL)),
        FOREIGN KEY (tenant_id, lead_id) REFERENCES leads (tenant_id, id) ON DELETE SET NULL (lead_id)
      );
      CREATE INDEX family_links_client_idx ON family_links (tenant_id, client_code);
      CREATE INDEX family_links_related_idx ON family_links (tenant_id, related_client_code);
      -- FAM-2: one record per pair of clients
      CREATE UNIQUE INDEX family_links_pair_key ON family_links (tenant_id, client_code, related_client_code)
        WHERE related_client_code IS NOT NULL;
      CREATE TRIGGER family_links_touch BEFORE UPDATE ON family_links
        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

      -- PRG-1: the programmes a GA picks from when entering a policy by hand
      CREATE TABLE insurance_programs (
        id           uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id    uuid NOT NULL REFERENCES tenants (id),
        -- PRG-4: from the label (DATA-9), and it never changes
        code         text NOT NULL,
        label        text NOT NULL CHECK (btrim(label) <> ''),
        product_role text NOT NULL CHECK (product_role IN ('Chính', 'Bổ trợ')),
        product_code text,
        active       boolean NOT NULL DEFAULT true,
        sort_order   integer NOT NULL,
        created_at   timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX insurance_programs_code_key ON insurance_programs (tenant_id, code);

      -- IMP-21 + section 18.5: one row per field an import or a person really changed
      CREATE TABLE record_changes (
        id         uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id  uuid NOT NULL REFERENCES tenants (id),
        entity     text NOT NULL,
        entity_key text NOT NULL,
        field      text NOT NULL,
        old_value  text,
        new_value  text,
        import_id  uuid,
        changed_by uuid NOT NULL,
        changed_at timestamptz NOT NULL
      );
      CREATE INDEX record_changes_entity_idx ON record_changes (tenant_id, entity, entity_key, changed_at);
    `);
    for (const table of TENANT_TABLES)
      await db.query(`
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;
        CREATE POLICY tenant_isolation ON ${table}
          USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
        GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO crm_app, crm_platform;
      `);
    // Section 22.4: the change history only grows
    await db.query(
      `REVOKE UPDATE, DELETE ON record_changes FROM crm_app, crm_platform`,
    );
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`
      DROP TABLE ${[...TENANT_TABLES].reverse().join(', ')};
      DROP FUNCTION policies_client_codes();
    `);
  }
}
