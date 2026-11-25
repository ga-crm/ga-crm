import { HttpStatus, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  ApiException,
  ErrorCode,
  forbidden,
  notFound,
} from '../../common/errors.js';
import { normalizeName } from '../../common/normalize.js';
import { isId } from '../../common/pagination.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { and, or, sql } from '../../core/persistence/fragment.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Comment, Interaction } from '../leads/infrastructure/lead.entities.js';
import type {
  AddActivityDto,
  AddCommentDto,
  AddNoteDto,
} from '../leads/leads.dto.js';
import { LeadsService } from '../leads/leads.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import {
  coverage,
  insuredOf,
  inverseRelation,
  personKey,
  signals,
  titleCase,
} from './client-insights.js';
import type { InsightPolicy, Relation } from './client-insights.js';
import { ClientEditorService } from './client-editor.service.js';
import type {
  FamilyInputDto,
  FamilyLeadDto,
  FamilyUpdateDto,
} from './clients.dto.js';
import {
  clientsSeen,
  ClientsService,
  policiesNaming,
  todayInVietnam,
} from './clients.service.js';
import type { Reach } from './clients.service.js';
import {
  FamilyLink,
  Policy,
  RecordChange,
} from './infrastructure/client.entities.js';
import { LeadLinkService } from './lead-link.service.js';
import { ProductsService } from '../products/products.service.js';

const onPolicy = (policy: InsightPolicy, code: string) =>
  policy.clients.some((link) => link.clientId === code && !link.endedAt);

/** FAM-7: one row of the family tab. */
export interface FamilyEntry {
  key: string;
  /** The stored relation when someone recorded one; null for a person only found on a policy. */
  linkId: string | null;
  relation: Relation | null;
  name: string;
  /** The person's client id, when they are a client. */
  clientId: string | null;
  /** Whether this person has a client record in the GA. */
  isClient: boolean;
  /** FAM-5: only a client in the person's scope has a page they can open. */
  canOpen: boolean;
  gender: string | null;
  dob: string | null;
  /** FAM-4: a relative who is not a client, with each part of the birth date optional. */
  birth: {
    day: number | null;
    month: number | null;
    year: number | null;
  } | null;
  note: string | null;
  leadId: string | null;
  /** FAM-7: the policies shared with the client, with this person's roles on them. */
  sharedPolicies: { policyNo: string; roles: string[] }[];
}

