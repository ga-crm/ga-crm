import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Realtime slice C1 (docs/thiet-ke-chat-realtime.md section 6): a small per-GA number for each user,
 * used as the bit offset in Redis bitmaps, and a durable copy of each day's activity bitmap.
 */
export class Presence1763568000000 implements MigrationInterface {
  name = 'Presence1763568000000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      ALTER TABLE users ADD COLUMN member_no integer;

      -- Existing users, oldest first
      UPDATE users u SET member_no = n.no
        FROM (SELECT id, row_number() OVER (PARTITION BY tenant_id ORDER BY created_at, id) AS no
                FROM users WHERE tenant_id IS NOT NULL) n
       WHERE u.id = n.id;

      CREATE UNIQUE INDEX users_member_no_key ON users (tenant_id, member_no);
      ALTER TABLE users ADD CONSTRAINT users_member_no_check
        CHECK ((tenant_id IS NULL) = (member_no IS NULL));

      -- The next number of the GA. The advisory lock serialises inserts of one GA, so two new users
      -- never take the same number. The trigger runs as the inserting role, whose row-level security
      -- already limits the max() to that GA. Only an invite that never signed in can be hard-deleted
      -- (USER-12), so a number that is ever reused never carried any activity.
      CREATE FUNCTION users_assign_member_no() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.tenant_id IS NOT NULL AND NEW.member_no IS NULL THEN
          PERFORM pg_advisory_xact_lock(hashtext('member_no:' || NEW.tenant_id::text));
          SELECT coalesce(max(member_no), 0) + 1 INTO NEW.member_no
            FROM users WHERE tenant_id = NEW.tenant_id;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER users_member_no BEFORE INSERT ON users
        FOR EACH ROW EXECUTE FUNCTION users_assign_member_no();

      -- A copy of Redis key t:{tenant}:dau:{day}; Redis may evict it (allkeys-lru)
      CREATE TABLE activity_days (
        tenant_id uuid NOT NULL REFERENCES tenants (id),
        day       date NOT NULL,
        bits      bytea NOT NULL,
        active    integer NOT NULL CHECK (active >= 0),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (tenant_id, day)
      );
      ALTER TABLE activity_days ENABLE ROW LEVEL SECURITY;
      ALTER TABLE activity_days FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON activity_days
        USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
      GRANT SELECT, INSERT, UPDATE, DELETE ON activity_days TO crm_app, crm_platform;
    `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`
      DROP TABLE activity_days;
      DROP TRIGGER users_member_no ON users;
      DROP FUNCTION users_assign_member_no();
      ALTER TABLE users DROP CONSTRAINT users_member_no_check;
      DROP INDEX users_member_no_key;
      ALTER TABLE users DROP COLUMN member_no;
    `);
  }
}
