import type { MigrationInterface, QueryRunner } from 'typeorm';
import { normalizeName } from '../common/normalize.js';
import { provinceKey, shortPlaceName } from '../modules/geo/geo.service.js';
import { VN_PROVINCES, VN_WARDS } from '../modules/geo/vn-units.data.js';

const CHUNK = 500;

/**
 * Decided 26/11/2026 (docs/decisions.md): Vietnam's 34 provinces and 3,321 communes after the
 * reform of 1 July 2025 (no district level), shared by every GA like the product catalogue. A
 * lead may name its province, commune and street address; a later list is loaded by a new
 * migration that upserts these tables. Leads that already wrote a current province by name are
 * linked to it.
 */
export class GeoUnits1764604800000 implements MigrationInterface {
  name = 'GeoUnits1764604800000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      CREATE TABLE provinces (
        code       text PRIMARY KEY CHECK (code ~ '^[0-9]{2}$'),
        name       text NOT NULL,
        full_name  text NOT NULL,
        name_norm  text NOT NULL
      );
      CREATE TABLE wards (
        code           text PRIMARY KEY CHECK (code ~ '^[0-9]{5}$'),
        province_code  text NOT NULL REFERENCES provinces (code),
        name           text NOT NULL,
        full_name      text NOT NULL,
        name_norm      text NOT NULL
      );
      CREATE INDEX wards_province_idx ON wards (province_code, name_norm);
    `);
    const insert = async (
      table: string,
      columns: string[],
      rows: string[][],
    ) => {
      for (let start = 0; start < rows.length; start += CHUNK) {
        const chunk = rows.slice(start, start + CHUNK);
        const values = chunk
          .map(
            (_, row) =>
              `(${columns.map((__, column) => `$${row * columns.length + column + 1}`).join(', ')})`,
          )
          .join(', ');
        await db.query(
          `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values}`,
          chunk.flat(),
        );
      }
    };
    await insert(
      'provinces',
      ['code', 'name', 'full_name', 'name_norm'],
      VN_PROVINCES.map(([code, fullName]) => [
        code,
        shortPlaceName(fullName),
        fullName,
        normalizeName(shortPlaceName(fullName)),
      ]),
    );
    await insert(
      'wards',
      ['code', 'province_code', 'name', 'full_name', 'name_norm'],
      VN_WARDS.map(([code, provinceCode, fullName]) => [
        code,
        provinceCode,
        shortPlaceName(fullName),
        fullName,
        normalizeName(shortPlaceName(fullName)),
      ]),
    );
    await db.query(`
      ALTER TABLE provinces ENABLE ROW LEVEL SECURITY;
      ALTER TABLE provinces FORCE ROW LEVEL SECURITY;
      CREATE POLICY shared_read ON provinces FOR SELECT USING (true);
      GRANT SELECT ON provinces TO crm_app, crm_platform;
      ALTER TABLE wards ENABLE ROW LEVEL SECURITY;
      ALTER TABLE wards FORCE ROW LEVEL SECURITY;
      CREATE POLICY shared_read ON wards FOR SELECT USING (true);
      GRANT SELECT ON wards TO crm_app, crm_platform;

      ALTER TABLE leads
        ADD COLUMN province_code text REFERENCES provinces (code),
        ADD COLUMN ward_code     text REFERENCES wards (code),
        ADD COLUMN address_line  text;
      CREATE INDEX leads_province_idx ON leads (tenant_id, province_code) WHERE province_code IS NOT NULL;
      CREATE INDEX leads_ward_idx ON leads (tenant_id, ward_code) WHERE ward_code IS NOT NULL;
    `);

    // A province already written by its current name links the lead to it
    const keys = new Map(
      VN_PROVINCES.map(([code, fullName]) => [
        provinceKey(shortPlaceName(fullName)),
        code,
      ]),
    );
    const written = (await db.query(
      `SELECT DISTINCT province FROM leads WHERE province IS NOT NULL AND btrim(province) <> ''`,
    )) as { province: string }[];
    for (const { province } of written) {
      const code = keys.get(provinceKey(province));
      if (code)
        await db.query(
          `UPDATE leads SET province_code = $1 WHERE province = $2 AND province_code IS NULL`,
          [code, province],
        );
    }
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`
      ALTER TABLE leads DROP COLUMN address_line, DROP COLUMN ward_code, DROP COLUMN province_code;
      DROP TABLE wards;
      DROP TABLE provinces;
    `);
  }
}
