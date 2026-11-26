import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Decided 27/11/2026 (docs/decisions.md): the GA head ("Chủ GA") and the GA director ("Giám đốc GA")
 * are one role, stored as GAD: it holds every permission, sees the whole GA, and is no longer in the
 * permission matrix. A GA head account becomes a GA director; its sessions drop (auth_version),
 * as when a role is changed by hand.
 */
export class GaDirector1765036800000 implements MigrationInterface {
  name = 'GaDirector1765036800000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      UPDATE users
         SET roles = ARRAY(
               SELECT DISTINCT role FROM unnest(array_replace(roles, 'GA_HEAD', 'GAD')) AS role
                ORDER BY role),
             auth_version = auth_version + 1
       WHERE 'GA_HEAD' = ANY (roles) OR 'GAD' = ANY (roles);

      UPDATE tenant_settings SET grants = grants - 'GAD', updated_at = now()
       WHERE grants ? 'GAD';
    `);
  }

  /** Who was a GA head before is not kept: every director stays one, and the matrix row comes back empty. */
  async down(db: QueryRunner): Promise<void> {
    await db.query(`
      UPDATE users SET roles = array_append(roles, 'GA_HEAD')
       WHERE 'GAD' = ANY (roles) AND NOT 'GA_HEAD' = ANY (roles);
      UPDATE tenant_settings SET grants = grants || '{"GAD": []}'::jsonb
       WHERE NOT grants ? 'GAD';
    `);
  }
}
