import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { forbidden, notFound } from '../../common/errors.js';
import { normalizeName } from '../../common/normalize.js';
import { escapeLike } from '../../common/pagination.js';
import { Role } from '../../common/rbac.js';
import type { Actor, Scope } from '../../common/rbac.js';
import {
  and,
  namedParams,
  or,
  positional,
  raw,
  sql,
} from '../../core/persistence/fragment.js';
import type { Sql } from '../../core/persistence/fragment.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { insertRows, updateRows } from '../../core/persistence/upsert.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AgentsService } from '../agents/agents.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { ProductsService } from '../products/products.service.js';
import { toProductView } from '../products/product.entity.js';
import {
  coverageGroup,
  listFlags,
  signals,
  signalWindows,
} from './client-insights.js';
import type { ListSignal } from './client-insights.js';
import { deriveLinks, isActiveStatus } from './client-links.js';
import { policyDeletable } from './client-rules.js';
import type { ListClientsQueryDto } from './clients.dto.js';
import { refId } from '../imports/success-plan.js';
import type { SuccessPlan } from '../imports/success-plan.js';
import {
  Application,
  Client,
  Policy,
} from './infrastructure/client.entities.js';

export type Reach = { all: boolean; codes: string[] };

/** Fields of a stored record that an import never sets. */
const NOT_IMPORTED = [
  'id',
  'tenantId',
  'createdAt',
  'origin',
  'createdBy',
  'clientIds',
];
const imported = (fields: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(fields).filter(([key]) => !NOT_IMPORTED.includes(key)),
  );

/** DATA-2: today's date in Vietnam, as `YYYY-MM-DD`. */
export const todayInVietnam = (now = new Date()) =>
  new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

/** CUS-5: clients (alias `c`) this reach sees. */
export const clientsSeen = (reach: Reach): Sql | null =>
  reach.all ? null : sql`c.visible_agent_codes && ${reach.codes}::text[]`;

/** CUS-8: policies (alias `p`) this reach sees. */
export const policiesSeen = (reach: Reach): Sql | null =>
  reach.all ? null : sql`p.current_agent_codes && ${reach.codes}::text[]`;

/** Policies (alias `p`) naming any of these clients, in any role, ended links included. */
export const policiesNaming = (clientIds: readonly string[]): Sql =>
  sql`p.client_ids && ${[...clientIds]}::uuid[]`;

/** The people still on a policy, each with their roles (CUS-11): ended links left out. */
export const peopleOn = (policy: Pick<Policy, 'clients'>) => {
  const roles = new Map<string, Set<string>>();
  for (const link of policy.clients) {
    if (link.endedAt) continue;
    const held = roles.get(link.clientId) ?? new Set<string>();
    held.add(link.role);
    roles.set(link.clientId, held);
  }
  return roles;
};