/** Sections 10.9-10.11 and NOTE-5: family, coverage, care opportunities and notes of a client. */
@Injectable()
export class ClientCareService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly reader: ClientsService,
    private readonly editor: ClientEditorService,
    private readonly leads: LeadsService,
    private readonly leadLinks: LeadLinkService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly products: ProductsService,
  ) {}

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  /** CUS-8: the policies this person sees among those naming any of these clients. */
  private visiblePolicies(
    db: EntityManager,
    scope: Scope,
    reach: Reach,
    clientIds: readonly string[],
  ): Promise<Policy[]> {
    return this.reader.visiblePolicies(
      db,
      scope,
      reach,
      policiesNaming(clientIds),
    );
  }

  /** FAM-1 + COV-5 + section 10.11 + NOTE-1: what the client page shows beyond the record. */
  async insights(actor: Actor, clientId: string) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const reach = await this.reader.reach(actor, db);
      const client = await this.reader
        .clients(
          db,
          scope,
          and(sql`c.id = ${clientId}`, clientsSeen(reach)),
        )
        .getOne();
      if (!client) throw notFound();

      const links = await db
        .getRepository(FamilyLink)
        .createQueryBuilder('link')
        .where('link.tenantId = :tenantId', { tenantId: scope.tenantId })
        .andWhere(
          '(link.clientId = :id OR link.relatedClientId = :id)',
          { id: clientId },
        )
        .orderBy('link.createdAt', 'ASC')
        .addOrderBy('link.id', 'ASC')
        .getMany();
      const linkedIds = links.flatMap((link) =>
        link.clientId === clientId
          ? (link.relatedClientId ?? [])
          : link.clientId,
      );
      const policies = await this.visiblePolicies(db, scope, reach, [
        clientId,
        ...linkedIds,
      ]);
      const mine = policies.filter((policy) => onPolicy(policy, clientId));

      // FAM-1 (a): the people on the client's policies, named as the policy writes them (FAM-5)
      const fromPolicy = new Map<string, string>();
      for (const policy of mine) {
        for (const link of policy.clients) {
          if (link.endedAt || link.clientId === clientId) continue;
          const name =
            link.role === 'PO'
              ? policy.holderName
              : link.role === 'LI'
                ? policy.insuredName
                : '';
          if (!fromPolicy.get(link.clientId))
            fromPolicy.set(link.clientId, titleCase(name ?? ''));
        }
        for (const product of policy.products) {
          const person = insuredOf(policy, product);
          if (person.key !== clientId && !fromPolicy.get(person.key))
            fromPolicy.set(person.key, titleCase(person.name));
        }
      }

      // Which people are clients, and which of them this person may open
      const ids = [
        ...new Set([
          ...linkedIds,
          ...[...fromPolicy.keys()].filter((key) => !key.startsWith('name:')),
        ]),
      ];
      const records = await this.reader
        .clients(db, scope, sql`c.id = ANY(${ids}::uuid[])`)
        .getMany();
      const visible = await this.reader
        .clients(
          db,
          scope,
          and(sql`c.id = ANY(${ids}::uuid[])`, clientsSeen(reach)),
        )
        .select(['c.id'])
        .getMany();
      const recordOf = new Map(records.map((record) => [record.id, record]));
      const canOpen = new Set(visible.map((record) => record.id));

      // FAM-1 (b) and (c): the relations recorded, seen from this client's side (FAM-2)
      const entries = new Map<string, FamilyEntry>();
      const blank = {
        isClient: false,
        canOpen: false,
        gender: null,
        dob: null,
        birth: null,
        note: null,
        leadId: null,
      };
      for (const link of links) {
        const ownSide = link.clientId === clientId;
        const code = ownSide ? link.relatedClientId : link.clientId;
        // FAM-3: a related client out of this person's scope and off the shared policies stays hidden
        if (code && !canOpen.has(code) && !fromPolicy.has(code)) continue;
        const key = code ?? personKey(null, link.fullName ?? undefined);
        if (entries.has(key)) continue;
        entries.set(key, {
          ...blank,
          key,
          linkId: link.id,
          relation: ownSide ? link.relation : inverseRelation(link.relation),
          name: link.fullName ?? '',
          clientId: code,
          gender: link.gender,
          birth: code
            ? null
            : {
                day: link.birthDay,
                month: link.birthMonth,
                year: link.birthYear,
              },
          note: link.note,
          leadId: link.leadId,
          sharedPolicies: [],
        });
      }
      for (const [key, name] of fromPolicy) {
        if (entries.has(key)) continue;
        entries.set(key, {
          ...blank,
          key,
          linkId: null,
          relation: null,
          name,
          clientId: key.startsWith('name:') ? null : key,
          sharedPolicies: [],
        });
      }

      for (const entry of entries.values()) {
        const record = entry.clientId ? recordOf.get(entry.clientId) : undefined;
        if (record) {
          entry.isClient = true;
          entry.canOpen = canOpen.has(record.id);
          entry.name = record.name;
          // Personal details only for a client the person may open
          if (entry.canOpen) {
            entry.gender = record.gender;
            entry.dob = record.dob;
          }
        }
        if (!entry.name) entry.name = fromPolicy.get(entry.key) || '';
        for (const policy of mine) {
          const roles = new Set<string>();
          if (entry.clientId)
            for (const link of policy.clients)
              if (link.clientId === entry.clientId && !link.endedAt)
                roles.add(link.role);
          if (
            policy.products.some(
              (product) => insuredOf(policy, product).key === entry.key,
            )
          )
            roles.add('LI');
          if (roles.size > 0)
            entry.sharedPolicies.push({
              policyNo: policy.policyNo,
              roles: [...roles],
            });
        }
      }

      const family = [...entries.values()];
      // COV-3: the catalogue's category decides the group when the product is in it (TENANT-5)
      const catalogue = await this.products.byCode(
        db,
        policies.flatMap((policy) =>
          policy.products.map((product) => product.productCode),
        ),
      );
      const rows = coverage(
        policies.map((policy) => ({
          ...policy,
          products: policy.products.map((product) => ({
            ...product,
            category: catalogue.get(product.productCode)?.category,
          })),
        })),
        [
        { key: clientId, name: client.name, clientId },
        ...family.map((entry) => ({
          key: entry.key,
          name: entry.name,
          clientId: entry.clientId,
        })),
      ]);
      const owned = { tenantId: scope.tenantId, clientId };
      const notes = await db.getRepository(Interaction).find({
        where: owned,
        order: { occurredAt: 'DESC', id: 'DESC' },
      });
      // CMT-5: comments on the client, oldest first like on a lead (CMT-1)
      const comments = await db.getRepository(Comment).find({
        where: owned,
        order: { createdAt: 'ASC', id: 'ASC' },
      });
      const history = await this.history(db, scope, clientId, mine);
      const userIds = [
        ...notes.flatMap((note) => note.createdBy ?? []),
        ...history.map((item) => item.changedBy),
        ...comments.flatMap((item) => [
          item.authorUserId,
          ...(item.mentions ?? []),
        ]),
      ];
      const files = await rowsOf<{ id: string; file_name: string }>(
        db,
        `SELECT id, file_name FROM imports WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [
          scope.tenantId,
          [...new Set(history.flatMap((item) => item.importId ?? []))],
        ],
      );
      const fileOf = new Map(files.map((file) => [file.id, file.file_name]));
      const users = await rowsOf<{ id: string; name: string }>(
        db,
        `SELECT id, name FROM users WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
        [scope.tenantId, [...new Set(userIds)]],
      );

      return {
        // LEAD-34
        linkedLead: await this.leadLinks.linkedLead(actor, clientId, db),
        family,
        coverage: rows,
        signals: signals({
          client,
          policies: mine,
          coverage: rows,
          family,
          today: todayInVietnam(),
        }),
        // NOTE-1: notes and contacts in one timeline, newest first
        notes: notes.map((note) => ({
          id: note.id,
          type: note.type,
          note: note.note,
          outcome: note.outcome,
          occurredAt: note.occurredAt,
          createdBy: note.createdBy,
        })),
        comments: comments.map((item) => ({
          id: item.id,
          body: item.body,
          authorUserId: item.authorUserId,
          mentions: item.mentions ?? [],
          createdAt: item.createdAt,
        })),
        // CUS-15 "Lịch sử"
        history: history.map((item) => ({
          id: item.id,
          entity: item.entity,
          entityKey: item.entityKey,
          field: item.field,
          oldValue: item.oldValue,
          newValue: item.newValue,
          importId: item.importId,
          fileName: item.importId ? (fileOf.get(item.importId) ?? null) : null,
          changedBy: item.changedBy,
          changedAt: item.changedAt,
        })),
        userNames: Object.fromEntries(
          users.map((user) => [user.id, user.name]),
        ),
      };
    });
  }

  /**
   * CUS-15 "Lịch sử": field changes of the client and of the policies this person sees (CUS-8),
   * from files (IMP-21) and by hand (section 18.5), newest first, at most 200.
   */
  private history(
    db: EntityManager,
    scope: Scope,
    clientId: string,
    policies: readonly { policyNo: string }[],
  ): Promise<RecordChange[]> {
    const policyNos = policies.map((policy) => policy.policyNo);
    return db
      .getRepository(RecordChange)
      .createQueryBuilder('change')
      .where('change.tenantId = :tenantId', { tenantId: scope.tenantId })
      .andWhere(
        `((change.entity = 'client' AND change.entityKey = :clientId)
          OR (change.entity = 'policy' AND change.entityKey = ANY(:policyNos))
          OR (change.entity = 'policy_product' AND split_part(change.entity_key, '/', 1) = ANY(:policyNos)))`,
        // IMP-21: a product line is keyed "policyNo/productCode/insuredClientId"
        { clientId, policyNos },
      )
      .orderBy('change.changedAt', 'DESC')
      .addOrderBy('change.id', 'DESC')
      .limit(200)
      .getMany();
  }

  // ---- Family (FAM-2 to FAM-8) ----------------------------------------------------------

  /** FAM-3: a client in scope, or someone on one of this client's policies the person sees. */
  private async assertRelatable(
    actor: Actor,
    clientId: string,
    related: string,
    db: EntityManager,
  ) {
    if (related === clientId)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.SameClient);
    const scope = this.scopeOf(actor);
    const reach = await this.reader.reach(actor, db);
    const visible = await this.reader
      .clients(
        db,
        scope,
        and(sql`c.id = ${related}`, clientsSeen(reach)),
      )
      .getCount();
    if (visible) return;
    const shared = (
      await this.visiblePolicies(db, scope, reach, [clientId])
    ).some(
      (policy) =>
        onPolicy(policy, clientId) &&
        (onPolicy(policy, related) ||
          policy.products.some(
            (product) => product.insuredClientId === related,
          )),
    );
    if (!shared) throw notFound();
  }

  /**
   * FAM-4: a relative entered by name who is in fact a client is refused. A name alone is common,
   * so it takes a client on this client's policies with that name, or a client in scope with that
   * name and the full birth date given.
   */
  private async assertNotClient(
    actor: Actor,
    clientId: string,
    dto: FamilyInputDto,
    db: EntityManager,
  ) {
    const scope = this.scopeOf(actor);
    const reach = await this.reader.reach(actor, db);
    const policies = await this.visiblePolicies(db, scope, reach, [clientId]);
    const onPolicies = new Set(
      policies.flatMap((policy) => [
        ...policy.clients.map((link) => link.clientId),
        ...policy.products.flatMap((product) => product.insuredClientId ?? []),
      ]),
    );
    onPolicies.delete(clientId);
    const pad = (value: number) => String(value).padStart(2, '0');
    const dob =
      dto.birthYear && dto.birthMonth && dto.birthDay
        ? `${dto.birthYear}-${pad(dto.birthMonth)}-${pad(dto.birthDay)}`
        : null;
    const match = await this.reader
      .clients(
        db,
        scope,
        and(
          sql`c.name_norm = ${normalizeName(dto.fullName!)}`,
          sql`c.id <> ${clientId}`,
          or(
            sql`c.id = ANY(${[...onPolicies]}::uuid[])`,
            dob && and(sql`c.dob = ${dob}`, clientsSeen(reach)),
          ),
        ),
      )
      .getCount();
    if (match)
      throw new ApiException(HttpStatus.CONFLICT, ErrorCode.AlreadyClient);
  }

  /** FAM-2 to FAM-4 + FAM-8 */
  async addFamily(
    actor: Actor,
    clientId: string,
    dto: FamilyInputDto,
  ): Promise<{ id: string }> {
    const scope = this.scopeOf(actor);
    // A relation names a client or a relative, never both
    if (!dto.relatedClientId === !dto.fullName)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput);
    return this.tenantDb.run(scope, async (db) => {
      await this.editor.ownedClient(actor, clientId, db);
      if (dto.relatedClientId)
        await this.assertRelatable(actor, clientId, dto.relatedClientId, db);
      else await this.assertNotClient(actor, clientId, dto, db);

      const links = db.getRepository(FamilyLink);
      const existing = dto.relatedClientId
        ? await links
            .createQueryBuilder('link')
            .where('link.tenantId = :tenantId', { tenantId: scope.tenantId })
            .andWhere(
              `((link.clientId = :a AND link.relatedClientId = :b)
                OR (link.clientId = :b AND link.relatedClientId = :a))`,
              { a: clientId, b: dto.relatedClientId },
            )
            .setLock('pessimistic_write')
            .getOne()
        : null;
      let id: string;
      if (existing) {
        // FAM-2: one record per pair; recorded from the other side, the relation is stored inverted
        await links.update(
          { id: existing.id },
          {
            relation:
              existing.clientId === clientId
                ? dto.relation
                : inverseRelation(dto.relation),
            ...(dto.note !== undefined && { note: dto.note || null }),
          },
        );
        id = existing.id;
      } else {
        const created = await links.save(
          links.create({
            tenantId: scope.tenantId,
            clientId,
            relation: dto.relation,
            ...(dto.relatedClientId
              ? { relatedClientId: dto.relatedClientId }
              : {
                  fullName: dto.fullName,
                  gender: dto.gender ?? null,
                  birthDay: dto.birthDay ?? null,
                  birthMonth: dto.birthMonth ?? null,
                  birthYear: dto.birthYear ?? null,
                }),
            note: dto.note || null,
            createdBy: actor.id,
          }),
        );
        id = created.id;
      }
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: existing ? AuditAction.Update : AuditAction.Create,
          entity: 'family_link',
          entityId: id,
          meta: {
            clientId,
            relation: dto.relation,
            ...(dto.relatedClientId && {
              relatedClientId: dto.relatedClientId,
            }),
          },
        },
        db,
      );
      return { id };
    });
  }

  /** A relation the client is on either side of, or 404. */
  private async linkOf(
    scope: Scope,
    clientId: string,
    id: string,
    db: EntityManager,
  ): Promise<FamilyLink> {
    if (!isId(id)) throw notFound();
    const link = await db
      .getRepository(FamilyLink)
      .createQueryBuilder('link')
      .where('link.tenantId = :tenantId AND link.id = :id', {
        tenantId: scope.tenantId,
        id,
      })
      // Its own parameter name: TypeORM would let `:id` overwrite the link's id above
      .andWhere(
        '(link.clientId = :clientId OR link.relatedClientId = :clientId)',
        { clientId },
      )
      .getOne();
    if (!link) throw notFound();
    return link;
  }

  /** FAM-2 + FAM-4 + FAM-8 */
  async updateFamily(
    actor: Actor,
    clientId: string,
    id: string,
    dto: FamilyUpdateDto,
  ): Promise<void> {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      await this.editor.ownedClient(actor, clientId, db);
      const link = await this.linkOf(scope, clientId, id, db);
      const patch: Partial<FamilyLink> = {};
      if (dto.relation)
        patch.relation =
          link.clientId === clientId
            ? dto.relation
            : inverseRelation(dto.relation);
      if (dto.note !== undefined) patch.note = dto.note || null;
      // FAM-4: the personal fields belong to a relative who is not a client
      if (!link.relatedClientId) {
        if (dto.fullName) patch.fullName = dto.fullName;
        for (const field of [
          'gender',
          'birthDay',
          'birthMonth',
          'birthYear',
        ] as const)
          if (dto[field] !== undefined)
            Object.assign(patch, { [field]: dto[field] ?? null });
      }
      if (Object.keys(patch).length > 0)
        await db.getRepository(FamilyLink).update({ id: link.id }, patch);
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'family_link',
          entityId: id,
          meta: { clientId },
        },
        db,
      );
    });
  }

  /** FAM-8 */
  async removeFamily(
    actor: Actor,
    clientId: string,
    id: string,
  ): Promise<void> {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      await this.editor.ownedClient(actor, clientId, db);
      const link = await this.linkOf(scope, clientId, id, db);
      await db
        .getRepository(FamilyLink)
        .delete({ id: link.id, tenantId: scope.tenantId });
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Delete,
          entity: 'family_link',
          entityId: id,
          meta: { clientId },
        },
        db,
      );
    });
  }

  /**
   * FAM-6: a relative who is not a client becomes a lead (or is linked to a lead the person already
   * sees). The lead is made like any other, so LEAD-2 decides whose it is; a manager's goes to the
   * client's agent.
   */
  async familyLead(
    actor: Actor,
    clientId: string,
    id: string,
    dto: FamilyLeadDto,
  ): Promise<{ leadId: string }> {
    const scope = this.scopeOf(actor);
    const client = await this.editor.ownedClient(actor, clientId);
    const link = await this.tenantDb.run(scope, (db) =>
      this.linkOf(scope, clientId, id, db),
    );
    if (link.relatedClientId || !link.fullName || !dto.leadId === !dto.create)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput);
    let leadId = dto.leadId;
    if (leadId) await this.leads.assertVisible(actor, leadId);
    else
      leadId = (
        await this.leads.create(
          actor,
          {
            fullName: link.fullName,
            phone: dto.create!.phone,
            source: 'Giới thiệu',
            consent: dto.create!.consent,
            note: `Người thân của khách hàng ${client.name}`,
          },
          { ownerAgentCode: client.ownerAgentCodes[0] },
        )
      ).id;
    await this.tenantDb.run(scope, async (db) => {
      await db
        .getRepository(FamilyLink)
        .update({ id: link.id, tenantId: scope.tenantId }, { leadId });
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'family_link',
          entityId: id,
          meta: { clientId, leadId },
        },
        db,
      );
    });
    return { leadId };
  }

  // ---- Notes and contacts on a client (NOTE-1, NOTE-2, NOTE-5) --------------------------

  private async addInteraction(
    actor: Actor,
    clientId: string,
    entry: { type: string; note: string; outcome?: string; occurredAt?: Date },
  ): Promise<{ id: string }> {
    const scope = this.scopeOf(actor);
    const now = new Date();
    const occurredAt = entry.occurredAt ?? now;
    // NOTE-2: a contact may be recorded late, never ahead of time
    if (occurredAt.getTime() > now.getTime() + 60_000)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput);
    return this.tenantDb.run(scope, async (db) => {
      const client = await this.editor.ownedClient(actor, clientId, db); // NOTE-5
      const interactions = db.getRepository(Interaction);
      const created = await interactions.save(
        interactions.create({
          tenantId: scope.tenantId,
          clientId,
          agentCode: actor.agentCode ?? client.ownerAgentCodes[0] ?? null,
          type: entry.type,
          note: entry.note,
          outcome: entry.outcome ?? null,
          occurredAt,
          source: 'APP',
          createdBy: actor.id,
          createdAt: now,
        }),
      );
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Create,
          entity: 'client_note',
          entityId: created.id,
          meta: { clientId, type: entry.type },
        },
        db,
      );
      return { id: created.id };
    });
  }

  // ---- Comments on a client (CMT-5) ---------------------------------------------------------

  /** The client, if this person sees it: 403 for roles without a client book, else 404. */
  private async visibleClient(
    actor: Actor,
    clientId: string,
    db: EntityManager,
  ) {
    const scope = this.scopeOf(actor);
    const reach = await this.reader.reach(actor, db);
    const client = await this.reader
      .clients(
        db,
        scope,
        and(sql`c.id = ${clientId}`, clientsSeen(reach)),
      )
      .select(['c.id', 'c.ownerAgentCodes'])
      .getOne();
    if (!client) throw notFound();
    return { scope, client };
  }

  /** CMT-5: up to 8 people who see the client, for the @ picker. */
  async mentionable(actor: Actor, clientId: string, q?: string) {
    return this.tenantDb.run(this.scopeOf(actor), async (db) => {
      const { scope } = await this.visibleClient(actor, clientId, db);
      const people = await this.notifications.activeActors(
        scope,
        { q, except: actor.id, limit: 50 },
        db,
      );
      const items: { id: string; name: string; agentCode: string | null }[] =
        [];
      for (const person of people) {
        if (items.length === 8) break;
        if (await this.reader.visibleTo(person, clientId, db))
          items.push({
            id: person.id,
            name: person.name,
            agentCode: person.agentCode ?? null,
          });
      }
      return { items };
    });
  }

  /**
   * CMT-5: whoever sees the client may comment (a manager coaching their line, the owner replying).
   * The owners hear about it, the people mentioned hear it first-hand.
   */
  async addComment(actor: Actor, clientId: string, dto: AddCommentDto) {
    return this.tenantDb.run(this.scopeOf(actor), async (db) => {
      const { scope, client } = await this.visibleClient(actor, clientId, db);
      const mentions = [...new Set(dto.mentions ?? [])].filter(
        (id) => id !== actor.id,
      );
      if (mentions.length > 0) {
        const people = await this.notifications.activeActors(
          scope,
          { ids: mentions },
          db,
        );
        // One at a time: the transaction's connection runs one query at a time
        const visible: boolean[] = [];
        for (const person of people)
          visible.push(await this.reader.visibleTo(person, clientId, db));
        if (people.length !== mentions.length || visible.includes(false))
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            ErrorCode.MentionNotVisible,
          );
      }
      const owners = await this.notifications.usersByAgent(
        scope,
        client.ownerAgentCodes ?? [],
        db,
      );
      const comments = db.getRepository(Comment);
      const comment = await comments.save(
        comments.create({
          tenantId: scope.tenantId,
          clientId,
          authorUserId: actor.id,
          body: dto.body,
          mentions: mentions.length > 0 ? mentions : null,
          createdAt: new Date(),
        }),
      );
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Create,
          entity: 'client_comment',
          entityId: comment.id,
          meta: { clientId, mentions: mentions.length },
        },
        db,
      );
      const link = `/clients/${clientId}`;
      if (mentions.length > 0)
        await this.notifications.notify(
          scope,
          mentions,
          { type: 'MENTION', data: { clientId }, link },
          db,
        );
      const skip = new Set([actor.id, ...mentions]);
      const told = [...owners.values()].filter((user) => !skip.has(user));
      if (told.length > 0)
        await this.notifications.notify(
          scope,
          told,
          { type: 'CLIENT_COMMENT', data: { clientId }, link },
          db,
        );
      return { id: comment.id };
    });
  }

  addNote(actor: Actor, clientId: string, dto: AddNoteDto) {
    return this.addInteraction(actor, clientId, {
      type: 'NOTE',
      note: dto.body,
    });
  }

  addActivity(actor: Actor, clientId: string, dto: AddActivityDto) {
    return this.addInteraction(actor, clientId, dto);
  }
}
