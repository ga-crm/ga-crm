import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decided 27/11/2026 (docs/decisions.md): a client no longer has an age band ("Nhóm tuổi"). The date
 * of birth says how old someone is; the Success column age_band is ignored on import.
 */
export class DropClientAgeBand1765296000000 implements MigrationInterface {
  name = 'DropClientAgeBand1765296000000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`ALTER TABLE clients DROP COLUMN age_band`);
  }

  /** The column comes back empty: what was in it is gone. */
  async down(db: QueryRunner): Promise<void> {
    await db.query(`ALTER TABLE clients ADD COLUMN age_band text`);
  }
}
