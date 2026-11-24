import { HttpStatus, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import {
  ApiException,
  ErrorCode,
  forbidden,
  notFound,
  pgError,
} from '../../common/errors.js';
import { normalizeName, parsePhone } from '../../common/normalize.js';
import { Permission, Role } from '../../common/rbac.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { and, sql } from '../../core/persistence/fragment.js';
import { newId } from '../../core/persistence/ids.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AgentsService } from '../agents/agents.service.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { maskPhone } from '../leads/lead-rules.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { POLICY_NO } from './client.constants.js';
import {
  ageBandOf,
  birthDayMonthOf,
  buildProductLines,
  policyDeletable,
} from './client-rules.js';
import type { ProductLineInput, ProgramRef } from './client-rules.js';
import type {
  AssignClientsDto,
  ClientFieldsDto,
  CreateClientDto,
  CreatePolicyDto,
  PolicyFieldsDto,
} from './clients.dto.js';
import {
  clientsSeen,
  ClientsService,
  peopleOn,
  policiesNaming,
} from './clients.service.js';
import {
  Client,
  Policy,
  RecordChange,
} from './infrastructure/client.entities.js';
import type {
  PolicyClient,
  PolicyProduct,
} from './infrastructure/client.entities.js';
import { ProgramsService } from './programs.service.js';

const todayInVietnam = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
    new Date(),
  );

type Fields = Record<string, unknown>;

/** The client fields a person enters; everything else is worked out or comes from Success. */
const CLIENT_FIELDS = [
  'name',
  'phone',
  'tier',
  'dob',
  'ageBand',
  'gender',
  'maritalStatus',
  'loyaltyPoints',
  'usesDconnect',
  'dconnectLastLoginAt',
  'ekycRegistered',
  'ekycRegisteredAt',
  'idUpdated',
] as const;

const POLICY_FIELDS = [
  'status',
  'effectiveDate',
  'maturityDate',
  'premiumFrequency',
  'basePremiumVnd',
  'premiumDueDate',
  'plannedPremiumVnd',
  'unpaidPremiumVnd',
  'aplDebtVnd',
  'hasBeneficiary',
] as const;

const text = (value: unknown): string | undefined =>
  value === undefined || value === null
    ? undefined
    : value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value as string | number | boolean);

/** A summary of product lines for the change history (IMP-21 style). */
const productsText = (
  products: readonly {
    productCode: string;
    insuredName?: string;
    sumAssuredVnd?: number;
  }[],
) =>
  products
    .map(
      (item) =>
        `${item.productCode}:${item.insuredName ?? ''}:${item.sumAssuredVnd ?? ''}`,
    )
    .join(';');

interface Change {
  entity: string;
  entityKey: string;
  field: string;
  oldValue?: string;
  newValue?: string;
}

