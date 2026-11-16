import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Open question I (decided 14/11/2026): a file of 2,000 rows or more is written batch by batch in
 * the background. COMMITTING marks the run, and `progress` says how far it got.
 */
export class ImportBatches1764000000000 implements MigrationInterface {
  name = 'ImportBatches1764000000000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      ALTER TABLE imports DROP CONSTRAINT imports_status_check;
      ALTER TABLE imports ADD CONSTRAINT imports_status_check
        CHECK (status IN ('PARSING', 'VALIDATED', 'COMMITTING', 'COMMITTED', 'FAILED'));
      ALTER TABLE imports ADD COLUMN progress jsonb;
      CREATE INDEX imports_committing_idx ON imports (updated_at) WHERE status = 'COMMITTING';
    `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`
      DROP INDEX imports_committing_idx;
      UPDATE imports SET status = 'COMMITTED' WHERE status = 'COMMITTING';
      ALTER TABLE imports DROP COLUMN progress;
      ALTER TABLE imports DROP CONSTRAINT imports_status_check;
      ALTER TABLE imports ADD CONSTRAINT imports_status_check
        CHECK (status IN ('PARSING', 'VALIDATED', 'COMMITTED', 'FAILED'));
    `);
  }
}
