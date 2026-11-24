import { ownerDb } from './owner-db.js';

/**
 * The id of the client a Success file named by this code (decided 25/11/2026: clients are
 * addressed by id; the code is only `clients.success_code`, which no API returns). Throws when no
 * client, or more than one GA's client, has the code, so a test never picks the wrong person.
 */
export async function clientIdOf(
  successCode: string,
  tenantId?: string,
): Promise<string> {
  const { rows } = await ownerDb().query<{ id: string }>(
    `SELECT id FROM clients WHERE success_code = $1 AND ($2::uuid IS NULL OR tenant_id = $2)`,
    [successCode, tenantId ?? null],
  );
  if (rows.length !== 1)
    throw new Error(`${rows.length} clients have the code ${successCode}`);
  return rows[0].id;
}

/** The ids of the clients the API listed, for comparing with `clientIdOf`. */
export const idsOf = (body: { items: { id: string }[] }) =>
  body.items.map((item) => item.id);