/** Sections 10.5 and 10.6: clients and policies entered and edited by hand. */
@Injectable()
export class ClientEditorService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly agents: AgentsService,
    private readonly programs: ProgramsService,
    private readonly reader: ClientsService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  /**
   * MAN-3 + POL-2: whose client or policy it becomes. A chosen agent must be one the person may
   * act for: GA_HEAD any agent of the GA, a manager their branch, a FC only themselves.
   */
  private async resolveAgent(
    actor: Actor,
    chosen: string | undefined,
    fallback: string | undefined,
    db: EntityManager,
  ): Promise<string> {
    const scope = this.scopeOf(actor);
    const agentCode = chosen ?? actor.agentCode ?? fallback;
    if (!agentCode)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.AgentRequired);
    const allowed =
      actor.roles.includes(Role.GaHead) ||
      (await this.agents.scopeCodes(actor, db)).includes(agentCode) ||
      (!chosen && agentCode === fallback);
    const known = await this.agents.namesByCode(scope, [agentCode], db);
    if (!allowed || !known.has(agentCode))
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.AgentNotFound);
    return agentCode;
  }

  /** CUS-6: owners and GA_HEAD change a client; a line manager only reads (client_not_yours). */
  async ownedClient(
    actor: Actor,
    clientId: string,
    outer?: EntityManager,
  ): Promise<Client> {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(
      scope,
      async (db) => {
        const reach = await this.reader.reach(actor, db);
        const client = await this.reader
          .clients(
            db,
            scope,
            and(sql`c.id = ${clientId}`, clientsSeen(reach)),
          )
          .getOne();
        if (!client) throw notFound();
        const owns =
          actor.roles.includes(Role.GaHead) ||
          (!!actor.agentCode &&
            client.ownerAgentCodes.includes(actor.agentCode));
        if (!owns)
          throw new ApiException(
            HttpStatus.FORBIDDEN,
            ErrorCode.ClientNotYours,
          );
        return client;
      },
      outer,
    );
  }

  /** MAN-2 + MAN-6 + CUS-3: the stored values for the fields a person sent; null clears one. */
  private clientValues(
    dto: ClientFieldsDto,
    before?: Partial<Client>,
  ): { set: Fields; unset: string[] } {
    const set: Fields = {};
    const unset: string[] = [];
    for (const field of CLIENT_FIELDS) {
      const value = dto[field];
      if (value === undefined) continue;
      if (value === null) {
        unset.push(field);
        continue;
      }
      if (field === 'phone') {
        const phone = parsePhone(value as string);
        if (!phone)
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            ErrorCode.InvalidPhone,
          );
        set.phone = phone;
      } else if (
        field === 'dconnectLastLoginAt' ||
        field === 'ekycRegisteredAt'
      ) {
        set[field] = new Date(value as string);
      } else {
        set[field] = value;
      }
    }
    if (set.name) set.nameNorm = normalizeName(set.name as string);
    // MAN-2 + MAN-6: birthday and age band follow the birth date unless an age band was given
    const dob =
      'dob' in set
        ? (set.dob as string)
        : unset.includes('dob')
          ? undefined
          : (before?.dob ?? undefined);
    if ('dob' in set || unset.includes('dob')) {
      if (dob) {
        set.birthDayMonth = birthDayMonthOf(dob);
        set.birthMonth = Number(dob.slice(5, 7));
      } else {
        unset.push('birthDayMonth', 'birthMonth');
      }
      if (dto.ageBand === undefined) {
        if (dob) set.ageBand = ageBandOf(dob, todayInVietnam());
        else unset.push('ageBand');
      }
    }
    return { set, unset };
  }

  /** PRD-2: every programme a request names, from the catalogue and shown. */
  private async programsFor(
    scope: Scope,
    lines: readonly ProductLineInput[],
    db: EntityManager,
  ) {
    const found = await this.programs.usable(
      scope,
      lines.map((line) => line.programCode),
      db,
    );
    return new Map<string, ProgramRef>(
      [...found].map(([code, program]) => [
        code,
        {
          code,
          label: program.label,
          productRole: program.productRole,
          productCode: program.productCode ?? undefined,
        },
      ]),
    );
  }

  /**
   * POL-2 + POL-3: the fields, PO / LI links and lines of a policy entered by hand. `holder` is the
   * client who pays (the client on screen when the policy is added); `current` is the main insured
   * already on the policy, kept when the form still names them.
   */
  private async buildPolicy(
    actor: Actor,
    holder: { id: string; name: string } | null,
    dto: PolicyFieldsDto,
    agentCode: string,
    db: EntityManager,
    current?: { id: string | null; name: string } | null,
  ) {
    const scope = this.scopeOf(actor);
    const insured = this.insuredOf(holder, dto, current);
    const programs = await this.programsFor(scope, dto.products ?? [], db);
    const lines = buildProductLines({
      lines: dto.products ?? [],
      programs,
      mainInsured: {
        clientId: insured?.id ?? undefined,
        name: insured?.name ?? '',
      },
    });
    if ('repeated' in lines)
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ProgramRepeated, {
        issues: [
          {
            path: `products.${lines.repeated}.programCode`,
            message: ErrorCode.ProgramRepeated,
          },
        ],
      });
    const fields: Fields = {};
    for (const field of POLICY_FIELDS)
      if (dto[field] !== undefined) fields[field] = dto[field];
    return {
      fields: {
        ...fields,
        ...(holder && {
          holderClientId: holder.id,
          holderName: holder.name,
          holderNameNorm: normalizeName(holder.name),
        }),
        insuredClientId: insured?.id ?? null,
        insuredName: insured?.name ?? null,
        insuredNameNorm: insured ? normalizeName(insured.name) : null,
      },
      clients: [
        ...(holder
          ? [{ clientId: holder.id, role: 'PO', source: 'POLICY' }]
          : []),
        ...(insured?.id
          ? [{ clientId: insured.id, role: 'LI', source: 'POLICY' }]
          : []),
      ] as PolicyClient[],
      products: lines.products,
      agentCode,
    };
  }

  /**
   * POL-2: blank, or the holder's own name, means the holder is also the main insured. The insured
   * already on the policy stays when the form keeps their name; any other name is a person known
   * only by that name (PRD-3), never another client: naming someone else's client would make the
   * serving agent its owner (CUS-4, CUS-6).
   */
  private insuredOf(
    holder: { id: string; name: string } | null,
    dto: PolicyFieldsDto,
    current?: { id: string | null; name: string } | null,
  ): { id: string | null; name: string } | null {
    const name = dto.insuredName?.trim();
    const same = (other?: string | null) =>
      !!other && normalizeName(other) === normalizeName(name ?? '');
    if (holder && (!name || same(holder.name))) return holder;
    if (current && (!name || same(current.name))) return current;
    return name ? { id: null, name } : null;
  }

  /** POL-2: 9 digits, not in the GA yet. `path` points the error at the right field of a form. */
  private async assertNewPolicy(
    scope: Scope,
    policyNo: string,
    path: string,
    db: EntityManager,
  ) {
    if (!POLICY_NO.test(policyNo))
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.InvalidPolicyNo,
        { issues: [{ path, message: ErrorCode.InvalidPolicyNo }] },
      );
    const taken = await db
      .getRepository(Policy)
      .existsBy({ tenantId: scope.tenantId, policyNo });
    if (taken)
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.PolicyExists, {
        issues: [{ path, message: ErrorCode.PolicyExists }],
      });
  }

  private async insertPolicy(
    scope: Scope,
    actor: Actor,
    policyNo: string,
    built: {
      fields: Fields;
      clients: PolicyClient[];
      products: PolicyProduct[];
      agentCode: string;
    },
    now: Date,
    db: EntityManager,
  ): Promise<void> {
    const policies = db.getRepository(Policy);
    await policies.insert(
      policies.create({
        tenantId: scope.tenantId,
        policyNo,
        ...built.fields,
        servicingAgentCode: built.agentCode,
        agents: [
          {
            agentCode: built.agentCode,
            splitPercent: 100,
            isServicing: true,
            startedAt: now,
          },
        ],
        currentAgentCodes: [built.agentCode],
        clients: built.clients,
        products: built.products,
        origin: 'MANUAL',
        createdBy: actor.id,
        createdAt: now,
        updatedAt: now,
      }),
    );
    // POL-6
    await this.audit.record(
      {
        tenantId: scope.tenantId,
        userId: actor.id,
        action: AuditAction.Create,
        entity: 'policy',
        entityId: policyNo,
        meta: {
          clientId: (built.fields.holderClientId as string | undefined) ?? null,
          agentCode: built.agentCode,
          products: built.products.length,
        },
      },
      db,
    );
  }

  /** IMP-21, extended to hand edits (section 18.5): history rows without an import id. */
  private async recordChanges(
    scope: Scope,
    actor: Actor,
    rows: Change[],
    now: Date,
    db: EntityManager,
  ) {
    if (rows.length === 0) return;
    await db.getRepository(RecordChange).insert(
      rows.map((row) => ({
        tenantId: scope.tenantId,
        entity: row.entity,
        entityKey: row.entityKey,
        field: row.field,
        oldValue: row.oldValue ?? null,
        newValue: row.newValue ?? null,
        changedBy: actor.id,
        changedAt: now,
      })),
    );
  }

  /**
   * MAN-1 to MAN-3 and MAN-7, as decided on 25/11/2026: a client is added on a policy, by its
   * number and the role they hold. A number not in the GA yet starts a policy holding only that
   * number (POL-2); a number already there must be a policy the person may work on.
   */
  async create(actor: Actor, dto: CreateClientDto): Promise<{ id: string }> {
    const scope = this.scopeOf(actor);
    const reach = await this.reader.reach(actor); // MAN-1: Marketing and Admin are refused here
    if (!POLICY_NO.test(dto.policyNo))
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ErrorCode.InvalidPolicyNo,
        { issues: [{ path: 'policyNo', message: ErrorCode.InvalidPolicyNo }] },
      );
    const id = newId();
    try {
      await this.tenantDb.run(scope, async (db) => {
        const now = new Date();
        const policy = await this.reader
          .policies(db, scope, sql`p.policy_no = ${dto.policyNo}`)
          .setLock('pessimistic_write')
          .getOne();
        const people = policy ? peopleOn(policy) : new Map<string, Set<string>>();
        if (policy) {
          // Someone else's policy is refused without telling who is on it (as MAN-4 did for codes)
          const seen =
            reach.all ||
            policy.currentAgentCodes.some((code) => reach.codes.includes(code));
          if (!seen)
            throw new ApiException(
              HttpStatus.FORBIDDEN,
              ErrorCode.PolicyNotYours,
              {
                issues: [
                  { path: 'policyNo', message: ErrorCode.PolicyNotYours },
                ],
              },
            );
          if (
            dto.role === 'PO' &&
            [...people.values()].some((roles) => roles.has('PO'))
          )
            throw new ApiException(
              HttpStatus.CONFLICT,
              ErrorCode.HolderExists,
              { issues: [{ path: 'role', message: ErrorCode.HolderExists }] },
            );
        }
        // MAN-3: the policy's serving agent when the person entering it is not an agent
        const agentCode = await this.resolveAgent(
          actor,
          dto.agentCode,
          policy?.servicingAgentCode ?? undefined,
          db,
        );
        const { set } = this.clientValues(dto);
        // The same person twice on one policy: same name and, when both are known, birth date
        const others =
          people.size > 0
            ? await db
                .getRepository(Client)
                .findBy({ tenantId: scope.tenantId, id: In([...people.keys()]) })
            : [];
        if (
          others.some(
            (other) =>
              other.nameNorm === set.nameNorm &&
              (!other.dob || !set.dob || other.dob === set.dob),
          )
        )
          throw new ApiException(
            HttpStatus.CONFLICT,
            ErrorCode.PersonOnPolicy,
            { issues: [{ path: 'name', message: ErrorCode.PersonOnPolicy }] },
          );

        const clients = db.getRepository(Client);
        await clients.insert(
          clients.create({
            id,
            tenantId: scope.tenantId,
            ...set,
            agentLinks: [{ agentCode, source: 'MANUAL', createdAt: now }],
            visibleAgentCodes: [agentCode],
            ownerAgentCodes: [agentCode],
            origin: 'MANUAL',
            createdBy: actor.id,
            createdAt: now,
            updatedAt: now,
          }),
        );
        const name = set.name as string;
        const holder = dto.role === 'PO';
        // CUS-11: one main insured; anyone else insured is on a product line (PRD-3)
        const mainInsured =
          dto.role === 'LI' &&
          !(policy?.clients ?? []).some(
            (link) =>
              link.role === 'LI' && link.source === 'POLICY' && !link.endedAt,
          );
        const link: PolicyClient = {
          clientId: id,
          role: dto.role,
          source: dto.role === 'LI' && !mainInsured ? 'PRODUCT' : 'POLICY',
        };
        const fields: Fields = {
          ...(holder && {
            holderClientId: id,
            holderName: name,
            holderNameNorm: set.nameNorm,
          }),
          ...(mainInsured && {
            insuredClientId: id,
            insuredName: name,
            insuredNameNorm: set.nameNorm,
          }),
        };
        // PRD-3: a product line that named this insured person only by name is now theirs
        const products = (policy?.products ?? []).map((line) =>
          dto.role === 'LI' &&
          !line.insuredClientId &&
          line.insuredName &&
          normalizeName(line.insuredName) === set.nameNorm
            ? { ...line, insuredClientId: id }
            : line,
        );
        if (policy)
          await db.getRepository(Policy).update(
            { id: policy.id },
            {
              ...fields,
              clients: [...policy.clients, link],
              products,
              updatedAt: now,
            },
          );
        else
          await this.insertPolicy(
            scope,
            actor,
            dto.policyNo,
            { fields, clients: [link], products: [], agentCode },
            now,
            db,
          );
        await this.reader.recomputeLinks(scope, [id, ...people.keys()], now, db);
        // MAN-7, PDP-9: the phone is masked in the audit log
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: actor.id,
            action: AuditAction.Create,
            entity: 'client',
            entityId: id,
            meta: {
              agentCode,
              policyNo: dto.policyNo,
              role: dto.role,
              ...(set.phone ? { phone: maskPhone(set.phone as string) } : {}),
            },
          },
          db,
        );
      });
    } catch (error) {
      // Two people starting the same new number at once: the second one is told it exists
      if (pgError(error)?.constraint === 'policies_no_key')
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.PolicyExists, {
          issues: [{ path: 'policyNo', message: ErrorCode.PolicyExists }],
        });
      throw error;
    }
    return { id };
  }

  /** MAN-6 + MAN-7: absent keeps a field, null clears it; the code and the agent never change here. */
  async update(
    actor: Actor,
    clientId: string,
    dto: ClientFieldsDto,
  ): Promise<void> {
    const scope = this.scopeOf(actor);
    const now = new Date();
    await this.tenantDb.run(scope, async (db) => {
      const client = await this.ownedClient(actor, clientId, db);
      const { set, unset } = this.clientValues(dto, client);
      const record = client as unknown as Fields;
      const changes = [...Object.keys(set), ...unset]
        .filter((field) => text(record[field]) !== text(set[field]))
        .filter((field) => !['nameNorm', 'birthMonth'].includes(field))
        .map((field) => ({
          entity: 'client',
          entityKey: client.id,
          field,
          // PDP-9: never a phone number in clear in the history either
          oldValue:
            field === 'phone' && record.phone
              ? maskPhone(record.phone as string)
              : text(record[field]),
          newValue:
            field === 'phone' && set.phone
              ? maskPhone(set.phone as string)
              : text(set[field]),
        }));
      if (changes.length === 0) return;
      await db.getRepository(Client).update(
        { id: client.id },
        {
          ...set,
          ...Object.fromEntries(unset.map((field) => [field, null])),
          updatedAt: now,
        },
      );
      // MAN-6: a new name reaches the policies the client holds or is the main insured of
      if (set.name) {
        await db.getRepository(Policy).update(
          { tenantId: scope.tenantId, holderClientId: client.id },
          {
            holderName: set.name as string,
            holderNameNorm: set.nameNorm as string,
          },
        );
        await db.getRepository(Policy).update(
          { tenantId: scope.tenantId, insuredClientId: client.id },
          {
            insuredName: set.name as string,
            insuredNameNorm: set.nameNorm as string,
          },
        );
      }
      await this.recordChanges(scope, actor, changes, now, db);
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'client',
          entityId: client.id,
          meta: { fields: changes.map((change) => change.field) },
        },
        db,
      );
    });
  }

  /** POL-1 to POL-3, POL-6 */
  async addPolicy(
    actor: Actor,
    clientId: string,
    dto: CreatePolicyDto,
  ): Promise<{ policyNo: string }> {
    const scope = this.scopeOf(actor);
    const now = new Date();
    try {
      await this.tenantDb.run(scope, async (db) => {
        const client = await this.ownedClient(actor, clientId, db);
        await this.assertNewPolicy(scope, dto.policyNo, 'policyNo', db);
        const fallback =
          client.agentLinks.find((link) => link.source === 'MANUAL')
            ?.agentCode ?? client.ownerAgentCodes[0];
        const agentCode = await this.resolveAgent(
          actor,
          dto.agentCode,
          fallback,
          db,
        );
        const built = await this.buildPolicy(actor, client, dto, agentCode, db);
        await this.insertPolicy(scope, actor, dto.policyNo, built, now, db);
        await this.reader.recomputeLinks(
          scope,
          [client.id, ...(built.fields.insuredClientId ? [built.fields.insuredClientId] : [])],
          now,
          db,
        );
      });
    } catch (error) {
      if (pgError(error)?.constraint === 'policies_no_key')
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.PolicyExists);
      throw error;
    }
    return { policyNo: dto.policyNo };
  }

  /**
   * POL-4: the policy fields change and, when sent, the programme lines are replaced as a whole.
   * The policy number and the serving agent never change here (Success decides the agent).
   */
  async updatePolicy(
    actor: Actor,
    clientId: string,
    policyNo: string,
    dto: PolicyFieldsDto,
  ): Promise<void> {
    const scope = this.scopeOf(actor);
    const now = new Date();
    await this.tenantDb.run(scope, async (db) => {
      await this.ownedClient(actor, clientId, db);
      // POL-4: only a policy of the client on screen
      const policy = await this.reader
        .policies(
          db,
          scope,
          and(sql`p.policy_no = ${policyNo}`, policiesNaming([clientId])),
        )
        .setLock('pessimistic_write')
        .getOne();
      if (!policy) throw notFound();
      const keepProducts = dto.products === undefined;
      // The holder stays who they are; the client on screen may be the insured or a beneficiary
      const built = await this.buildPolicy(
        actor,
        policy.holderClientId
          ? { id: policy.holderClientId, name: policy.holderName ?? '' }
          : null,
        { ...dto, products: dto.products ?? [] },
        policy.servicingAgentCode ?? policy.currentAgentCodes[0],
        db,
        policy.insuredName
          ? { id: policy.insuredClientId, name: policy.insuredName }
          : null,
      );
      // POL-4: the PO and LI links are written again, in case the insured person changed; an
      // insured known only by name ends the old insured's link
      const clients = policy.clients.map((link) => ({ ...link }));
      for (const role of ['PO', 'LI'] as const) {
        const wanted = built.clients.find((link) => link.role === role);
        if (role === 'PO' && !wanted) continue;
        for (const link of clients)
          if (
            link.role === role &&
            link.source === 'POLICY' &&
            !link.endedAt &&
            link.clientId !== wanted?.clientId
          )
            link.endedAt = now;
        if (!wanted) continue;
        const same = clients.find(
          (link) =>
            link.clientId === wanted.clientId &&
            link.role === role &&
            link.source === 'POLICY',
        );
        if (same) delete same.endedAt;
        else clients.push(wanted);
      }
      const next: Fields = { ...built.fields, clients };
      if (!keepProducts) next.products = built.products;
      const record = policy as unknown as Fields;
      const changes: Change[] = Object.keys(built.fields)
        .filter(
          (field) =>
            !field.endsWith('Norm') &&
            text(record[field]) !==
              text(built.fields[field as keyof typeof built.fields]),
        )
        .map((field) => ({
          entity: 'policy',
          entityKey: policyNo,
          field,
          oldValue: text(record[field]),
          newValue: text(built.fields[field as keyof typeof built.fields]),
        }));
      if (
        !keepProducts &&
        productsText(policy.products) !== productsText(built.products)
      )
        changes.push({
          entity: 'policy',
          entityKey: policyNo,
          field: 'products',
          oldValue: productsText(policy.products),
          newValue: productsText(built.products),
        });
      await db
        .getRepository(Policy)
        .update({ id: policy.id }, { ...next, updatedAt: now });
      const touched = new Set(policy.clients.map((link) => link.clientId));
      if (built.fields.insuredClientId) touched.add(built.fields.insuredClientId);
      await this.reader.recomputeLinks(scope, [...touched], now, db);
      await this.recordChanges(scope, actor, changes, now, db);
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'policy',
          entityId: policyNo,
          meta: { clientId, fields: changes.map((change) => change.field) },
        },
        db,
      );
    });
  }

  /**
   * POL-7 (open question 12b, decided 14/11/2026): a policy entered by hand by mistake is deleted,
   * by whoever may edit the client, while it is at most 7 days old and no Success import has written
   * it. The audit keeps what it was; the client's links are worked out again without it.
   */
  async deletePolicy(actor: Actor, clientId: string, policyNo: string): Promise<void> {
    const scope = this.scopeOf(actor);
    const now = new Date();
    await this.tenantDb.run(scope, async (db) => {
      await this.ownedClient(actor, clientId, db);
      const policy = await this.reader
        .policies(db, scope, and(sql`p.policy_no = ${policyNo}`, policiesNaming([clientId])))
        .setLock('pessimistic_write')
        .getOne();
      if (!policy) throw notFound();
      if (!policyDeletable(policy, now))
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.PolicyNotDeletable);
      await db.getRepository(Policy).delete({ id: policy.id, tenantId: scope.tenantId });
      await this.reader.recomputeLinks(
        scope,
        [...new Set(policy.clients.map((link) => link.clientId))],
        now,
        db,
      );
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Delete,
          entity: 'policy',
          entityId: policyNo,
          meta: {
            clientId,
            agentCode: policy.servicingAgentCode,
            createdAt: policy.createdAt.toISOString(),
            products: policy.products.length,
          },
        },
        db,
      );
    });
  }

  /**
   * ASG-1 to ASG-4 + ASG-7: "Phân công khách hàng". Only the MANUAL link changes (at most one per
   * client); links from policies stay, so the servicing agent of a policy never moves (ASG-3).
   */
  async assign(
    actor: Actor,
    dto: AssignClientsDto,
  ): Promise<{ assigned: number }> {
    // ASG-1: GA_HEAD, or someone granted clients.assign; agents never assign, even their own
    if (
      !actor.roles.includes(Role.GaHead) &&
      !actor.permissions.includes(Permission.ClientsAssign)
    )
      throw forbidden();
    const scope = this.scopeOf(actor);
    const ids = [...new Set(dto.clientIds)];
    return this.tenantDb.run(scope, async (db) => {
      // ASG-7: Marketing and Admin have no client book, so reach() refuses them
      const reach = await this.reader.reach(actor, db);
      const clients = await this.reader
        .clients(
          db,
          scope,
          and(sql`c.id = ANY(${ids}::uuid[])`, clientsSeen(reach)),
        )
        .setLock('pessimistic_write')
        .getMany();
      // ASG-4: every client must be of the GA (and in the person's scope)
      if (clients.length !== ids.length) throw notFound();
      const agentCode = dto.agentCode;
      if (agentCode) {
        const known = await this.agents.namesByCode(scope, [agentCode], db);
        if (
          !known.has(agentCode) ||
          (!reach.all && !reach.codes.includes(agentCode))
        )
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            ErrorCode.AgentNotFound,
          );
      }
      const now = new Date();
      const changes: Change[] = [];
      for (const client of clients) {
        const before = client.agentLinks.find(
          (link) => link.source === 'MANUAL',
        )?.agentCode;
        if (before === (agentCode ?? undefined)) continue;
        // ASG-2: a new assignment replaces the old one
        const agentLinks = [
          ...client.agentLinks.filter((link) => link.source !== 'MANUAL'),
          ...(agentCode
            ? [{ agentCode, source: 'MANUAL' as const, createdAt: now }]
            : []),
        ];
        await db
          .getRepository(Client)
          .update({ id: client.id }, { agentLinks, updatedAt: now });
        changes.push({
          entity: 'client',
          entityKey: client.id,
          field: 'manualAgent',
          oldValue: before,
          newValue: agentCode ?? undefined,
        });
      }
      await this.reader.recomputeLinks(scope, ids, now, db);
      await this.recordChanges(scope, actor, changes, now, db);
      // ASG-6: one entry for the batch, with the agent and the number of clients
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Assign,
          entity: 'client',
          entityId: agentCode ?? undefined,
          meta: {
            agentCode,
            count: ids.length,
            changed: changes.length,
            clientIds: ids,
          },
        },
        db,
      );
      // NTF-2: the agent hears about the clients newly given to them
      if (agentCode && changes.length > 0)
        await this.notifications.notifyAgent(
          scope,
          agentCode,
          changes.length === 1
            ? {
                type: 'CLIENT_ASSIGNED',
                data: { count: 1, clientId: changes[0].entityKey },
                link: `/clients/${changes[0].entityKey}`,
              }
            : {
                type: 'CLIENT_ASSIGNED',
                data: { count: changes.length },
                link: '/clients',
              },
          { except: actor.id, db },
        );
      return { assigned: ids.length };
    });
  }
}
