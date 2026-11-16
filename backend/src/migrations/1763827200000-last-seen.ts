import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * K5 (decided 14/11/2026): colleagues see how long someone has been offline. Redis keeps the live
 * value (hash `seen`); this copy, written every few minutes and when someone goes offline, survives
 * a Redis restart.
 */
export class LastSeen1763827200000 implements MigrationInterface {
  name = 'LastSeen1763827200000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`ALTER TABLE users ADD COLUMN last_seen_at timestamptz`);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`ALTER TABLE users DROP COLUMN last_seen_at`);
  }
}
