import type { MigrationInterface, QueryRunner } from 'typeorm';
import { provinceKey, shortPlaceName } from '../modules/geo/geo.service.js';
import { VN_PROVINCES } from '../modules/geo/vn-units.data.js';

/**
 * Decided 26/11/2026 (docs/decisions.md): a lead no longer has "Khu vực". The province and commune
 * say where it is, so the free-text region and the GA's region list go. A region that names a
 * current province (a GA's "Chia Lead" file wrote "Hà Nội" there) becomes the lead's province when
 * it has none, so nothing a person can still use is lost. The lead's history keeps its old
 * region changes.
 */
export class DropLeadRegion1764864000000 implements MigrationInterface {
  name = 'DropLeadRegion1764864000000';

  async up(db: QueryRunner): Promise<void> {
    const keys = new Map(
      VN_PROVINCES.map(([code, fullName]) => [
        provinceKey(shortPlaceName(fullName)),
        { code, name: shortPlaceName(fullName) },
      ]),
    );
    const written = (await db.query(
      `SELECT DISTINCT region FROM leads
        WHERE region IS NOT NULL AND btrim(region) <> ''
          AND (province IS NULL OR btrim(province) = '')`,
    )) as { region: string }[];
    for (const { region } of written) {
      const place = keys.get(provinceKey(region));
      if (place)
        await db.query(
          `UPDATE leads SET province = $1, province_code = COALESCE(province_code, $2)
            WHERE region = $3 AND (province IS NULL OR btrim(province) = '')`,
          [place.name, place.code, region],
        );
    }

    await db.query(`
      ALTER TABLE leads DROP COLUMN region;
      DELETE FROM lead_options WHERE kind = 'region';
      ALTER TABLE lead_options DROP CONSTRAINT lead_options_kind_check;
      ALTER TABLE lead_options ADD CONSTRAINT lead_options_kind_check
        CHECK (kind IN ('interest', 'care_status', 'source', 'phone_source', 'lost_reason'));
    `);
  }

  /** The column and the list come back empty: what was in them is gone. */
  async down(db: QueryRunner): Promise<void> {
    await db.query(`
      ALTER TABLE leads ADD COLUMN region text;
      ALTER TABLE lead_options DROP CONSTRAINT lead_options_kind_check;
      ALTER TABLE lead_options ADD CONSTRAINT lead_options_kind_check
        CHECK (kind IN ('interest', 'care_status', 'source', 'region', 'phone_source', 'lost_reason'));
    `);
  }
}
