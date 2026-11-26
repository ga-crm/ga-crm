import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decided on 25/11/2026 (docs/decisions.md): a GA's "Chia Lead" file also keeps what was done 10, 15
 * and 20 days later ("XỬ LÝ SAU"), a handling note and two "CDYT" columns. They are free text from
 * the file, shown on the lead and erased with its personal data (PDP-6).
 */
export class LeadFollowUps1764518400000 implements MigrationInterface {
  name = 'LeadFollowUps1764518400000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      ALTER TABLE leads
        ADD COLUMN follow_up_10d  text,
        ADD COLUMN follow_up_15d  text,
        ADD COLUMN follow_up_20d  text,
        ADD COLUMN handling_note  text,
        ADD COLUMN cdyt_stats     text,
        ADD COLUMN cdyt_profile   text
    `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`
      ALTER TABLE leads
        DROP COLUMN follow_up_10d,
        DROP COLUMN follow_up_15d,
        DROP COLUMN follow_up_20d,
        DROP COLUMN handling_note,
        DROP COLUMN cdyt_stats,
        DROP COLUMN cdyt_profile
    `);
  }
}
