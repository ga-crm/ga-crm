import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decided 27/11/2026 (docs/decisions.md): a lead its agent dropped (Chốt xịt, Không quan tâm) or
 * left without care for the GA's number of days goes back to the GA's pool of leads waiting for an
 * assignee. These columns say when, from whom and why, until someone is assigned again.
 */
export class LeadRelease1765123200000 implements MigrationInterface {
  name = 'LeadRelease1765123200000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      ALTER TABLE leads
        ADD COLUMN released_at    timestamptz,
        ADD COLUMN released_from  text,
        ADD COLUMN release_reason text
          CHECK (release_reason IN ('IDLE', 'DROPPED', 'NOT_INTERESTED'));
      CREATE INDEX leads_released_idx ON leads (tenant_id, released_at)
        WHERE released_at IS NOT NULL;
      -- The daily round that returns idle leads acts for nobody
      ALTER TABLE lead_history ALTER COLUMN changed_by DROP NOT NULL;
    `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`
      DELETE FROM lead_history WHERE changed_by IS NULL;
      ALTER TABLE lead_history ALTER COLUMN changed_by SET NOT NULL;
      ALTER TABLE leads
        DROP COLUMN release_reason, DROP COLUMN released_from, DROP COLUMN released_at;
    `);
  }
}
