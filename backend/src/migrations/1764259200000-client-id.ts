import type { MigrationInterface, QueryRunner } from 'typeorm';

/** DATA-5 in SQL: no Vietnamese marks, upper case, single spaces (as `normalizeName`). */
const NORM = (column: string) =>
  `upper(btrim(regexp_replace(immutable_unaccent(${column}), '\\s+', ' ', 'g')))`;

/** Tables whose notes, comments and tasks hang off a client. */
const CLIENT_CHILDREN = ['interactions', 'comments', 'tasks'];

/**
 * Decided on 25/11/2026 (docs/decisions.md): a client is identified by its id, and people work with
 * the policy number. The insurer's client code stays only as `clients.success_code`, a hidden key
 * the Success import reads to find the same person again; no screen or API shows it.
 *
 * Everyone a policy, an application, a family link, a lead or a note named by code becomes a client
 * row first (an insured child had no row before, FAM-5), so every reference can turn into an id
 * with a real foreign key. A policy may now hold only its number (POL-2 as decided).
 */
export class ClientId1764259200000 implements MigrationInterface {
  name = 'ClientId1764259200000';

  async up(db: QueryRunner): Promise<void> {
    // 1. The code becomes the hidden import key; a client added by hand has none
    await db.query(`
      ALTER TABLE clients RENAME COLUMN client_code TO success_code;
      ALTER TABLE clients ALTER COLUMN success_code DROP NOT NULL;
      DROP INDEX clients_code_key;
      CREATE UNIQUE INDEX clients_success_code_key ON clients (tenant_id, success_code)
        WHERE success_code IS NOT NULL;
      DROP INDEX clients_name_idx;
      CREATE INDEX clients_name_idx ON clients (tenant_id, name_norm, id);
      ALTER TABLE clients ADD CONSTRAINT clients_tenant_id_id_key UNIQUE (tenant_id, id);
    `);

    // 2. A row for every person named by a code that has none, with the best name known
    await db.query(`
      WITH refs (tenant_id, code, name, imported) AS (
        SELECT tenant_id, holder_client_code, holder_name, origin = 'IMPORT' FROM policies
        UNION ALL
        SELECT tenant_id, insured_client_code, insured_name, origin = 'IMPORT' FROM policies
         WHERE insured_client_code IS NOT NULL
        UNION ALL
        SELECT p.tenant_id, l ->> 'clientCode', NULL, p.origin = 'IMPORT'
          FROM policies p, jsonb_array_elements(p.clients) l
        UNION ALL
        SELECT p.tenant_id, pr ->> 'insuredCode', NULLIF(btrim(pr ->> 'insuredName'), ''), p.origin = 'IMPORT'
          FROM policies p, jsonb_array_elements(p.products) pr
        UNION ALL
        SELECT tenant_id, client_code, holder_name, true FROM applications
        UNION ALL
        SELECT tenant_id, client_code, NULL, false FROM family_links
        UNION ALL
        SELECT tenant_id, related_client_code, NULL, false FROM family_links
        UNION ALL
        SELECT tenant_id, client_code, NULL, false FROM leads
        UNION ALL
        SELECT tenant_id, client_code, NULL, false FROM interactions
        UNION ALL
        SELECT tenant_id, client_code, NULL, false FROM comments
        UNION ALL
        SELECT tenant_id, client_code, NULL, false FROM tasks
      ), missing AS (
        SELECT tenant_id, code,
               initcap(lower(coalesce((array_agg(name) FILTER (WHERE name IS NOT NULL))[1], ''))) AS name,
               bool_or(imported) AS imported
          FROM refs r
         WHERE coalesce(code, '') <> ''
           AND NOT EXISTS (SELECT 1 FROM clients c WHERE c.tenant_id = r.tenant_id AND c.success_code = r.code)
         GROUP BY tenant_id, code
      )
      INSERT INTO clients (tenant_id, success_code, name, name_norm, origin, created_at, updated_at)
      SELECT tenant_id, code, name, ${NORM('name')},
             CASE WHEN imported THEN 'IMPORT' ELSE 'MANUAL' END, now(), now()
        FROM missing;

      CREATE TEMP TABLE code_map ON COMMIT DROP AS
        SELECT tenant_id, success_code AS code, id FROM clients WHERE success_code IS NOT NULL;
      CREATE UNIQUE INDEX ON code_map (tenant_id, code);
    `);

    // 3. Policies: holder and insured by id, people and product lines by id, the id array kept
    //    by a trigger. A policy may hold only its number.
    await db.query(`
      DROP TRIGGER policies_client_codes ON policies;
      DROP FUNCTION policies_client_codes();
      DROP INDEX policies_clients_idx;

      ALTER TABLE policies
        ADD COLUMN holder_client_id uuid,
        ADD COLUMN insured_client_id uuid,
        ADD COLUMN client_ids uuid[] NOT NULL DEFAULT '{}';
      UPDATE policies p SET holder_client_id = m.id
        FROM code_map m WHERE m.tenant_id = p.tenant_id AND m.code = p.holder_client_code;
      UPDATE policies p SET insured_client_id = m.id
        FROM code_map m WHERE m.tenant_id = p.tenant_id AND m.code = p.insured_client_code;
      UPDATE policies p SET
        clients = coalesce((
          SELECT jsonb_agg((l - 'clientCode') || jsonb_build_object('clientId', m.id) ORDER BY e.ord)
            FROM jsonb_array_elements(p.clients) WITH ORDINALITY AS e (l, ord)
            JOIN code_map m ON m.tenant_id = p.tenant_id AND m.code = l ->> 'clientCode'
        ), '[]'),
        -- PRD-3: no id = the main insured, or a person known only by name
        products = coalesce((
          SELECT jsonb_agg(
                   (pr - 'insuredCode')
                   || CASE WHEN m.id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('insuredClientId', m.id) END
                   ORDER BY e.ord)
            FROM jsonb_array_elements(p.products) WITH ORDINALITY AS e (pr, ord)
            LEFT JOIN code_map m ON m.tenant_id = p.tenant_id AND m.code = pr ->> 'insuredCode'
        ), '[]');

      CREATE FUNCTION policies_client_ids() RETURNS trigger
        LANGUAGE plpgsql
        AS $$ BEGIN
          NEW.client_ids := ARRAY(
            SELECT DISTINCT (item ->> 'clientId')::uuid FROM jsonb_array_elements(NEW.clients) AS item
             WHERE item ->> 'clientId' IS NOT NULL);
          RETURN NEW;
        END $$;
      CREATE TRIGGER policies_client_ids BEFORE INSERT OR UPDATE OF clients ON policies
        FOR EACH ROW EXECUTE FUNCTION policies_client_ids();
      -- Fires the trigger once for every row
      UPDATE policies SET clients = clients;
      CREATE INDEX policies_clients_idx ON policies USING gin (client_ids);

      ALTER TABLE policies
        DROP COLUMN holder_client_code,
        DROP COLUMN insured_client_code,
        DROP COLUMN client_codes,
        ALTER COLUMN holder_name DROP NOT NULL,
        ALTER COLUMN holder_name_norm DROP NOT NULL,
        ALTER COLUMN insured_name DROP NOT NULL,
        ALTER COLUMN insured_name_norm DROP NOT NULL,
        ALTER COLUMN status DROP NOT NULL,
        ALTER COLUMN effective_date DROP NOT NULL,
        ALTER COLUMN maturity_date DROP NOT NULL,
        ALTER COLUMN premium_frequency DROP NOT NULL,
        ALTER COLUMN base_premium_vnd DROP NOT NULL,
        ADD FOREIGN KEY (tenant_id, holder_client_id) REFERENCES clients (tenant_id, id),
        ADD FOREIGN KEY (tenant_id, insured_client_id) REFERENCES clients (tenant_id, id);
    `);

    // 4. Applications, family links and leads
    const checkOn = async (table: string) =>
      (
        (await db.query(
          `SELECT conname FROM pg_constraint
            WHERE conrelid = $1::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%client_code%'`,
          [table],
        )) as { conname: string }[]
      )[0]?.conname;
    const familyCheck = await checkOn('family_links');
    await db.query(`
      ALTER TABLE applications ADD COLUMN client_id uuid;
      UPDATE applications a SET client_id = m.id
        FROM code_map m WHERE m.tenant_id = a.tenant_id AND m.code = a.client_code;
      DROP INDEX applications_client_idx;
      ALTER TABLE applications DROP COLUMN client_code,
        ADD FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, id);
      CREATE INDEX applications_client_idx ON applications (tenant_id, client_id);

      ALTER TABLE family_links ADD COLUMN client_id uuid, ADD COLUMN related_client_id uuid;
      UPDATE family_links f SET client_id = m.id
        FROM code_map m WHERE m.tenant_id = f.tenant_id AND m.code = f.client_code;
      UPDATE family_links f SET related_client_id = m.id
        FROM code_map m WHERE m.tenant_id = f.tenant_id AND m.code = f.related_client_code;
      DROP INDEX family_links_client_idx;
      DROP INDEX family_links_related_idx;
      DROP INDEX family_links_pair_key;
      ALTER TABLE family_links
        ${familyCheck ? `DROP CONSTRAINT ${familyCheck},` : ''}
        DROP COLUMN client_code,
        DROP COLUMN related_client_code,
        ALTER COLUMN client_id SET NOT NULL,
        -- A relation names a client or a relative, never both
        ADD CHECK ((related_client_id IS NULL) <> (full_name IS NULL)),
        ADD FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, id),
        ADD FOREIGN KEY (tenant_id, related_client_id) REFERENCES clients (tenant_id, id);
      CREATE INDEX family_links_client_idx ON family_links (tenant_id, client_id);
      CREATE INDEX family_links_related_idx ON family_links (tenant_id, related_client_id);
      -- FAM-2: one record per pair of clients
      CREATE UNIQUE INDEX family_links_pair_key ON family_links (tenant_id, client_id, related_client_id)
        WHERE related_client_id IS NOT NULL;

      ALTER TABLE leads ADD COLUMN client_id uuid;
      UPDATE leads l SET client_id = m.id
        FROM code_map m WHERE m.tenant_id = l.tenant_id AND m.code = l.client_code;
      DROP INDEX leads_client_link_key;
      ALTER TABLE leads DROP COLUMN client_code,
        ADD FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, id);
      -- LEAD-32: a client is linked to one lead at most
      CREATE UNIQUE INDEX leads_client_link_key ON leads (tenant_id, client_id)
        WHERE link_status = 'CONFIRMED';
    `);

    // 5. Notes, comments and tasks on a client
    for (const table of CLIENT_CHILDREN) {
      const check = await checkOn(table);
      await db.query(`
        ALTER TABLE ${table} ADD COLUMN client_id uuid;
        UPDATE ${table} t SET client_id = m.id
          FROM code_map m WHERE m.tenant_id = t.tenant_id AND m.code = t.client_code;
        DROP INDEX ${table}_client_idx;
        ${check ? `ALTER TABLE ${table} DROP CONSTRAINT ${check};` : ''}
        ALTER TABLE ${table} DROP COLUMN client_code,
          ADD FOREIGN KEY (tenant_id, client_id) REFERENCES clients (tenant_id, id);
        ${table === 'tasks' ? '' : `ALTER TABLE ${table} ADD CHECK (lead_id IS NOT NULL OR client_id IS NOT NULL);`}
        CREATE INDEX ${table}_client_idx ON ${table} (tenant_id, client_id${table === 'comments' ? ', created_at' : table === 'interactions' ? ', occurred_at' : ''});
      `);
    }

    // 6. History and messages point at the id. The audit log is left as written: it is
    //    append-only and hash-chained (AUD-1), so its old rows keep the code they recorded.
    await db.query(`
      UPDATE record_changes r SET entity_key = m.id::text
        FROM code_map m WHERE r.entity = 'client' AND m.tenant_id = r.tenant_id AND m.code = r.entity_key;
      UPDATE record_changes r SET entity_key =
             split_part(r.entity_key, '/', 1) || '/' || split_part(r.entity_key, '/', 2) || '/' || coalesce(m.id::text, '')
        FROM (SELECT id, tenant_id, split_part(entity_key, '/', 3) AS code FROM record_changes
               WHERE entity = 'policy_product') k
        LEFT JOIN code_map m ON m.tenant_id = k.tenant_id AND m.code = k.code
       WHERE r.id = k.id;
      -- The holder and main insured are shown by name in the history
      UPDATE record_changes r SET
             field = CASE r.field WHEN 'holderClientCode' THEN 'holderClient' ELSE 'insuredClient' END,
             old_value = (SELECT c.name FROM clients c WHERE c.tenant_id = r.tenant_id AND c.success_code = r.old_value),
             new_value = (SELECT c.name FROM clients c WHERE c.tenant_id = r.tenant_id AND c.success_code = r.new_value)
       WHERE r.field IN ('holderClientCode', 'insuredClientCode');

      -- LEAD-32: the linked client is shown by name in the lead history
      UPDATE lead_history h SET
             field = 'client',
             old_value = (SELECT c.name FROM clients c WHERE c.tenant_id = h.tenant_id AND c.success_code = h.old_value),
             new_value = (SELECT c.name FROM clients c WHERE c.tenant_id = h.tenant_id AND c.success_code = h.new_value)
       WHERE h.field = 'clientCode';

      UPDATE notifications n SET data = (n.data - 'clientCode') || jsonb_build_object('clientId', m.id)
        FROM code_map m
       WHERE m.tenant_id = n.tenant_id AND m.code = n.data ->> 'clientCode';
      UPDATE notifications n SET link = '/clients/' || m.id || substr(n.link, length('/clients/' || m.code) + 1)
        FROM code_map m
       WHERE m.tenant_id = n.tenant_id AND m.code = substring(n.link FROM '^/clients/([0-9]{10})');

      -- Birthday notices already sent this year: bday:<agent>:<client>:<year>
      UPDATE notice_keys k SET key =
             'bday:' || split_part(k.key, ':', 2) || ':' || m.id || ':' || split_part(k.key, ':', 4)
        FROM code_map m
       WHERE k.key LIKE 'bday:%' AND m.tenant_id = k.tenant_id AND m.code = split_part(k.key, ':', 3);
    `);

    // 7. CUS-4: links for the people who just got a row (from their policies, applications, leads)
    await db.query(`
      -- Only clients without any link: the new rows (an older client keeps the links it has)
      WITH fresh AS (
        SELECT id, tenant_id FROM clients WHERE agent_links = '[]'::jsonb
      ), wanted AS (
        SELECT DISTINCT f.id, a.code AS agent,
               CASE l ->> 'role' WHEN 'PO' THEN 'POLICY_HOLDER' ELSE 'POLICY_INSURED' END AS source
          FROM fresh f
          JOIN policies p ON p.tenant_id = f.tenant_id AND p.client_ids @> ARRAY[f.id]
          CROSS JOIN LATERAL jsonb_array_elements(p.clients) l
          CROSS JOIN LATERAL unnest(p.current_agent_codes) a (code)
         WHERE (l ->> 'clientId')::uuid = f.id AND l ->> 'endedAt' IS NULL AND l ->> 'role' IN ('PO', 'LI')
        UNION
        SELECT f.id, ap.agent_code, 'APPLICATION'
          FROM fresh f JOIN applications ap ON ap.tenant_id = f.tenant_id AND ap.client_id = f.id
        UNION
        SELECT f.id, ld.assigned_agent_code, 'LEAD_LINK'
          FROM fresh f JOIN leads ld ON ld.tenant_id = f.tenant_id AND ld.client_id = f.id
         WHERE ld.link_status = 'CONFIRMED' AND ld.assigned_agent_code IS NOT NULL
      )
      UPDATE clients c SET
             agent_links = w.links, visible_agent_codes = w.agents, owner_agent_codes = w.agents
        FROM (SELECT id,
                     jsonb_agg(jsonb_build_object('agentCode', agent, 'source', source, 'createdAt', now())) AS links,
                     array_agg(DISTINCT agent) AS agents
                FROM wanted GROUP BY id) w
       WHERE c.id = w.id;
    `);
  }

  async down(): Promise<void> {
    // The rows made for people who had only a code, and the history rewritten to names, cannot
    // be told apart again; restore the database from the backup taken before deploying instead.
    throw new Error('ClientId1764259200000 cannot be reverted; restore a backup.');
  }
}
