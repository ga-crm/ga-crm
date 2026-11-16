import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Section 5.2 + open question D (decided 14/11/2026): the GA's own lists of regions, phone sources
 * and lost reasons live beside the lead catalogue. They start empty; the GA head fills them by hand
 * or a whole list at once.
 */
export class GaLists1763913600000 implements MigrationInterface {
  name = 'GaLists1763913600000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      ALTER TABLE lead_options DROP CONSTRAINT lead_options_kind_check;
      ALTER TABLE lead_options ADD CONSTRAINT lead_options_kind_check
        CHECK (kind IN ('interest', 'care_status', 'source', 'region', 'phone_source', 'lost_reason'));
    `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`
      DELETE FROM lead_options WHERE kind IN ('region', 'phone_source', 'lost_reason');
      ALTER TABLE lead_options DROP CONSTRAINT lead_options_kind_check;
      ALTER TABLE lead_options ADD CONSTRAINT lead_options_kind_check
        CHECK (kind IN ('interest', 'care_status', 'source'));
    `);
  }
}
