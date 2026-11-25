import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decided on 25/11/2026 (docs/decisions.md): the policy page shows the policy and premium
 * details DLVN shows. `contact_address` is personal data: the API never returns it with the
 * policy, only through an audited reveal. `sum_assured_vnd` is a fallback for policies whose main
 * product line is unknown; the page prefers the main line's sum assured.
 */
export class PolicyDetails1764432000000 implements MigrationInterface {
  name = 'PolicyDetails1764432000000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      ALTER TABLE policies
        ADD COLUMN contact_address        text,
        ADD COLUMN sum_assured_vnd        bigint,
        ADD COLUMN grace_end_date         date,
        ADD COLUMN assignment_type        text,
        ADD COLUMN assignment_date        date,
        ADD COLUMN advance_premium_vnd    bigint,
        ADD COLUMN total_paid_premium_vnd bigint,
        ADD COLUMN basic_premium_vnd      bigint,
        ADD COLUMN top_up_premium_vnd     bigint
    `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`
      ALTER TABLE policies
        DROP COLUMN contact_address,
        DROP COLUMN sum_assured_vnd,
        DROP COLUMN grace_end_date,
        DROP COLUMN assignment_type,
        DROP COLUMN assignment_date,
        DROP COLUMN advance_premium_vnd,
        DROP COLUMN total_paid_premium_vnd,
        DROP COLUMN basic_premium_vnd,
        DROP COLUMN top_up_premium_vnd
    `);
  }
}
