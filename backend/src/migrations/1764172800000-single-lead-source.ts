import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decided on 24/11/2026 (docs/decisions.md): the lead screens show one "Nguồn gốc", the GA's own
 * source list. `leads.origin` stays for the rules that read it (LEAD-2, LEAD-9) but is no longer a
 * filter, so saved filters drop it.
 */
export class SingleLeadSource1764172800000 implements MigrationInterface {
  name = 'SingleLeadSource1764172800000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(
      `UPDATE saved_filters SET query = query - 'origin' WHERE query ? 'origin'`,
    );
  }

  async down(): Promise<void> {
    // The removed filter values are not kept
  }
}
