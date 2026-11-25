import type { MigrationInterface, QueryRunner } from 'typeorm';

const TENANT_TABLES = ['client_care_records', 'client_referrals'];

/**
 * Decided on 26/11/2026 (docs/decisions.md): what a GA records about caring for a client, entered
 * by hand on the client page. `client_care_records` holds dated events: a hospital claim (when and
 * where; never a diagnosis, PDP-1), a seminar or health check attended, a gift or visit, and what
 * the client received on signing (cash or a gift). `client_referrals` holds each person the client
 * referred, how they relate, the outcome and the premium a successful one brought.
 */
export class ClientCareRecords1764691200000 implements MigrationInterface {
  name = 'ClientCareRecords1764691200000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      CREATE TABLE client_care_records (
        id          uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id   uuid NOT NULL REFERENCES tenants (id),
        client_id   uuid NOT NULL,
        kind        text NOT NULL CHECK (kind IN ('CLAIM', 'SEMINAR', 'HEALTH_CHECK', 'GIFT', 'VISIT',
                                                  'SIGNING_CASH', 'SIGNING_GIFT')),
        occurred_on date NOT NULL,
        -- What: the event's or the gift's name
        title       text,
        -- Where: the hospital of a claim, the venue of an event
        place       text,
        amount_vnd  bigint CHECK (amount_vnd >= 0),
        -- The policy a claim or a signing gift belongs to, when known
        policy_no   text,
        note        text,
        created_by  uuid NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, id) ON DELETE CASCADE
      );
      CREATE INDEX client_care_records_client_idx ON client_care_records (tenant_id, client_id, occurred_on DESC);
      CREATE TRIGGER client_care_records_touch BEFORE UPDATE ON client_care_records
        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

      CREATE TABLE client_referrals (
        id          uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id   uuid NOT NULL REFERENCES tenants (id),
        -- The client who referred someone
        client_id   uuid NOT NULL,
        person_name text NOT NULL CHECK (btrim(person_name) <> ''),
        relation    text NOT NULL CHECK (relation IN ('FAMILY', 'FRIEND', 'COLLEAGUE', 'NEIGHBOR', 'OTHER')),
        referred_on date NOT NULL,
        result      text NOT NULL DEFAULT 'PENDING' CHECK (result IN ('PENDING', 'SUCCESS', 'FAILED')),
        -- The premium of the policy a successful referral brought
        premium_vnd bigint CHECK (premium_vnd >= 0),
        note        text,
        created_by  uuid NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now(),
        CHECK (premium_vnd IS NULL OR result = 'SUCCESS'),
        FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, id) ON DELETE CASCADE
      );
      CREATE INDEX client_referrals_client_idx ON client_referrals (tenant_id, client_id, referred_on DESC);
      CREATE TRIGGER client_referrals_touch BEFORE UPDATE ON client_referrals
        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
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
    await db.query(`
      DROP TABLE client_referrals;
      DROP TABLE client_care_records;
    `);
  }
}