@Injectable()
export class ClientsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly agents: AgentsService,
    private readonly audit: AuditService,
    private readonly products: ProductsService,
  ) {}

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  clients(db: EntityManager, scope: Scope, where: Sql) {
    const [text, params] = namedParams(
      and(sql`c.tenant_id = ${scope.tenantId}`, where),
    );
    return db.getRepository(Client).createQueryBuilder('c').where(text, params);
  }

  policies(db: EntityManager, scope: Scope, where: Sql) {
    const [text, params] = namedParams(
      and(sql`p.tenant_id = ${scope.tenantId}`, where),
    );
    return db.getRepository(Policy).createQueryBuilder('p').where(text, params);
  }

  applications(db: EntityManager, scope: Scope, where: Sql) {
    const [text, params] = namedParams(
      and(sql`a.tenant_id = ${scope.tenantId}`, where),
    );
    return db
      .getRepository(Application)
      .createQueryBuilder('a')
      .where(text, params);
  }

  /**
   * CUS-5: GA_HEAD sees every client, a manager the branch, a FC their own. Marketing and Admin
   * have no client book (they get the masked portfolio, CUS-16), so they are refused.
   */
  async reach(actor: Actor, db?: EntityManager): Promise<Reach> {
    this.scopeOf(actor);
    if (actor.reach === 'TENANT') return { all: true, codes: [] };
    if (actor.reach === 'NONE') throw forbidden();
    return { all: false, codes: await this.agents.scopeCodes(actor, db) };
  }

  /** CMT-5: whether someone (the actor or a user being mentioned) sees this client (CUS-5). */
  async visibleTo(
    actor: Actor,
    clientId: string,
    db?: EntityManager,
  ): Promise<boolean> {
    if (!actor.tenantId || actor.reach === 'NONE') return false;
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(
      scope,
      async (tx) => {
        const reach = await this.reach(actor, tx);
        return (
          (await this.clients(
            tx,
            scope,
            and(sql`c.id = ${clientId}`, clientsSeen(reach)),
          ).getCount()) > 0
        );
      },
      db,
    );
  }

  /**
   * The client id behind each Success code the import names (`clients.success_code`), and behind
   * each `id:<id>` the planner uses for a stored person without one. Unknown codes are left out.
   */
  async idsOfCodes(
    scope: Scope,
    codes: readonly string[],
    db: EntityManager,
  ): Promise<Map<string, string>> {
    const ids = new Map<string, string>();
    const real: string[] = [];
    for (const code of new Set(codes)) {
      const id = refId(code);
      if (id) ids.set(code, id);
      else real.push(code);
    }
    if (real.length > 0)
      for (const row of await rowsOf<{ id: string; success_code: string }>(
        db,
        `SELECT id, success_code FROM clients WHERE tenant_id = $1 AND success_code = ANY($2::text[])`,
        [scope.tenantId, real],
      ))
        ids.set(row.success_code, row.id);
    return ids;
  }

  /**
   * Section 12.1, IMP-3 step 5: writes sheets 02-05 of a Success file inside the commit transaction,
   * then works out the links of every client it touched. The plan names people by the file's
   * codes; they are written as client ids (decided 25/11/2026).
   */
  async applyImport(
    plan: SuccessPlan,
    scope: Scope,
    importId: string,
    now: Date,
    db: EntityManager,
  ): Promise<void> {
    const { tenantId } = scope;
    const stamp = { lastImportId: importId, lastSeenAt: now, updatedAt: now };
    const fresh = {
      tenantId,
      origin: 'IMPORT',
      agentLinks: [],
      visibleAgentCodes: [],
      ownerAgentCodes: [],
      createdAt: now,
    };
    // A client added by hand takes the code the file gives them on their policy
    for (const { clientCode, clientId } of plan.adoptions)
      await db.query(
        `UPDATE clients SET success_code = $3 WHERE tenant_id = $1 AND id = $2 AND success_code IS NULL`,
        [tenantId, clientId, clientCode],
      );
    // MAN-8 + CUS-3: every column the sheet has is overwritten, and the phone is never touched
    const clientRows = plan.clients.map(({ clientCode, set }) => ({
      ...set,
      successCode: clientCode,
      ...stamp,
    }));
    await insertRows(
      db,
      Client,
      plan.clients
        .filter((item) => item.isNew)
        .map((item) => ({
          ...fresh,
          ...item.set,
          successCode: item.clientCode,
          ...stamp,
        })),
      { ignoreExisting: true },
    );
    await updateRows(
      db,
      Client,
      tenantId,
      'successCode',
      clientRows.filter((_, index) => !plan.clients[index].isNew),
    );
    // CUS-1: holders and applicants the file names without a 02_Clients row
    await insertRows(
      db,
      Client,
      plan.implicitClients.map(({ clientCode, name }) => ({
        ...fresh,
        successCode: clientCode,
        name,
        nameNorm: normalizeName(name),
        ...stamp,
      })),
      { ignoreExisting: true },
    );
    // CUS-4: the link a client sheet gives its uploader, added once
    for (const { clientCode, link } of plan.clients) {
      if (!link) continue;
      await db.query(
        `UPDATE clients SET agent_links = agent_links || jsonb_build_array(
            jsonb_build_object('agentCode', $3::text, 'source', $4::text, 'createdAt', $5::timestamptz))
          WHERE tenant_id = $1 AND success_code = $2
            AND NOT agent_links @> jsonb_build_array(jsonb_build_object('agentCode', $3::text, 'source', $4::text))`,
        [tenantId, clientCode, link.agentCode, link.source, now],
      );
    }

    // Everyone a policy names is a client (an insured child included), so each gets an id
    const named = new Map<string, string>();
    const name = (code: unknown, label?: unknown) => {
      if (typeof code !== 'string' || !code || refId(code)) return;
      if (!named.get(code) && typeof label === 'string')
        named.set(code, label);
      else if (!named.has(code)) named.set(code, '');
    };
    for (const { state } of plan.policies) {
      name(state.holderClientCode, state.holderName);
      name(state.insuredClientCode, state.insuredName);
      for (const link of state.clients) name(link.clientCode);
      for (const product of state.products) name(product.insuredCode);
    }
    for (const { set } of plan.applications) name(set.clientCode, set.holderName);
    let idOf = await this.idsOfCodes(scope, [...named.keys()], db);
    const missing = [...named].filter(([code]) => !idOf.has(code));
    if (missing.length > 0) {
      await insertRows(
        db,
        Client,
        missing.map(([code, label]) => ({
          ...fresh,
          successCode: code,
          name: label,
          nameNorm: normalizeName(label),
          ...stamp,
        })),
        { ignoreExisting: true },
      );
      idOf = await this.idsOfCodes(scope, [...named.keys()], db);
    }
    const idFor = (code: unknown) =>
      typeof code === 'string' && code
        ? (refId(code) ?? idOf.get(code) ?? null)
        : null;

    const policies = plan.policies.map(({ isNew, state }) => {
      const {
        holderClientCode,
        insuredClientCode,
        clients,
        products,
        ...rest
      } = state;
      return {
        isNew,
        row: {
          ...imported(rest),
          holderClientId: idFor(holderClientCode),
          insuredClientId: idFor(insuredClientCode),
          clients: clients.map(({ clientCode, ...link }) => ({
            ...link,
            clientId: idFor(clientCode)!,
          })),
          products: products.map(({ insuredCode, ...line }) => {
            const id = idFor(insuredCode);
            return id ? { ...line, insuredClientId: id } : line;
          }),
          ...stamp,
        },
      };
    });
    await insertRows(
      db,
      Policy,
      policies
        .filter((item) => item.isNew)
        .map((item) => ({
          tenantId,
          origin: 'IMPORT',
          createdAt: now,
          ...item.row,
        })),
    );
    await updateRows(
      db,
      Policy,
      tenantId,
      'policyNo',
      policies.filter((item) => !item.isNew).map((item) => item.row),
    );

    const applications = plan.applications.map(
      ({ applicationNo, isNew, set }) => {
        const { clientCode, ...fields } = set;
        return {
          isNew,
          row: {
            ...fields,
            ...(clientCode !== undefined && { clientId: idFor(clientCode) }),
            applicationNo,
            lastImportId: importId,
            lastSeenAt: now,
          },
        };
      },
    );
    await insertRows(
      db,
      Application,
      applications
        .filter((item) => item.isNew)
        .map((item) => ({ tenantId, ...item.row })),
    );
    await updateRows(
      db,
      Application,
      tenantId,
      'applicationNo',
      applications.filter((item) => !item.isNew).map((item) => item.row),
    );

    const touched = await this.idsOfCodes(scope, plan.touchedClients, db);
    await this.recomputeLinks(scope, [...touched.values()], now, db);
  }

  /** CUS-4: links from policies, applications and linked leads follow the data; stored links stay. */
  async recomputeLinks(
    scope: Scope,
    clientIds: readonly string[],
    now: Date,
    db: EntityManager,
  ): Promise<void> {
    const ids = [...new Set(clientIds)];
    if (ids.length === 0) return;
    const clients = await this.clients(
      db,
      scope,
      sql`c.id = ANY(${ids}::uuid[])`,
    )
      .select(['c.id', 'c.agentLinks'])
      .getMany();
    const policies = await this.policies(db, scope, policiesNaming(ids))
      .select(['p.id', 'p.currentAgentCodes', 'p.clients'])
      .getMany();
    const applications = await this.applications(
      db,
      scope,
      sql`a.client_id = ANY(${ids}::uuid[])`,
    )
      .select(['a.id', 'a.clientId', 'a.agentCode'])
      .getMany();
    // LEAD-32: the assignee of a linked lead sees and owns the client
    const leads = await rowsOf<{
      client_id: string;
      assigned_agent_code: string | null;
    }>(
      db,
      `SELECT client_id, assigned_agent_code FROM leads
        WHERE tenant_id = $1 AND client_id = ANY($2::uuid[]) AND link_status = 'CONFIRMED'`,
      [scope.tenantId, ids],
    );
    for (const client of clients) {
      const derived = deriveLinks({
        clientId: client.id,
        stored: client.agentLinks ?? [],
        policies: policies.filter((policy) =>
          policy.clients.some((link) => link.clientId === client.id),
        ),
        applications: applications.filter(
          (item) => item.clientId === client.id,
        ),
        leads: leads
          .filter((lead) => lead.client_id === client.id)
          .map((lead) => ({ assignedAgentCode: lead.assigned_agent_code })),
        now,
      });
      await db.getRepository(Client).update({ id: client.id }, derived);
    }
  }

  /** CUS-5 + CUS-7: the clients in scope, narrowed by "Khách hàng của" (ownership). */
  private baseClause(
    actor: Actor,
    reach: Reach,
    agents: string | undefined,
  ): Sql {
    // CUS-7: "Khách hàng của" filters by ownership, so a manager's own list stays their own
    const wanted =
      agents === 'ALL'
        ? null
        : agents
          ? agents.split(',')
          : actor.agentCode
            ? [actor.agentCode]
            : null;
    const allowed = wanted
      ? reach.all
        ? wanted
        : wanted.filter((code) => reach.codes.includes(code))
      : null;
    return and(
      clientsSeen(reach),
      allowed && sql`c.owner_agent_codes && ${allowed}::text[]`,
    );
  }

  /**
   * SIG-1: the clients a list tab gathers, worked out from the policies this person sees, with the
   * same rules as the client page (section 10.11). Also used by the care workload report (R7).
   */
  async signalClause(
    scope: Scope,
    reach: Reach,
    signal: ListSignal,
    today: string,
    db: EntityManager,
  ): Promise<Sql> {
    const window = signalWindows(today);
    if (signal === 'birthday') return sql`c.birth_month = ${window.month}`;
    let filter: Sql;
    if (signal === 'due')
      filter = sql`p.premium_due_date BETWEEN ${today}::date AND ${window.dueUntil}::date`;
    else if (signal === 'debt')
      filter = sql`(p.unpaid_premium_vnd > 0 OR p.apl_debt_vnd > 0)`;
    else if (signal === 'maturity')
      filter = sql`p.maturity_date BETWEEN ${today}::date AND ${window.maturityUntil}::date`;
    else {
      // Statuses are free text from Success, so find the ones that are not "Đang hiệu lực"
      const statuses = (
        await this.policies(db, scope, and(policiesSeen(reach)))
          .select('DISTINCT p.status', 'status')
          .getRawMany<{ status: string }>()
      ).map((row) => row.status);
      filter = sql`p.status = ANY(${statuses.filter((status) => !isActiveStatus(status))}::text[])`;
    }
    const policies = await this.policies(
      db,
      scope,
      and(filter, policiesSeen(reach)),
    )
      .select(['p.id', 'p.status', 'p.clients'])
      .getMany();
    // Premium and debt signals belong to the holder; maturity and lapse to anyone on the policy
    const roles =
      signal === 'due' || signal === 'debt' ? ['PO'] : ['PO', 'LI', 'BEN'];
    const ids = new Set<string>();
    for (const policy of policies) {
      if (
        (signal === 'due' || signal === 'maturity') &&
        !isActiveStatus(policy.status)
      )
        continue;
      for (const link of policy.clients)
        if (!link.endedAt && roles.includes(link.role)) ids.add(link.clientId);
    }
    const byId = sql`c.id = ANY(${[...ids]}::uuid[])`;
    return signal === 'lapsed' ? or(byId, sql`c.lapsed_policies > 0`) : byId;
  }

  /** SIG-1: the count of every tab, 0 when there is none. */
  async counts(actor: Actor, query: ListClientsQueryDto) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const reach = await this.reach(actor, db);
      const base = this.baseClause(actor, reach, query.agents);
      const today = todayInVietnam();
      const count = async (signal?: ListSignal) =>
        this.clients(
          db,
          scope,
          and(
            base,
            signal &&
              (await this.signalClause(scope, reach, signal, today, db)),
          ),
        ).getCount();
      return {
        all: await count(),
        due: await count('due'),
        debt: await count('debt'),
        maturity: await count('maturity'),
        birthday: await count('birthday'),
        lapsed: await count('lapsed'),
      };
    });
  }

  async list(actor: Actor, query: ListClientsQueryDto) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const reach = await this.reach(actor, db);
      const today = todayInVietnam();
      let search: Sql | null = null;
      if (query.q) {
        const name = sql`c.name_norm LIKE ${`%${escapeLike(normalizeName(query.q))}%`}`;
        const digits = query.q.replace(/\D/g, '');
        search =
          digits.length >= 3
            ? or(
                name,
                // Decided 25/11/2026: a policy number lists everyone on that policy
                sql`EXISTS (SELECT 1 FROM policies p
                             WHERE p.tenant_id = c.tenant_id AND p.client_ids @> ARRAY[c.id]
                               AND p.policy_no LIKE ${`${digits}%`})`,
                sql`c.phone LIKE ${`%${digits}%`}`,
              )
            : name;
      }
      const where = and(
        this.baseClause(actor, reach, query.agents),
        query.signal &&
          (await this.signalClause(scope, reach, query.signal, today, db)),
        query.tier && sql`c.tier = ${query.tier}`,
        search,
      );
      const [items, total] = await this.clients(db, scope, where)
        .orderBy('c.nameNorm', 'ASC')
        .addOrderBy('c.id', 'ASC')
        .skip((query.page - 1) * query.pageSize)
        .take(query.pageSize)
        .getManyAndCount();

      const policies = await this.visiblePolicies(
        db,
        scope,
        reach,
        policiesNaming(items.map((client) => client.id)),
      );
      const agentNames = await this.agents.namesByCode(
        scope,
        [...new Set(items.flatMap((client) => client.ownerAgentCodes))],
        db,
      );
      return {
        items: items.map((client) => {
          const mine = policies.filter((policy) =>
            policy.clients.some(
              (link) => link.clientId === client.id && !link.endedAt,
            ),
          );
          const active = mine.filter((policy) => isActiveStatus(policy.status));
          // The nearest premium due on an active policy the client pays for
          const nextDue =
            active
              .filter(
                (policy) =>
                  policy.holderClientId === client.id &&
                  policy.premiumDueDate &&
                  policy.premiumDueDate >= today,
              )
              .map((policy) => policy.premiumDueDate!)
              .sort()[0] ?? null;
          return {
            id: client.id,
            name: client.name,
            phone: client.phone,
            tier: client.tier,
            ageBand: client.ageBand,
            // The policies the client is on and in which role, shown under the name
            policies: mine.map((policy) => ({
              policyNo: policy.policyNo,
              roles: [...(peopleOn(policy).get(client.id) ?? [])],
            })),
            gender: client.gender,
            activePolicies: active.length,
            nextDue,
            // ASG-5: the agents who look after the client
            agents: client.ownerAgentCodes.map((code) => ({
              agentCode: code,
              name: agentNames.get(code) ?? null,
            })),
            manual: client.origin === 'MANUAL',
            // SIG-1 + CUS-14: the signal labels of the row
            ...listFlags(
              signals({
                client,
                policies: mine,
                coverage: [],
                family: [],
                today,
              }),
            ),
          };
        }),
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
    });
  }

  /**
   * TENANT-5: a product of the catalogue and, for someone with a client book, the policies in their
   * scope (CUS-8) that carry it, each with the people on it. Marketing and Admin see the product only.
   */
  async product(actor: Actor, code: string) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const product = (await this.products.byCode(db, [code])).get(code);
      if (!product) throw notFound();
      if (actor.reach === 'NONE')
        return { product: toProductView(product), policies: null };
      const reach = await this.reach(actor, db);
      const policies = await this.policies(
        db,
        scope,
        and(
          sql`p.products @> ${JSON.stringify([{ productCode: code }])}::jsonb`,
          policiesSeen(reach),
        ),
      )
        .orderBy('p.effectiveDate', 'DESC', 'NULLS LAST')
        .addOrderBy('p.policyNo', 'ASC')
        .take(200)
        .getMany();
      const ids = [
        ...new Set(policies.flatMap((policy) => [...peopleOn(policy).keys()])),
      ];
      const people = await rowsOf<{ id: string; name: string; seen: boolean }>(
        db,
        ...positional(
          sql`SELECT c.id, c.name, ${clientsSeen(reach) ?? raw('TRUE')} AS seen FROM clients c
               WHERE c.tenant_id = ${scope.tenantId} AND c.id = ANY(${ids}::uuid[])`,
        ),
      );
      const personById = new Map(people.map((person) => [person.id, person]));
      return {
        product: toProductView(product),
        policies: policies.map((policy) => ({
          policyNo: policy.policyNo,
          status: policy.status,
          active: isActiveStatus(policy.status),
          effectiveDate: policy.effectiveDate,
          people: [...peopleOn(policy)].map(([id, roles]) => ({
            clientId: personById.get(id)?.seen ? id : null,
            name: personById.get(id)?.name ?? '',
            roles: [...roles],
          })),
          // The lines of this product: who it insures and for how much
          lines: policy.products
            .filter((line) => line.productCode === code)
            .map((line) => ({
              insuredName: line.insuredClientId
                ? (personById.get(line.insuredClientId)?.name ??
                  line.insuredName ??
                  null)
                : (line.insuredName ?? policy.insuredName),
              sumAssuredVnd: line.sumAssuredVnd ?? null,
              annualPremiumVnd: line.annualPremiumVnd ?? null,
            })),
        })),
      };
    });
  }

  /** CUS-8: only policies the viewer may see, with every agent and share on them. */
  visiblePolicies(
    db: EntityManager,
    scope: Scope,
    reach: Reach,
    where: Sql,
  ): Promise<Policy[]> {
    return this.policies(db, scope, and(where, policiesSeen(reach)))
      .orderBy('p.effectiveDate', 'DESC', 'NULLS LAST')
      .addOrderBy('p.policyNo', 'ASC')
      .getMany();
  }

  /** CUS-15, first tab. Opening a client is audited (CUS-9). TEN-3: unseen and foreign look missing. */
  async detail(actor: Actor, clientId: string) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const reach = await this.reach(actor, db);
      const client = await this.clients(
        db,
        scope,
        and(sql`c.id = ${clientId}`, clientsSeen(reach)),
      ).getOne();
      if (!client) throw notFound();

      const policies = await this.visiblePolicies(
        db,
        scope,
        reach,
        policiesNaming([clientId]),
      );
      const applications = await this.applications(
        db,
        scope,
        and(
          sql`a.client_id = ${clientId}`,
          !reach.all && sql`a.agent_code = ANY(${reach.codes}::text[])`,
        ),
      )
        .orderBy('a.createdDate', 'DESC')
        .getMany();

      const agentCodes = new Set<string>(client.ownerAgentCodes);
      for (const policy of policies)
        for (const agent of policy.agents) agentCodes.add(agent.agentCode);
      for (const application of applications)
        agentCodes.add(application.agentCode);
      const peopleIds = new Set<string>();
      for (const policy of policies) {
        for (const link of policy.clients) peopleIds.add(link.clientId);
        for (const product of policy.products)
          if (product.insuredClientId) peopleIds.add(product.insuredClientId);
      }
      const agentNames = await this.agents.namesByCode(
        scope,
        [...agentCodes],
        db,
      );
      // TENANT-5: the catalogue names the products and decides their benefit group (COV-3)
      const catalogue = await this.products.byCode(db, [
        ...policies.flatMap((policy) =>
          policy.products.map((product) => product.productCode),
        ),
        ...applications.flatMap((item) => item.productCode ?? []),
      ]);
      // The people on these policies, and whether the viewer may open each one (CUS-5)
      const people = await rowsOf<{ id: string; name: string; seen: boolean }>(
        db,
        ...positional(
          sql`SELECT c.id, c.name, ${clientsSeen(reach) ?? raw('TRUE')} AS seen FROM clients c
               WHERE c.tenant_id = ${scope.tenantId} AND c.id = ANY(${[...peopleIds]}::uuid[])`,
        ),
      );
      const personById = new Map(people.map((person) => [person.id, person]));
      const clientNames = Object.fromEntries(
        people.map((person) => [person.id, person.name]),
      );

      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.ViewClient,
          entity: 'client',
          entityId: client.id,
        },
        db,
      );

      // CUS-6: owners and GA_HEAD may change the client
      const canEdit =
        actor.roles.includes(Role.GaHead) ||
        (!!actor.agentCode && client.ownerAgentCodes.includes(actor.agentCode));
      return {
        client: {
          id: client.id,
          name: client.name,
          phone: client.phone,
          tier: client.tier,
          activePolicies: client.activePolicies,
          lapsedPolicies: client.lapsedPolicies,
          dob: client.dob,
          gender: client.gender,
          maritalStatus: client.maritalStatus,
          loyaltyPoints: client.loyaltyPoints,
          usesDconnect: client.usesDconnect,
          dconnectLastLoginAt: client.dconnectLastLoginAt,
          idUpdated: client.idUpdated,
          ekycRegistered: client.ekycRegistered,
          ekycRegisteredAt: client.ekycRegisteredAt,
          birthDayMonth: client.birthDayMonth,
          ageBand: client.ageBand,
          manual: client.origin === 'MANUAL',
          agents: client.ownerAgentCodes.map((code) => ({
            agentCode: code,
            name: agentNames.get(code) ?? null,
          })),
        },
        policies: policies.map((policy) => ({
          policyNo: policy.policyNo,
          status: policy.status,
          active: isActiveStatus(policy.status),
          roles: [...(peopleOn(policy).get(clientId) ?? [])],
          // Everyone on the policy and their roles; only people the viewer sees can be opened
          people: [...peopleOn(policy)].map(([id, roles]) => ({
            clientId: personById.get(id)?.seen ? id : null,
            name: personById.get(id)?.name ?? '',
            roles: [...roles],
            self: id === clientId,
          })),
          holderClientId: policy.holderClientId,
          holderName: policy.holderName,
          insuredClientId: policy.insuredClientId,
          insuredName: policy.insuredName,
          effectiveDate: policy.effectiveDate,
          maturityDate: policy.maturityDate,
          premiumFrequency: policy.premiumFrequency,
          premiumDueDate: policy.premiumDueDate,
          plannedPremiumVnd: policy.plannedPremiumVnd,
          basePremiumVnd: policy.basePremiumVnd,
          unpaidPremiumVnd: policy.unpaidPremiumVnd,
          aplDebtVnd: policy.aplDebtVnd,
          hasBeneficiary: policy.hasBeneficiary,
          servicingAgentCode: policy.servicingAgentCode,
          // CUS-8: every current agent and share, so a split policy reads the same for all of them
          agents: policy.agents
            .filter((agent) => !agent.endedAt)
            .map((agent) => ({
              agentCode: agent.agentCode,
              name: agentNames.get(agent.agentCode) ?? null,
              splitPercent: agent.splitPercent ?? null,
              isServicing: agent.isServicing,
            })),
          products: policy.products.map((product) => ({
            productCode: product.productCode,
            productName: product.productName ?? null,
            productRole: product.productRole,
            // COV-3, with the catalogue's category when the product is in it
            group: coverageGroup({
              ...product,
              category: catalogue.get(product.productCode)?.category,
            }),
            // TENANT-5: the catalogue's name, and whether the product page exists
            catalogueName:
              catalogue.get(product.productCode)?.productName ?? null,
            // PRD-3: none is the main insured; a GA-entered name wins when there is one
            insuredClientId: product.insuredClientId ?? null,
            insuredName:
              product.insuredName ??
              (product.insuredClientId
                ? (clientNames[product.insuredClientId] ?? null)
                : policy.insuredName),
            sumAssuredVnd: product.sumAssuredVnd ?? null,
            annualPremiumVnd: product.annualPremiumVnd ?? null,
            plan: product.plan ?? null,
            startDate: product.startDate ?? null,
            status: product.status ?? null,
            termYears: product.termYears ?? null,
          })),
          manual: policy.origin === 'MANUAL',
          // POL-7: shown only to someone who may edit the client
          canDelete: canEdit && policyDeletable(policy, new Date()),
        })),
        applications: applications.map((application) => ({
          applicationNo: application.applicationNo,
          policyNo: application.policyNo,
          agentCode: application.agentCode,
          agentName: agentNames.get(application.agentCode) ?? null,
          createdDate: application.createdDate,
          receivedDate: application.receivedDate,
          issuedDate: application.issuedDate,
          status: application.status,
          productCode: application.productCode,
          productName: application.productCode
            ? (catalogue.get(application.productCode)?.productName ?? null)
            : null,
          apeVnd: application.apeVnd,
        })),
        clientNames,
        canEdit,
      };
    });
  }
}
