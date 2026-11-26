import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decided 27/11/2026 (docs/decisions.md): only the GA director assigns customers outright. When
 * Admin or a line manager assigns leads or clients, the assignment waits here for the director;
 * until then the customers stay where they are.
 */
export class AssignmentRequests1765209600000 implements MigrationInterface {
  name = 'AssignmentRequests1765209600000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      CREATE TABLE assignment_requests (
        id            uuid PRIMARY KEY DEFAULT uuidv7(),
        tenant_id     uuid NOT NULL REFERENCES tenants (id),
        kind          text NOT NULL CHECK (kind IN ('LEAD', 'CLIENT')),
        record_ids    uuid[] NOT NULL CHECK (cardinality(record_ids) > 0),
        to_agent_code text,
        requested_by  uuid NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        status        text NOT NULL DEFAULT 'PENDING'
          CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
        decided_by    uuid,
        decided_at    timestamptz,
        note          text,
        FOREIGN KEY (tenant_id, requested_by) REFERENCES users (tenant_id, id)
      );
      CREATE INDEX assignment_requests_status_idx ON assignment_requests (tenant_id, status, created_at);
      CREATE INDEX assignment_requests_by_idx ON assignment_requests (tenant_id, requested_by, created_at);

      ALTER TABLE assignment_requests ENABLE ROW LEVEL SECURITY;
      ALTER TABLE assignment_requests FORCE ROW LEVEL SECURITY;
      CREATE POLICY tenant_isolation ON assignment_requests
        USING (tenant_id = app_tenant()) WITH CHECK (tenant_id = app_tenant());
      GRANT SELECT, INSERT, UPDATE ON assignment_requests TO crm_app, crm_platform;
    `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`DROP TABLE assignment_requests`);
  }
}
