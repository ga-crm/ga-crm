import type { MigrationInterface, QueryRunner } from 'typeorm';

const TENANT_TABLES = [
  'imports',
  'import_errors',
  'import_rows',
  'success_activities',
];

/** Section 18.6: imports, their errors and staging rows; section 18.5 + 19.6: Success activities. */
export class Imports1763222400000 implements MigrationInterface {
  name = 'Imports1763222400000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      -- IMP-2. file_key stays empty until object storage exists: no original file is kept.
      CREATE TABLE imports (
        id            uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id     uuid NOT NULL REFERENCES tenants (id),
        user_id       uuid NOT NULL,
        agent_code    text,
        kind          text NOT NULL CHECK (kind IN ('SUCCESS', 'LEADS')),
        file_name     text NOT NULL,
        snapshot_date date NOT NULL,
        status        text NOT NULL CHECK (status IN ('PARSING', 'VALIDATED', 'COMMITTED', 'FAILED')),
        -- One entry per sheet of the file, with its plan and counts; sheet names come from the file
        sheets        jsonb NOT NULL DEFAULT '[]',
        -- IMP-24: the source values are free text from the file
        agent_mapping jsonb NOT NULL DEFAULT '[]',
        committed_at  timestamptz,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT imports_tenant_id_id_key UNIQUE (tenant_id, id),
        FOREIGN KEY (tenant_id, user_id) REFERENCES users (tenant_id, id)
      );
      CREATE INDEX imports_user_idx ON imports (tenant_id, user_id, created_at DESC);
      CREATE INDEX imports_created_idx ON imports (tenant_id, created_at DESC);
      CREATE TRIGGER imports_touch BEFORE UPDATE ON imports
        FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

      -- IMP-10. Row 1 means the problem is with the sheet or its header.
      CREATE TABLE import_errors (
        id          uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id   uuid NOT NULL,
        import_id   uuid NOT NULL,
        sheet       text NOT NULL,
        row         integer NOT NULL,
        "column"    text,
        code        text NOT NULL,
        record_key  text,
        message_vi  text NOT NULL,
        severity    text NOT NULL CHECK (severity IN ('error', 'warning', 'skipped')),
        -- Cross-row findings are recomputed at commit, so they can be replaced without the rest
        cross_row   boolean NOT NULL DEFAULT false,
        FOREIGN KEY (tenant_id, import_id) REFERENCES imports (tenant_id, id) ON DELETE CASCADE
      );
      CREATE INDEX import_errors_import_idx ON import_errors (tenant_id, import_id, sheet, row);

      -- Section 18.6: staging, removed at commit or cancel (and by a cleanup job after 7 days)
      CREATE TABLE import_rows (
        id         uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id  uuid NOT NULL,
        import_id  uuid NOT NULL,
        sheet      text NOT NULL,
        row_no     integer NOT NULL,
        key        text NOT NULL,
        data       jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (tenant_id, import_id) REFERENCES imports (tenant_id, id) ON DELETE CASCADE
      );
      CREATE INDEX import_rows_import_idx ON import_rows (tenant_id, import_id, sheet, row_no);
      CREATE INDEX import_rows_created_idx ON import_rows (created_at);

      -- Section 18.5 + 19.6: one row of 07_Activities, keyed by the Success activity id
      CREATE TABLE success_activities (
        id                 uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id          uuid NOT NULL REFERENCES tenants (id),
        activity_id        text NOT NULL,
        agent_code         text NOT NULL,
        leader_code        text,
        office_code        text,
        program_code       text,
        program_month      integer,
        activity_type      text NOT NULL
                           CHECK (activity_type IN ('CHECKIN', 'CALL', 'SOCIAL_POST', 'MEETING', 'COACHING', 'OTHER', 'PROPOSAL')),
        sub_activity_title text,
        record_mode        text,
        started_at         timestamptz NOT NULL,
        ended_at           timestamptz,
        duration_seconds   integer,
        status             text NOT NULL
                           CHECK (status IN ('draft', 'submitted', 'approved', 'returned', 'rejected', 'locked')),
        customer_id        text,
        customer_name      text,
        customer_phone     text,
        activity_method    text,
        call_type          text,
        call_outcome       text,
        call_phone_hash    text,
        content_note       text,
        location_name      text,
        -- IMP-32: the Vietnam day of started_at
        activity_date      date NOT NULL,
        -- IMP-32: the masked customer phone, or the call hash, so one contact counts once in R2
        phone_key          text,
        last_import_id     uuid,
        last_seen_at       timestamptz
      );
      CREATE UNIQUE INDEX success_activities_key ON success_activities (tenant_id, activity_id);
      CREATE INDEX success_activities_agent_idx ON success_activities (tenant_id, agent_code, activity_date);
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
    await db.query(`DROP TABLE ${[...TENANT_TABLES].reverse().join(', ')}`);
  }
}
