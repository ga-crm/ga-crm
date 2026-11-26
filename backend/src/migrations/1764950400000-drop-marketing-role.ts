import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decided 26/11/2026 (docs/decisions.md): the Marketing role is gone and Admin does its work.
 * A Marketing account becomes an Admin one, and each GA's permission matrix gives Admin what it
 * gave Marketing, so nobody loses access. Sessions of the changed accounts drop (auth_version), as
 * when a role is changed by hand.
 */
export class DropMarketingRole1764950400000 implements MigrationInterface {
  name = 'DropMarketingRole1764950400000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      UPDATE users
         SET roles = ARRAY(
               SELECT DISTINCT role FROM unnest(array_replace(roles, 'MARKETING', 'ADMIN')) AS role
                ORDER BY role),
             auth_version = auth_version + 1
       WHERE 'MARKETING' = ANY (roles);

      UPDATE tenant_settings
         SET grants = jsonb_set(
               grants - 'MARKETING',
               '{ADMIN}',
               (SELECT coalesce(jsonb_agg(DISTINCT permission), '[]'::jsonb)
                  FROM jsonb_array_elements_text(
                         coalesce(grants -> 'ADMIN', '[]') || coalesce(grants -> 'MARKETING', '[]')
                       ) AS permission)),
             updated_at = now()
       WHERE grants ? 'MARKETING';
    `);
  }

  /** Who was Marketing before is not kept, so the role only comes back empty in the matrix. */
  async down(db: QueryRunner): Promise<void> {
    await db.query(`
      UPDATE tenant_settings SET grants = grants || '{"MARKETING": []}'::jsonb
       WHERE NOT grants ? 'MARKETING';
    `);
  }
}
