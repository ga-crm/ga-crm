import { HttpStatus, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  ApiException,
  ErrorCode,
  forbidden,
  notFound,
} from '../../common/errors.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { and, sql } from '../../core/persistence/fragment.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { ClientEditorService } from './client-editor.service.js';
import type {
  CareRecordDto,
  ReferralDto,
  UpdateCareRecordDto,
  UpdateReferralDto,
} from './client-records.dto.js';
import {
  careRecordIssues,
  referralIssues,
  summarizeReferrals,
  summarizeSigning,
} from './client-records.rules.js';
import type { Issue } from './client-records.rules.js';
import {
  ClientsService,
  clientsSeen,
  policiesNaming,
} from './clients.service.js';
import {
  ClientCareRecord,
  ClientReferral,
} from './infrastructure/client.entities.js';

const invalid = (issues: Issue[]) =>
  new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput, { issues });

/**
 * Decided 26/11/2026: the care a GA records for a client by hand: claims (when and where),
 * seminars and health checks attended, gifts and visits, what the client received on signing, and
 * the people the client referred. Whoever sees the client reads it (CUS-5); whoever may edit the
 * client writes it (CUS-6), each change audited in its transaction.
 */
@Injectable()
export class ClientRecordsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly reader: ClientsService,
    private readonly editor: ClientEditorService,
    private readonly audit: AuditService,
  ) {}

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  /** The client's care records and referrals, newest first, with their totals. */
  async forClient(actor: Actor, clientId: string) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const reach = await this.reader.reach(actor, db);
      const client = await this.reader
        .clients(db, scope, and(sql`c.id = ${clientId}`, clientsSeen(reach)))
        .getOne();
      if (!client) throw notFound();
      const where = { tenantId: scope.tenantId, clientId };
      const records = await db.getRepository(ClientCareRecord).find({
        where,
        order: { occurredOn: 'DESC', createdAt: 'DESC' },
      });
      const referrals = await db.getRepository(ClientReferral).find({
        where,
        order: { referredOn: 'DESC', createdAt: 'DESC' },
      });
      return {
        careRecords: records.map((record) => ({
          id: record.id,
          kind: record.kind,
          occurredOn: record.occurredOn,
          title: record.title,
          place: record.place,
          amountVnd: record.amountVnd,
          policyNo: record.policyNo,
          note: record.note,
        })),
        signingSummary: summarizeSigning(records),
        referrals: referrals.map((referral) => ({
          id: referral.id,
          personName: referral.personName,
          relation: referral.relation,
          referredOn: referral.referredOn,
          result: referral.result,
          premiumVnd: referral.premiumVnd,
          note: referral.note,
        })),
        referralSummary: summarizeReferrals(referrals),
      };
    });
  }

  /** A policy named on a record must be one of the client's that the person sees (CUS-8). */
  private async assertPolicy(
    actor: Actor,
    scope: Scope,
    clientId: string,
    policyNo: string | null,
    db: EntityManager,
  ): Promise<void> {
    if (!policyNo) return;
    const reach = await this.reader.reach(actor, db);
    const [policy] = await this.reader.visiblePolicies(
      db,
      scope,
      reach,
      and(sql`p.policy_no = ${policyNo}`, policiesNaming([clientId])),
    );
    if (!policy) throw invalid([{ path: 'policyNo', message: 'not_found' }]);
  }

  private async record(
    scope: Scope,
    actor: Actor,
    action: AuditAction,
    entity: 'client_care_record' | 'client_referral',
    entityId: string,
    meta: Record<string, unknown>,
    db: EntityManager,
  ) {
    await this.audit.record(
      {
        tenantId: scope.tenantId,
        userId: actor.id,
        action,
        entity,
        entityId,
        meta,
      },
      db,
    );
  }

  // ---- Care records -------------------------------------------------------------------------

  async addCareRecord(
    actor: Actor,
    clientId: string,
    dto: CareRecordDto,
  ): Promise<{ id: string }> {
    const scope = this.scopeOf(actor);
    const values = {
      kind: dto.kind,
      occurredOn: dto.occurredOn,
      title: dto.title ?? null,
      place: dto.place ?? null,
      amountVnd: dto.amountVnd ?? null,
      policyNo: dto.policyNo ?? null,
      note: dto.note ?? null,
    };
    const issues = careRecordIssues(values);
    if (issues.length > 0) throw invalid(issues);
    return this.tenantDb.run(scope, async (db) => {
      await this.editor.ownedClient(actor, clientId, db);
      await this.assertPolicy(actor, scope, clientId, values.policyNo, db);
      const repo = db.getRepository(ClientCareRecord);
      const saved = await repo.save(
        repo.create({
          ...values,
          tenantId: scope.tenantId,
          clientId,
          createdBy: actor.id,
        }),
      );
      await this.record(
        scope,
        actor,
        AuditAction.Create,
        'client_care_record',
        saved.id,
        { clientId, kind: saved.kind },
        db,
      );
      return { id: saved.id };
    });
  }

  private async careRecordOf(
    scope: Scope,
    clientId: string,
    id: string,
    db: EntityManager,
  ): Promise<ClientCareRecord> {
    const record = await db
      .getRepository(ClientCareRecord)
      .findOneBy({ id, clientId, tenantId: scope.tenantId });
    if (!record) throw notFound();
    return record;
  }

  async updateCareRecord(
    actor: Actor,
    clientId: string,
    id: string,
    dto: UpdateCareRecordDto,
  ): Promise<void> {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      await this.editor.ownedClient(actor, clientId, db);
      const current = await this.careRecordOf(scope, clientId, id, db);
      // A field left out stays; null clears it. The rules look at the record as it will be
      const next = {
        kind: dto.kind ?? current.kind,
        occurredOn: dto.occurredOn ?? current.occurredOn,
        title: dto.title !== undefined ? dto.title : current.title,
        place: dto.place !== undefined ? dto.place : current.place,
        amountVnd:
          dto.amountVnd !== undefined ? dto.amountVnd : current.amountVnd,
        policyNo: dto.policyNo !== undefined ? dto.policyNo : current.policyNo,
        note: dto.note !== undefined ? dto.note : current.note,
      };
      const issues = careRecordIssues(next);
      if (issues.length > 0) throw invalid(issues);
      if (next.policyNo !== current.policyNo)
        await this.assertPolicy(actor, scope, clientId, next.policyNo, db);
      await db.getRepository(ClientCareRecord).update({ id: current.id }, next);
      await this.record(
        scope,
        actor,
        AuditAction.Update,
        'client_care_record',
        id,
        { clientId, kind: next.kind },
        db,
      );
    });
  }

  async removeCareRecord(
    actor: Actor,
    clientId: string,
    id: string,
  ): Promise<void> {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      await this.editor.ownedClient(actor, clientId, db);
      const current = await this.careRecordOf(scope, clientId, id, db);
      await db
        .getRepository(ClientCareRecord)
        .delete({ id: current.id, tenantId: scope.tenantId });
      await this.record(
        scope,
        actor,
        AuditAction.Delete,
        'client_care_record',
        id,
        { clientId, kind: current.kind },
        db,
      );
    });
  }

  // ---- Referrals ----------------------------------------------------------------------------

  async addReferral(
    actor: Actor,
    clientId: string,
    dto: ReferralDto,
  ): Promise<{ id: string }> {
    const scope = this.scopeOf(actor);
    const values = {
      personName: dto.personName,
      relation: dto.relation,
      referredOn: dto.referredOn,
      result: dto.result,
      premiumVnd: dto.premiumVnd ?? null,
      note: dto.note ?? null,
    };
    const issues = referralIssues(values);
    if (issues.length > 0) throw invalid(issues);
    return this.tenantDb.run(scope, async (db) => {
      await this.editor.ownedClient(actor, clientId, db);
      const repo = db.getRepository(ClientReferral);
      const saved = await repo.save(
        repo.create({
          ...values,
          tenantId: scope.tenantId,
          clientId,
          createdBy: actor.id,
        }),
      );
      await this.record(
        scope,
        actor,
        AuditAction.Create,
        'client_referral',
        saved.id,
        { clientId, result: saved.result },
        db,
      );
      return { id: saved.id };
    });
  }

  private async referralOf(
    scope: Scope,
    clientId: string,
    id: string,
    db: EntityManager,
  ): Promise<ClientReferral> {
    const referral = await db
      .getRepository(ClientReferral)
      .findOneBy({ id, clientId, tenantId: scope.tenantId });
    if (!referral) throw notFound();
    return referral;
  }

  async updateReferral(
    actor: Actor,
    clientId: string,
    id: string,
    dto: UpdateReferralDto,
  ): Promise<void> {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      await this.editor.ownedClient(actor, clientId, db);
      const current = await this.referralOf(scope, clientId, id, db);
      const next = {
        personName: dto.personName ?? current.personName,
        relation: dto.relation ?? current.relation,
        referredOn: dto.referredOn ?? current.referredOn,
        result: dto.result ?? current.result,
        premiumVnd:
          dto.premiumVnd !== undefined ? dto.premiumVnd : current.premiumVnd,
        note: dto.note !== undefined ? dto.note : current.note,
      };
      const issues = referralIssues(next);
      if (issues.length > 0) throw invalid(issues);
      await db.getRepository(ClientReferral).update({ id: current.id }, next);
      await this.record(
        scope,
        actor,
        AuditAction.Update,
        'client_referral',
        id,
        { clientId, result: next.result },
        db,
      );
    });
  }

  async removeReferral(
    actor: Actor,
    clientId: string,
    id: string,
  ): Promise<void> {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      await this.editor.ownedClient(actor, clientId, db);
      const current = await this.referralOf(scope, clientId, id, db);
      await db
        .getRepository(ClientReferral)
        .delete({ id: current.id, tenantId: scope.tenantId });
      await this.record(
        scope,
        actor,
        AuditAction.Delete,
        'client_referral',
        id,
        { clientId, result: current.result },
        db,
      );
    });
  }
}
