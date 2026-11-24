import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * TENANT-5 (decided 25/11/2026): the DLVN product catalogue, one for every GA, kept by the Platform
 * Admin from the form or a 11_Products file (section 19.9). Policy lines and leads point at it by
 * product code. GA users may read it, so its policy lets every tenant SELECT; only the platform
 * role writes. A product is never deleted, only hidden, since policies and leads keep its code.
 */
export class Products1764345600000 implements MigrationInterface {
  name = 'Products1764345600000';

  async up(db: QueryRunner): Promise<void> {
    await db.query(`
      CREATE TABLE products (
        product_code   text PRIMARY KEY CHECK (product_code ~ '^[A-Za-z0-9._-]{1,30}$'),
        product_name   text NOT NULL CHECK (btrim(product_name) <> ''),
        product_role   text NOT NULL CHECK (product_role IN ('Chính', 'Bổ trợ')),
        -- COV-3: decides the benefit group of the policy lines that carry this product
        category       text,
        min_entry_age  integer,
        max_entry_age  integer,
        max_cover_age  integer,
        gender         text,
        waiting_period text,
        key_benefits   text,
        -- Section 19.9: matching rules for suggestions; never sent to GA users
        fit_rule       text,
        trigger_event  text,
        rule_status    text NOT NULL DEFAULT 'DRAFT' CHECK (rule_status IN ('DRAFT', 'APPROVED')),
        active         boolean NOT NULL DEFAULT true,
        name_norm      text NOT NULL,
        created_at     timestamptz NOT NULL DEFAULT now(),
        updated_at     timestamptz NOT NULL DEFAULT now(),
        updated_by     uuid
      );
      CREATE INDEX products_name_idx ON products (name_norm);

      ALTER TABLE products ENABLE ROW LEVEL SECURITY;
      ALTER TABLE products FORCE ROW LEVEL SECURITY;
      -- Reference data shared by every GA: anyone may read, nobody in a GA may write
      CREATE POLICY shared_read ON products FOR SELECT USING (true);
      GRANT SELECT ON products TO crm_app;
      GRANT SELECT, INSERT, UPDATE ON products TO crm_platform;

      -- The product a lead is interested in; the free text of forms and files stays as it was
      ALTER TABLE leads ADD COLUMN product_code text REFERENCES products (product_code);
      CREATE INDEX leads_product_idx ON leads (tenant_id, product_code) WHERE product_code IS NOT NULL;
    `);
  }

  async down(db: QueryRunner): Promise<void> {
    await db.query(`
      ALTER TABLE leads DROP COLUMN product_code;
      DROP TABLE products;
    `);
  }
}
