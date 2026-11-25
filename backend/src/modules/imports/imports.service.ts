import {
  HttpStatus,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
import { Permission, Role } from '../../common/rbac.js';
import { newId, withoutNulls } from '../../core/persistence/ids.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { insertRows, updateRows } from '../../core/persistence/upsert.js';
import { PlatformDb } from '../../core/tenancy/platform-db.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import type { Env } from '../../config/env.validation.js';
import { AgentsService } from '../agents/agents.service.js';
import { Agent } from '../agents/infrastructure/agent.entity.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { ClientsService } from '../clients/clients.service.js';
import {
  Application,
  Client,
  Policy,
  RecordChange,
} from '../clients/infrastructure/client.entities.js';
import { LeadLinkService } from '../clients/lead-link.service.js';
import { LeadOptionsService } from '../leads/lead-options.service.js';
import { LeadsService } from '../leads/leads.service.js';
import { RealtimeEvent } from '../realtime/realtime.events.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { planActivities } from './activity-plan.js';
import type { ActivityPlan, ParsedActivityRow } from './activity-plan.js';
import {
  type AgentPlan,
  type ExistingAgent,
  type PlanIssue,
  planAgents,
  type UploaderScope,
} from './agent-plan.js';
import {
  type Cell,
  matchColumns,
  parseAgentRow,
  type ParsedAgentRow,
  parseLeadRow,
} from './cells.js';
import type {
  AddImportRowsDto,
  CreateImportDto,
  ListImportErrorsQueryDto,
  ListImportsQueryDto,
} from './imports.dto.js';
import {
  Import,
  ImportError,
  type ImportKind,
  ImportRow,
  type ImportSheet,
  type ImportProgress,
  ImportStatus,
  SuccessActivity,
} from './infrastructure/import.entities.js';
import {
  type LeadPlan,
  matchAgent,
  type ParsedLeadRow,
  planLeads,
} from './lead-plan.js';
import { importMessage } from './messages.js';
import { parseSuccessRow } from './success-cells.js';
import {
  type ExistingApplication,
  type ExistingClient,
  type ExistingPolicy,
  type ParsedApplicationRow,
  type ParsedClientRow,
  type ParsedPolicyRow,
  type ParsedProductRow,
  planSuccess,
  refId,
  type SheetResult,
  storedRef,
  SUCCESS_SHEETS,
  type SuccessPlan,
} from './success-plan.js';
import {
  ACTIVITIES_SHEET,
  AGENTS_SHEET,
  APPLICATIONS_SHEET,
  classifySheet,
  CLIENTS_SHEET,
  LEADS_SHEET,
  POLICIES_SHEET,
  PRODUCTS_SHEET,
} from './templates.js';
import type { SheetTemplate } from './templates.js';
import { buildErrorReport, buildTemplate } from './workbook.js';

/** Sections 19.3-19.6: each Success sheet with the field that keys its rows. */
const SUCCESS_KEYS = new Map<string, { template: SheetTemplate; key: string }>([
  [CLIENTS_SHEET.name, { template: CLIENTS_SHEET, key: 'clientCode' }],
  [POLICIES_SHEET.name, { template: POLICIES_SHEET, key: 'policyNo' }],
  [PRODUCTS_SHEET.name, { template: PRODUCTS_SHEET, key: 'policyNo' }],
  [
    APPLICATIONS_SHEET.name,
    { template: APPLICATIONS_SHEET, key: 'applicationNo' },
  ],
  [ACTIVITIES_SHEET.name, { template: ACTIVITIES_SHEET, key: 'activityId' }],
]);

/** What one import would do, sheet by sheet. */
interface Planned {
  results: Map<string, SheetResult>;
  agents?: AgentPlan;
  lead?: LeadPlan;
  success?: SuccessPlan;
  activities?: ActivityPlan;
}

/** IMP-13 names 20,000 rows as the largest supported file. */
const MAX_ROWS_PER_IMPORT = 20_000;
const FIRST_DATA_ROW = 2;

/** Open question I: from this many rows a file is written batch by batch; below it, all or nothing. */
export const BATCH_THRESHOLD = 2_000;
const BATCH_SIZE = 500;
/** A batched write whose import has not moved for this long was cut off (a restart, a crash). */
const STALLED_MS = 10 * 60_000;
const SWEEP_MS = 5 * 60_000;

/** One part of a commit. In a batched write each runs in its own transaction. */
interface WriteStep {
  /** What the step writes, so a failure can be reported on each row. */
  items: {
    sheet: string;
    key?: string | null;
    rowNo?: number;
    isNew?: boolean;
  }[];
  /** For a step with no rows of its own (the tree, agent links): where a failure is reported. */
  sheet?: string;
  run: (db: EntityManager) => Promise<void>;
}

interface WriteState {
  cycles: number;
  /** `failedKey(sheet, key)` of every record whose batch failed. */
  failed: Set<string>;
}

const failedKey = (sheet: string, key: string) => `${sheet}\u0000${key}`;

/** IMP-21: the sheet each kind of field change comes from. */
const CHANGE_SHEETS: Record<string, string> = {
  client: CLIENTS_SHEET.name,
  policy: POLICIES_SHEET.name,
  policy_product: POLICIES_SHEET.name,
  application: APPLICATIONS_SHEET.name,
};

const emptyCounts = {
  found: 0,
  inserted: 0,
  updated: 0,
  rejected: 0,
  skipped: 0,
  warnings: 0,
  managersCreated: 0,
};

type NewError = Omit<
  ImportError,
  'id' | 'crossRow' | 'column' | 'recordKey'
> & {
  column?: string | null;
  recordKey?: string | null;
  crossRow?: boolean;
};

const permissionFor = (kind: ImportKind) =>
  kind === 'LEADS' ? Permission.LeadsImport : Permission.ImportsUpload;

@Injectable()
export class ImportsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImportsService.name);
  /** Batched writes running on this instance, by import id. */
  private readonly running = new Map<string, Promise<void>>();
  private sweep?: NodeJS.Timeout;

  constructor(
    private readonly tenantDb: TenantDb,
    private readonly platformDb: PlatformDb,
    private readonly realtime: RealtimeService,
    private readonly config: ConfigService<Env, true>,
    private readonly agentsService: AgentsService,
    private readonly leadsService: LeadsService,
    private readonly leadOptions: LeadOptionsService,
    private readonly clientsService: ClientsService,
    private readonly leadLinks: LeadLinkService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    // Tests call closeStalled() with a fixed clock instead
    if (this.config.get('NODE_ENV', { infer: true }) === 'test') return;
    this.sweep = setInterval(() => {
      this.closeStalled().catch((error: unknown) =>
        this.logger.warn(`Stalled import sweep failed: ${String(error)}`),
      );
    }, SWEEP_MS);
    this.sweep.unref();
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.sweep);
    // Let batched writes on this instance finish their current step rather than cut them mid-way
    await Promise.allSettled(this.running.values());
  }

  private async leadImportLabels(scope: Scope) {
    const lists = await this.leadOptions.importLabels(scope);
    return {
      interest: { labels: lists.interest, hidden: lists.hidden.interest },
      care_status: {
        labels: lists.care_status,
        hidden: lists.hidden.care_status,
      },
    };
  }

  private scopeOf(actor: Actor): Scope {
    if (!actor.tenantId) throw forbidden();
    return { tenantId: actor.tenantId };
  }

  private canRead(actor: Actor): boolean {
    return [
      Permission.ImportsUpload,
      Permission.ImportsViewAll,
      Permission.LeadsImport,
    ].some((permission) => actor.permissions.includes(permission));
  }

  /** IMP-12: your own imports, or everyone's with `imports.view_all`. Anything else looks missing. */
  private async readable(actor: Actor, id: string, db: EntityManager) {
    const scope = this.scopeOf(actor);
    if (!this.canRead(actor)) throw forbidden();
    if (!isId(id)) throw notFound();
    const found = await db.getRepository(Import).findOneBy({
      id,
      tenantId: scope.tenantId,
      ...(!actor.permissions.includes(Permission.ImportsViewAll) && {
        userId: actor.id,
      }),
    });
    if (!found) throw notFound();
    return found;
  }

  /** Section 17.10: writing to an import is for the person who started it. */
  private async owned(
    actor: Actor,
    id: string,
    db: EntityManager,
    lock = false,
  ) {
    const scope = this.scopeOf(actor);
    if (!isId(id)) throw notFound();
    const query = db
      .getRepository(Import)
      .createQueryBuilder('item')
      .where(
        'item.id = :id AND item.tenantId = :tenantId AND item.userId = :userId',
        { id, tenantId: scope.tenantId, userId: actor.id },
      );
    // Locked, so a double click or a retry cannot change the same import twice at once
    if (lock) query.setLock('pessimistic_write');
    const found = await query.getOne();
    if (!found) throw notFound();
    return found;
  }

  private sheetError(
    importId: string,
    tenantId: string,
    sheet: string,
    code: string,
    col?: string,
  ): NewError {
    return {
      importId,
      tenantId,
      sheet,
      row: 1,
      column: col ?? null,
      code,
      messageVi: importMessage(code, { col }),
      severity: 'error',
    };
  }

  /** IMP-3 step 1: what can be imported from this file, and why the rest cannot. */
  async create(actor: Actor, dto: CreateImportDto) {
    const scope = this.scopeOf(actor);
    if (!actor.permissions.includes(permissionFor(dto.kind))) throw forbidden();
    const tenantId = scope.tenantId;
    const importId = newId();
    const sheetErrors: NewError[] = [];

    const planSheet = (
      headers: string[],
      template: typeof AGENTS_SHEET,
      keptName: string,
      chosen?: Record<string, number>,
    ): ImportSheet => {
      const match = matchColumns(template, headers, dto.kind, chosen);
      const sheet: ImportSheet = {
        ...emptyCounts,
        ...match,
        name: keptName,
        status: 'READY',
      };
      for (const col of match.banned)
        sheetErrors.push(
          this.sheetError(importId, tenantId, keptName, 'banned_column', col),
        );
      // AGT-4: someone outside the tree who may not edit it has no rows they could write
      if (
        dto.kind === 'SUCCESS' &&
        !actor.permissions.includes(Permission.ImportsAgentTree) &&
        !actor.agentCode
      ) {
        sheetErrors.push(
          this.sheetError(importId, tenantId, keptName, 'sheet_not_allowed'),
        );
        return { ...sheet, status: 'BLOCKED', reason: 'sheet_not_allowed' };
      }
      // IMP-4: only this sheet is blocked; the others in the file carry on
      if (match.missingRequired.length > 0) {
        for (const col of match.missingRequired)
          sheetErrors.push(
            this.sheetError(
              importId,
              tenantId,
              keptName,
              'missing_required_column',
              col,
            ),
          );
        return {
          ...sheet,
          status: 'BLOCKED',
          reason: 'missing_required_column',
        };
      }
      return sheet;
    };

    const sheets: ImportSheet[] = dto.sheets.map(({ name, headers }) => {
      // IMP-23: a GA names its own sheet, and the person chose this one
      if (dto.kind === 'LEADS')
        return planSheet(headers, LEADS_SHEET, name, dto.mapping?.columns);
      const base = {
        ...emptyCounts,
        name,
        fields: [],
        present: [],
        missingRequired: [],
        banned: [],
      };
      const template = classifySheet(name);
      if (template === 'LATER') return { ...base, status: 'LATER' as const };
      if (template === 'IGNORED')
        return { ...base, status: 'IGNORED' as const };
      return planSheet(headers, template, template.name);
    });

    await this.tenantDb.run(scope, async (db) => {
      // IMP-2: starting a new import cancels this person's unconfirmed one
      await this.cancelOpen(scope, actor.id, db);
      await db.getRepository(Import).insert({
        id: importId,
        tenantId,
        userId: actor.id,
        agentCode: actor.agentCode ?? null,
        kind: dto.kind,
        fileName: dto.fileName,
        snapshotDate: dto.snapshotDate,
        status: ImportStatus.Parsing,
        sheets,
        agentMapping: dto.mapping?.agents ?? [],
      });
      await insertRows(db, ImportError, sheetErrors);
    });
    return { id: importId, status: ImportStatus.Parsing, sheets };
  }

  private async cancelOpen(
    scope: Scope,
    userId: string,
    db: EntityManager,
  ): Promise<void> {
    const open = await rowsOf<{ id: string }>(
      db,
      `UPDATE imports SET status = $3
        WHERE tenant_id = $1 AND user_id = $2 AND status IN ('PARSING', 'VALIDATED')
        RETURNING id`,
      [scope.tenantId, userId, ImportStatus.Failed],
    );
    if (open.length > 0)
      await db.query(
        `DELETE FROM import_rows WHERE tenant_id = $1 AND import_id = ANY($2::uuid[])`,
        [scope.tenantId, open.map((item) => item.id)],
      );
  }

  /** IMP-3 step 2: every cell is checked; good rows go to staging, never to business tables. */
  async addRows(actor: Actor, id: string, dto: AddImportRowsDto) {
    const scope = this.scopeOf(actor);
    // IMP-25 + OPT-10: the GA's own labels for interest and care status
    return this.tenantDb.run(scope, async (db) => {
      const current = await this.owned(actor, id, db, true);
      if (current.status !== ImportStatus.Parsing)
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ImportNotOpen);
      const sheet = current.sheets.find((item) => item.name === dto.sheet);
      if (sheet?.status !== 'READY')
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.SheetNotReady);
      const total = current.sheets.reduce((sum, item) => sum + item.found, 0);
      if (total + dto.rows.length > MAX_ROWS_PER_IMPORT)
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.ImportTooLarge,
        );

      const catalogue =
        current.kind === 'LEADS'
          ? await this.leadImportLabels(scope)
          : undefined;
      const staged: Partial<ImportRow>[] = [];
      const problems: NewError[] = [];
      let rejectedRows = 0;
      for (const { r, c } of dto.rows) {
        const success = SUCCESS_KEYS.get(sheet.name);
        const { data, key, issues } =
          current.kind === 'LEADS'
            ? parseLeadRow(LEADS_SHEET, sheet.fields, c as Cell[], catalogue)
            : success
              ? parseSuccessRow(
                  success.template,
                  sheet.fields,
                  c as Cell[],
                  success.key,
                )
              : parseAgentRow(AGENTS_SHEET, sheet.fields, c as Cell[]);
        for (const issue of issues)
          problems.push({
            tenantId: scope.tenantId,
            importId: current.id,
            sheet: sheet.name,
            row: r,
            column: issue.column ?? null,
            code: issue.code,
            recordKey: key ?? null,
            messageVi: importMessage(issue.code, { v: issue.value }),
            severity: 'severity' in issue ? issue.severity : 'error',
          });
        if (!data) {
          rejectedRows++;
          continue;
        }
        staged.push({
          tenantId: scope.tenantId,
          importId: current.id,
          sheet: sheet.name,
          rowNo: r,
          key,
          data: data as unknown as Record<string, unknown>,
        });
      }

      await insertRows(db, ImportRow, staged);
      await insertRows(db, ImportError, problems);
      const sheets = current.sheets.map((item) =>
        item.name === sheet.name
          ? {
              ...item,
              found: item.found + dto.rows.length,
              rejected: item.rejected + rejectedRows,
            }
          : item,
      );
      await db
        .getRepository(Import)
        .update({ id: current.id, tenantId: scope.tenantId }, { sheets });
      return { staged: staged.length, rejected: rejectedRows };
    });
  }

  private async uploaderScope(
    actor: Actor,
    db: EntityManager,
  ): Promise<UploaderScope> {
    const downline = actor.agentCode
      ? await rowsOf<{ agent_code: string }>(
          db,
          `SELECT agent_code FROM agents WHERE tenant_id = $1 AND ancestors @> ARRAY[$2]::text[]`,
          [actor.tenantId, actor.agentCode],
        )
      : [];
    return {
      canEditTree: actor.permissions.includes(Permission.ImportsAgentTree),
      agentCode: actor.agentCode,
      downline: new Set(downline.map((agent) => agent.agent_code)),
    };
  }

  private async agentCodes(scope: Scope, db: EntityManager) {
    return (
      await rowsOf<{ agent_code: string }>(
        db,
        `SELECT agent_code FROM agents WHERE tenant_id = $1`,
        [scope.tenantId],
      )
    ).map((row) => row.agent_code);
  }

  private async planAgentSheet(
    actor: Actor,
    rows: { rowNo: number; data: unknown }[],
    scope: Scope,
    db: EntityManager,
  ): Promise<AgentPlan> {
    const current = await db
      .getRepository(Agent)
      .findBy({ tenantId: scope.tenantId });
    return planAgents(
      rows as { rowNo: number; data: ParsedAgentRow }[],
      new Map(
        current.map((agent) => [
          agent.agentCode,
          withoutNulls(agent) as unknown as ExistingAgent,
        ]),
      ),
      await this.uploaderScope(actor, db),
    );
  }

  private async planLeadSheet(
    actor: Actor,
    current: Import,
    rows: { rowNo: number; data: unknown }[],
    scope: Scope,
    db: EntityManager,
  ): Promise<LeadPlan> {
    const parsed = rows as { rowNo: number; data: ParsedLeadRow }[];
    const { existing, locked } = await this.leadsService.existingForImport(
      scope,
      parsed.map((row) => row.data.phone),
      db,
    );
    const agents = await this.agentsService.listForPicker(scope);
    return planLeads(
      parsed,
      existing,
      agents,
      Object.fromEntries(
        (current.agentMapping ?? []).map(({ value, agentCode }) => [
          value,
          agentCode,
        ]),
      ),
      locked,
    );
  }

  /**
   * Every READY sheet planned together: 01_Agents first, because 02-05 may name agents it adds.
   * Validation and commit both call this, so the preview never drifts from what is written.
   */
  private async plan(
    actor: Actor,
    current: Import,
    db: EntityManager,
  ): Promise<Planned> {
    const scope = this.scopeOf(actor);
    const ready = new Set(
      current.sheets
        .filter((sheet) => sheet.status === 'READY')
        .map((sheet) => sheet.name),
    );
    const rowsOfSheet = async (sheet: string) =>
      ready.has(sheet)
        ? (
            await db.getRepository(ImportRow).find({
              where: {
                tenantId: scope.tenantId,
                importId: current.id,
                sheet,
              },
              order: { rowNo: 'ASC' },
              select: { rowNo: true, data: true },
            })
          ).map((row) => ({ rowNo: row.rowNo, data: row.data as unknown }))
        : [];
    const planned: Planned = { results: new Map() };

    if (current.kind === 'LEADS') {
      const sheet = [...ready][0];
      planned.lead = await this.planLeadSheet(
        actor,
        current,
        await rowsOfSheet(sheet),
        scope,
        db,
      );
      planned.results.set(sheet, planned.lead);
      return planned;
    }

    if (ready.has(AGENTS_SHEET.name)) {
      planned.agents = await this.planAgentSheet(
        actor,
        await rowsOfSheet(AGENTS_SHEET.name),
        scope,
        db,
      );
      planned.results.set(AGENTS_SHEET.name, planned.agents);
    }
    if (Object.values(SUCCESS_SHEETS).some((sheet) => ready.has(sheet))) {
      planned.success = await this.planSuccessSheets(
        actor,
        scope,
        {
          clients: await rowsOfSheet(SUCCESS_SHEETS.clients),
          policies: await rowsOfSheet(SUCCESS_SHEETS.policies),
          products: await rowsOfSheet(SUCCESS_SHEETS.products),
          applications: await rowsOfSheet(SUCCESS_SHEETS.applications),
        },
        new Set(planned.agents?.seen ?? []),
        db,
      );
      for (const [sheet, result] of Object.entries(planned.success.sheets))
        planned.results.set(sheet, result);
    }
    if (ready.has(ACTIVITIES_SHEET.name)) {
      planned.activities = await this.planActivitySheet(
        actor,
        scope,
        (await rowsOfSheet(ACTIVITIES_SHEET.name)) as {
          rowNo: number;
          data: ParsedActivityRow;
        }[],
        new Set(planned.agents?.seen ?? []),
        db,
      );
      planned.results.set(ACTIVITIES_SHEET.name, planned.activities.sheet);
    }
    return planned;
  }

  /** Section 12.2: GA_HEAD writes for the whole GA like imports.tenant_wide; others their scope. */
  private async successUploader(actor: Actor, db: EntityManager) {
    const scope = actor.agentCode
      ? await this.agentsService.scopeCodes(actor, db)
      : [];
    return {
      tenantWide:
        actor.permissions.includes(Permission.ImportsTenantWide) ||
        actor.roles.includes(Role.GaHead),
      reach: actor.reach,
      agentCode: actor.agentCode,
      scope: new Set(scope),
    };
  }

  /** Section 12.5: loads the stored activities the file names, then runs the pure plan. */
  private async planActivitySheet(
    actor: Actor,
    scope: Scope,
    rows: { rowNo: number; data: ParsedActivityRow }[],
    fileAgents: ReadonlySet<string>,
    db: EntityManager,
  ): Promise<ActivityPlan> {
    const existing = await db
      .getRepository(SuccessActivity)
      .createQueryBuilder('item')
      .where('item.tenantId = :tenantId AND item.activityId = ANY(:ids)', {
        tenantId: scope.tenantId,
        ids: rows.map((row) => row.data.activityId),
      })
      .getMany();
    return planActivities({
      rows,
      existing: new Map(
        existing.map((item) => [
          item.activityId,
          withoutNulls(item) as unknown as Record<string, unknown> & {
            agentCode: string;
          },
        ]),
      ),
      knownAgents: new Set([
        ...(await this.agentCodes(scope, db)),
        ...fileAgents,
      ]),
      uploader: await this.successUploader(actor, db),
    });
  }

  /** Section 12.2 + 12.3: loads what sheets 02-05 touch, then runs the pure plan. */
  private async planSuccessSheets(
    actor: Actor,
    scope: Scope,
    rows: {
      clients: { rowNo: number; data: unknown }[];
      policies: { rowNo: number; data: unknown }[];
      products: { rowNo: number; data: unknown }[];
      applications: { rowNo: number; data: unknown }[];
    },
    fileAgents: ReadonlySet<string>,
    db: EntityManager,
  ): Promise<SuccessPlan> {
    const clients = rows.clients as { rowNo: number; data: ParsedClientRow }[];
    const policies = rows.policies as {
      rowNo: number;
      data: ParsedPolicyRow;
    }[];
    const products = rows.products as {
      rowNo: number;
      data: ParsedProductRow;
    }[];
    const applications = rows.applications as {
      rowNo: number;
      data: ParsedApplicationRow;
    }[];
    const policyNos = [
      ...new Set([
        ...policies.map((row) => row.data.policyNo),
        ...products.map((row) => row.data.policyNo),
      ]),
    ];
    const clientCodes = [
      ...new Set([
        ...clients.map((row) => row.data.clientCode),
        ...policies.flatMap((row) => [
          row.data.holderClientCode,
          ...(row.data.insuredClientCode ? [row.data.insuredClientCode] : []),
        ]),
        ...applications.flatMap((row) => row.data.clientCode ?? []),
      ]),
    ];
    const byKey = <T extends object>(
      target: new () => T,
      alias: string,
      key: string,
      values: string[],
    ) =>
      db
        .getRepository(target)
        .createQueryBuilder(alias)
        .where(
          `${alias}.tenantId = :tenantId AND ${alias}.${key} = ANY(:values)`,
          {
            tenantId: scope.tenantId,
            values,
          },
        )
        .getMany();
    const existingPolicies = await byKey(Policy, 'p', 'policyNo', policyNos);
    const existingApplications = await byKey(
      Application,
      'a',
      'applicationNo',
      applications.map((row) => row.data.applicationNo),
    );

    // Decided 25/11/2026: stored records name people by id; the planner works with the file's
    // codes. Every stored person gets their Success code, or `id:<id>` when they have none.
    const peopleIds = new Set<string>();
    for (const policy of existingPolicies) {
      for (const link of policy.clients) peopleIds.add(link.clientId);
      for (const product of policy.products)
        if (product.insuredClientId) peopleIds.add(product.insuredClientId);
      if (policy.holderClientId) peopleIds.add(policy.holderClientId);
      if (policy.insuredClientId) peopleIds.add(policy.insuredClientId);
    }
    for (const application of existingApplications)
      if (application.clientId) peopleIds.add(application.clientId);
    const stored = await rowsOf<{ id: string; success_code: string | null }>(
      db,
      `SELECT id, success_code FROM clients WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
      [scope.tenantId, [...peopleIds]],
    );
    const codeOf = new Map(
      stored.map((person) => [
        person.id,
        person.success_code ?? storedRef(person.id),
      ]),
    );
    const known = new Set(
      (
        await rowsOf<{ success_code: string }>(
          db,
          `SELECT success_code FROM clients WHERE tenant_id = $1 AND success_code = ANY($2::text[])`,
          [scope.tenantId, clientCodes],
        )
      ).map((row) => row.success_code),
    );
    // A person added by hand takes the code the file gives their role on their own policy
    const adoptions = new Map<string, string>();
    const adopted = new Set<string>();
    for (const row of policies) {
      const policy = existingPolicies.find(
        (item) => item.policyNo === row.data.policyNo,
      );
      if (!policy) continue;
      for (const [role, code] of [
        ['PO', row.data.holderClientCode],
        ['LI', row.data.insuredClientCode],
      ] as const) {
        if (!code || known.has(code) || adoptions.has(code)) continue;
        const person = policy.clients.find(
          (link) =>
            link.role === role && link.source === 'POLICY' && !link.endedAt,
        );
        if (
          !person ||
          adopted.has(person.clientId) ||
          refId(codeOf.get(person.clientId) ?? '') !== person.clientId
        )
          continue;
        adoptions.set(code, person.clientId);
        adopted.add(person.clientId);
        codeOf.set(person.clientId, code);
      }
    }
    const coded = (id: string | null | undefined) =>
      id ? (codeOf.get(id) ?? storedRef(id)) : undefined;

    const existingClients = await db
      .getRepository(Client)
      .createQueryBuilder('c')
      .where(
        'c.tenantId = :tenantId AND (c.successCode = ANY(:codes) OR c.id = ANY(CAST(:ids AS uuid[])))',
        {
          tenantId: scope.tenantId,
          codes: clientCodes,
          ids: [...adoptions.values()],
        },
      )
      .getMany();
    const plan = planSuccess({
      clients,
      policies,
      products,
      applications,
      existingClients: new Map(
        existingClients.map((item) => {
          const { successCode, ...rest } = withoutNulls(item) as Client;
          const clientCode = successCode ?? codeOf.get(item.id)!;
          return [clientCode, { ...rest, clientCode } as ExistingClient];
        }),
      ),
      existingPolicies: new Map(
        existingPolicies.map((item) => {
          const {
            holderClientId,
            insuredClientId,
            clientIds: _ids,
            ...rest
          } = withoutNulls(item) as Policy;
          return [
            item.policyNo,
            {
              ...rest,
              holderClientCode: coded(holderClientId),
              insuredClientCode: coded(insuredClientId),
              clients: item.clients.map(({ clientId, ...link }) => ({
                ...link,
                clientCode: coded(clientId)!,
              })),
              products: item.products.map(({ insuredClientId: id, ...line }) => ({
                ...line,
                insuredCode: coded(id) ?? '',
              })),
            } as unknown as ExistingPolicy,
          ];
        }),
      ),
      existingApplications: new Map(
        existingApplications.map((item) => {
          const { clientId, ...rest } = withoutNulls(item) as Application;
          return [
            item.applicationNo,
            { ...rest, clientCode: coded(clientId) } as unknown as ExistingApplication,
          ];
        }),
      ),
      knownAgents: new Set([
        ...(await this.agentCodes(scope, db)),
        ...fileAgents,
      ]),
      uploader: await this.successUploader(actor, db),
      now: new Date(),
    });
    return {
      ...plan,
      adoptions: [...adoptions].map(([clientCode, clientId]) => ({
        clientCode,
        clientId,
      })),
    };
  }

  private allCrossRowErrors(planned: Planned, current: Import): NewError[] {
    return [...planned.results].flatMap(([sheet, result]) =>
      result.issues.map((issue: PlanIssue) => ({
        importId: current.id,
        tenantId: current.tenantId,
        sheet,
        row: issue.row,
        column: issue.column ?? null,
        code: issue.code,
        recordKey: issue.key ?? null,
        messageVi: importMessage(issue.code),
        severity: issue.severity,
        crossRow: true,
      })),
    );
  }

  /** The counts of each sheet: what its plan found, plus what the cell checks already settled. */
  private async withCounts(
    current: Import,
    planned: Planned,
    db: EntityManager,
  ): Promise<ImportSheet[]> {
    const sheets: ImportSheet[] = [];
    for (const sheet of current.sheets) {
      const result = planned.results.get(sheet.name);
      if (!result || sheet.status !== 'READY') {
        sheets.push(sheet);
        continue;
      }
      // Rows settled at the cell stage never reach the plan, so they are counted from their errors
      const [parsed] = await rowsOf<{ rejected: number; warnings: number }>(
        db,
        `SELECT count(DISTINCT row) FILTER (WHERE severity = 'error')::int AS rejected,
                count(DISTINCT row) FILTER (WHERE severity = 'warning')::int AS warnings
           FROM import_errors
          WHERE tenant_id = $1 AND import_id = $2 AND sheet = $3 AND NOT cross_row AND row >= $4`,
        [current.tenantId, current.id, sheet.name, FIRST_DATA_ROW],
      );
      sheets.push({
        ...sheet,
        ...result.counts,
        rejected: parsed.rejected + result.counts.rejected,
        warnings: parsed.warnings + result.counts.warnings,
      });
    }
    return sheets;
  }

  /** IMP-3 step 4: the preview. Nothing is written to business data yet. */
  async validate(actor: Actor, id: string) {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      const current = await this.owned(actor, id, db, true);
      if (current.status !== ImportStatus.Parsing)
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ImportNotOpen);
      const planned = await this.plan(actor, current, db);
      const sheets = await this.withCounts(current, planned, db);
      await db
        .getRepository(Import)
        .update(
          { id: current.id, tenantId: scope.tenantId },
          { status: ImportStatus.Validated, sheets },
        );
      await insertRows(
        db,
        ImportError,
        this.allCrossRowErrors(planned, current),
      );
    });
    return this.detail(actor, id);
  }

  /**
   * IMP-3 step 5. Open question I: a file under 2,000 rows is written in one transaction, all or
   * nothing. A larger one is claimed here and written in the background, batch by batch.
   */
  async commit(actor: Actor, id: string) {
    const scope = this.scopeOf(actor);
    const now = new Date();
    const batched = await this.tenantDb.run(scope, async (db) => {
      // Locked and checked, so a double click or a retry cannot apply the file twice
      const claimed = await this.owned(actor, id, db, true);
      if (!actor.permissions.includes(permissionFor(claimed.kind)))
        throw forbidden();
      if (claimed.status !== ImportStatus.Validated)
        throw new ApiException(
          HttpStatus.CONFLICT,
          ErrorCode.ImportNotValidated,
        );
      const rows = claimed.sheets.reduce((sum, sheet) => sum + sheet.found, 0);
      if (rows >= BATCH_THRESHOLD) {
        await db.getRepository(Import).update(
          { id: claimed.id, tenantId: scope.tenantId },
          {
            status: ImportStatus.Committing,
            committedAt: now,
            progress: { done: 0, total: 0, failedBatches: 0, failedRows: 0 },
          },
        );
        return true;
      }
      await db
        .getRepository(Import)
        .update(
          { id: claimed.id, tenantId: scope.tenantId },
          { status: ImportStatus.Committed, committedAt: now },
        );
      const planned = await this.plan(actor, claimed, db);
      const write: WriteState = { cycles: 0, failed: new Set() };
      for (const step of this.writeSteps(
        actor,
        claimed,
        planned,
        now,
        write,
        false,
      ))
        await step.run(db);
      await this.finish(actor, claimed, planned, write, db);
      return false;
    });
    if (batched) {
      const run = this.writeInBatches(actor, id, now)
        .catch((error: unknown) =>
          this.logger.error(`Batched import ${id} stopped: ${String(error)}`),
        )
        .finally(() => this.running.delete(id));
      this.running.set(id, run);
    }
    return this.detail(actor, id);
  }

  /** Tests wait for a batched write started by `commit`. */
  async waitForCommit(id: string): Promise<void> {
    await this.running.get(id);
  }

  /**
   * Open question I: the whole write as ordered steps. Together in one transaction they are the
   * old all-or-nothing commit; batched, each step is its own transaction of at most BATCH_SIZE rows.
   */
  private writeSteps(
    actor: Actor,
    current: Import,
    planned: Planned,
    now: Date,
    write: WriteState,
    batched: boolean,
  ): WriteStep[] {
    const scope = this.scopeOf(actor);
    const importId = current.id;
    const chunks = <T>(items: T[]): T[][] => {
      if (!batched || items.length <= BATCH_SIZE) return [items];
      const out: T[][] = [];
      for (let at = 0; at < items.length; at += BATCH_SIZE)
        out.push(items.slice(at, at + BATCH_SIZE));
      return out;
    };
    const steps: WriteStep[] = [];

    if (planned.lead) {
      const plan = planned.lead;
      const sheet = [...planned.results.keys()][0];
      for (const writes of chunks(plan.writes))
        steps.push({
          items: writes.map((item) => ({
            sheet,
            rowNo: item.rowNo,
            key: item.values.phone ?? null,
            isNew: !item.leadId,
          })),
          run: (db) =>
            this.leadsService.applyImportPlan(
              { ...plan, writes },
              scope,
              importId,
              actor.id,
              now,
              db,
            ),
        });
    }

    if (planned.agents) {
      const plan = planned.agents;
      const parts = chunks(plan.writes);
      parts.forEach((writes, index) =>
        steps.push({
          items: writes.map((item) => ({
            sheet: AGENTS_SHEET.name,
            key: item.code,
            isNew: item.isNew,
          })),
          run: (db) =>
            this.applyAgentPlan(
              // Every agent the file mentions is marked seen once, with the last part
              {
                ...plan,
                writes,
                seen: index === parts.length - 1 ? plan.seen : [],
              },
              scope,
              importId,
              actor.id,
              now,
              db,
            ),
        }),
      );
      steps.push({
        items: [],
        sheet: AGENTS_SHEET.name,
        run: async (db) => {
          write.cycles = (
            await this.agentsService.rebuildTree(scope, db)
          ).length;
        },
      });
    }

    if (planned.success) {
      const plan = planned.success;
      const none: SuccessPlan = {
        ...plan,
        clients: [],
        implicitClients: [],
        policies: [],
        applications: [],
        changes: [],
        touchedClients: [],
        adoptions: [],
      };
      const apply = (part: Partial<SuccessPlan>) => (db: EntityManager) =>
        this.clientsService.applyImport(
          { ...none, ...part },
          scope,
          importId,
          now,
          db,
        );
      // A client added by hand takes the code the file gives them, before anything is matched
      if (plan.adoptions.length > 0)
        steps.push({
          items: [],
          sheet: CLIENTS_SHEET.name,
          run: apply({ adoptions: plan.adoptions }),
        });
      for (const clients of chunks(plan.clients))
        steps.push({
          items: clients.map((item) => ({
            sheet: CLIENTS_SHEET.name,
            key: item.clientCode,
            isNew: item.isNew,
          })),
          run: apply({ clients }),
        });
      if (plan.implicitClients.length > 0)
        for (const implicitClients of chunks(plan.implicitClients))
          steps.push({
            items: implicitClients.map((item) => ({
              sheet: CLIENTS_SHEET.name,
              key: item.clientCode,
            })),
            run: apply({ implicitClients }),
          });
      if (plan.policies.length > 0)
        for (const policies of chunks(plan.policies))
          steps.push({
            items: policies.flatMap((item) => [
              {
                sheet: POLICIES_SHEET.name,
                key: item.state.policyNo,
                isNew: item.isNew,
              },
              { sheet: PRODUCTS_SHEET.name, key: item.state.policyNo },
            ]),
            run: apply({ policies }),
          });
      if (plan.applications.length > 0)
        for (const applications of chunks(plan.applications))
          steps.push({
            items: applications.map((item) => ({
              sheet: APPLICATIONS_SHEET.name,
              key: item.applicationNo,
              isNew: item.isNew,
            })),
            run: apply({ applications }),
          });
      steps.push({
        items: [],
        sheet: CLIENTS_SHEET.name,
        run: async (db) => {
          // IMP-21: only fields of stored records that really changed, and were written.
          // People are recorded by client id; the holder and insured codes are not kept (their
          // names are, as holderName and insuredName).
          const written = plan.changes.filter(
            (item) =>
              !write.failed.has(
                failedKey(CHANGE_SHEETS[item.entity], item.entityKey),
              ) &&
              item.field !== 'holderClientCode' &&
              item.field !== 'insuredClientCode',
          );
          const idOf = await this.clientsService.idsOfCodes(
            scope,
            [
              ...plan.touchedClients,
              ...written.flatMap((item) =>
                item.entity === 'client'
                  ? [item.entityKey]
                  : item.entity === 'policy_product'
                    ? [item.entityKey.split('/')[2]]
                    : [],
              ),
            ],
            db,
          );
          const keyOf = (item: (typeof written)[number]) => {
            if (item.entity === 'client')
              return idOf.get(item.entityKey) ?? item.entityKey;
            if (item.entity !== 'policy_product') return item.entityKey;
            const [policyNo, productCode, code] = item.entityKey.split('/');
            return `${policyNo}/${productCode}/${(code && idOf.get(code)) ?? ''}`;
          };
          await insertRows(
            db,
            RecordChange,
            written.map((item) => ({
              tenantId: scope.tenantId,
              ...item,
              entityKey: keyOf(item),
              oldValue: item.oldValue ?? null,
              newValue: item.newValue ?? null,
              importId,
              changedBy: actor.id,
              changedAt: now,
            })),
          );
          // CUS-4: agent links follow the data, once every batch is in
          await this.clientsService.recomputeLinks(
            scope,
            plan.touchedClients.flatMap((code) => idOf.get(code) ?? []),
            now,
            db,
          );
          // LEAD-33: linked leads move on once their client has applications or policies
          await this.leadLinks.advanceLinkedLeads(
            scope,
            importId,
            actor.id,
            now,
            db,
          );
        },
      });
    }

    if (planned.activities && planned.activities.activities.length > 0)
      for (const activities of chunks(planned.activities.activities))
        steps.push({
          items: activities.map((item) => ({
            sheet: ACTIVITIES_SHEET.name,
            key: item.activityId,
            isNew: item.isNew,
          })),
          run: async (db) => {
            // Section 12.5: by the Success id; blank cells keep what is stored (IMP-5)
            const rows = activities.map(({ activityId, isNew, set }) => ({
              isNew,
              row: {
                ...set,
                activityId,
                startedAt: new Date(set.startedAt as string),
                ...(set.endedAt
                  ? { endedAt: new Date(set.endedAt as string) }
                  : {}),
                lastImportId: importId,
                lastSeenAt: now,
              },
            }));
            await insertRows(
              db,
              SuccessActivity,
              rows
                .filter((item) => item.isNew)
                .map((item) => ({ tenantId: scope.tenantId, ...item.row })),
            );
            await updateRows(
              db,
              SuccessActivity,
              scope.tenantId,
              'activityId',
              rows.filter((item) => !item.isNew).map((item) => item.row),
            );
          },
        });
    return steps;
  }

  /**
   * Open question I: the background half of a large commit. Each step commits on its own; a step
   * that fails is reported on every row it held, and the others still go in.
   */
  private async writeInBatches(actor: Actor, id: string, now: Date) {
    const scope = this.scopeOf(actor);
    const { current, planned, rowsByKey } = await this.tenantDb.run(
      scope,
      async (db) => {
        const found = await db
          .getRepository(Import)
          .findOneByOrFail({ id, tenantId: scope.tenantId });
        const keyed = await rowsOf<{
          sheet: string;
          key: string;
          row_no: number;
        }>(
          db,
          `SELECT sheet, key, row_no FROM import_rows WHERE tenant_id = $1 AND import_id = $2`,
          [scope.tenantId, id],
        );
        const byKey = new Map<string, number[]>();
        for (const row of keyed) {
          const at = failedKey(row.sheet, row.key);
          byKey.set(at, [...(byKey.get(at) ?? []), row.row_no]);
        }
        return {
          current: found,
          planned: await this.plan(actor, found, db),
          rowsByKey: byKey,
        };
      },
    );
    const write: WriteState = { cycles: 0, failed: new Set() };
    const steps = this.writeSteps(actor, current, planned, now, write, true);
    const progress: ImportProgress = {
      done: 0,
      total: steps.length,
      failedBatches: 0,
      failedRows: 0,
    };
    await this.tellProgress(actor, current, progress);

    for (const step of steps) {
      try {
        await this.tenantDb.run(scope, (db) => step.run(db));
      } catch (error) {
        this.logger.warn(`Import ${id}: a batch failed: ${String(error)}`);
        const errors = this.batchErrors(current, step, rowsByKey);
        for (const item of step.items)
          write.failed.add(failedKey(item.sheet, item.key ?? ''));
        this.uncount(planned, step);
        progress.failedBatches++;
        progress.failedRows += new Set(
          errors
            .filter((item) => item.row >= FIRST_DATA_ROW)
            .map((item) => `${item.sheet}:${item.row}`),
        ).size;
        await this.tenantDb.run(scope, (db) =>
          insertRows(db, ImportError, errors),
        );
      }
      progress.done++;
      await this.tellProgress(actor, current, progress);
    }

    await this.tenantDb.run(scope, async (db) => {
      const locked = await this.owned(actor, id, db, true);
      // The stale-run sweep may have closed it already
      if (locked.status !== ImportStatus.Committing) return;
      await this.finish(actor, locked, planned, write, db, progress);
    });
    this.realtime.toUsers([actor.id], RealtimeEvent.ImportProgress, {
      importId: id,
      ...progress,
      finished: true,
    });
  }

  /** Saves how far a batched write got and tells the uploader's open tabs. */
  private async tellProgress(
    actor: Actor,
    current: Import,
    progress: ImportProgress,
  ) {
    await this.tenantDb.run({ tenantId: current.tenantId }, (db) =>
      db
        .getRepository(Import)
        .update(
          { id: current.id, tenantId: current.tenantId },
          { progress: { ...progress } },
        ),
    );
    this.realtime.toUsers([actor.id], RealtimeEvent.ImportProgress, {
      importId: current.id,
      ...progress,
      finished: false,
    });
  }

  /** IMP-10: one error per row of a batch that could not be saved, so the person can send it again. */
  private batchErrors(
    current: Import,
    step: WriteStep,
    rowsByKey: ReadonlyMap<string, number[]>,
  ): NewError[] {
    const error = (
      sheet: string,
      row: number,
      key: string | null,
    ): NewError => ({
      importId: current.id,
      tenantId: current.tenantId,
      sheet,
      row,
      recordKey: key,
      code: 'batch_failed',
      messageVi: importMessage('batch_failed'),
      severity: 'error',
    });
    if (step.items.length === 0) return [error(step.sheet ?? '', 1, null)];
    const seen = new Set<string>();
    return step.items.flatMap((item) => {
      const rows =
        item.rowNo !== undefined
          ? [item.rowNo]
          : (rowsByKey.get(failedKey(item.sheet, item.key ?? '')) ?? [1]);
      return rows
        .filter((row) => {
          const at = `${item.sheet}:${row}:${row === 1 ? item.key : ''}`;
          if (seen.has(at)) return false;
          seen.add(at);
          return true;
        })
        .map((row) => error(item.sheet, row, item.key ?? null));
    });
  }

  /**
   * The rows of a failed batch are not written. The plan counted them as inserted or updated, so
   * they come off; `withCounts` then counts them as rejected from their errors.
   */
  private uncount(planned: Planned, step: WriteStep): void {
    for (const item of step.items) {
      const counts = planned.results.get(item.sheet)?.counts;
      if (!counts) continue;
      const order: ('inserted' | 'updated' | 'skipped')[] =
        item.isNew === true
          ? ['inserted']
          : item.isNew === false
            ? ['updated', 'skipped']
            : ['updated', 'inserted', 'skipped'];
      const bucket = order.find((name) => counts[name] > 0);
      if (bucket) counts[bucket]--;
    }
  }

  /** The end of every commit: counts, errors, staging cleared, status, and the IMPORT audit (AUD-3). */
  private async finish(
    actor: Actor,
    current: Import,
    planned: Planned,
    write: WriteState,
    db: EntityManager,
    progress?: ImportProgress,
  ): Promise<void> {
    const scope = this.scopeOf(actor);
    const sheets = await this.withCounts(current, planned, db);
    await db.getRepository(Import).update(
      { id: current.id, tenantId: scope.tenantId },
      {
        sheets,
        ...(progress && { status: ImportStatus.Committed, progress }),
      },
    );
    await db.query(
      `DELETE FROM import_errors WHERE tenant_id = $1 AND import_id = $2 AND cross_row`,
      [scope.tenantId, current.id],
    );
    await insertRows(db, ImportError, this.allCrossRowErrors(planned, current));
    await db.query(
      `DELETE FROM import_rows WHERE tenant_id = $1 AND import_id = $2`,
      [scope.tenantId, current.id],
    );

    const totals = {
      inserted: 0,
      updated: 0,
      rejected: 0,
      skipped: 0,
      warnings: 0,
    };
    for (const sheet of sheets)
      for (const key of Object.keys(totals) as (keyof typeof totals)[])
        totals[key] += sheet[key];
    await this.audit.record(
      {
        tenantId: scope.tenantId,
        userId: actor.id,
        action: AuditAction.Import,
        entity: 'import',
        entityId: current.id,
        meta: {
          fileName: current.fileName,
          kind: current.kind,
          ...totals,
          sheets: sheets
            .filter((sheet) => sheet.status === 'READY')
            .map((sheet) => sheet.name),
          cycles: write.cycles,
          ...(progress && {
            batches: progress.total,
            failedBatches: progress.failedBatches,
            failedRows: progress.failedRows,
          }),
        },
      },
      db,
    );
  }

  /**
   * Open question I: a batched write that stopped moving (the server restarted mid-way) is closed
   * as it stands. What was written stays; the person is told the rest did not go in.
   */
  async closeStalled(now = new Date()): Promise<number> {
    const stalled = await this.platformDb.run('scheduler', (db) =>
      rowsOf<{ id: string; tenant_id: string }>(
        db,
        `SELECT id, tenant_id FROM imports WHERE status = 'COMMITTING' AND updated_at < $1`,
        [new Date(now.getTime() - STALLED_MS)],
      ),
    );
    let closed = 0;
    for (const { id, tenant_id: tenantId } of stalled) {
      if (this.running.has(id)) continue;
      const done = await this.tenantDb.run({ tenantId }, async (db) => {
        const [item] = await rowsOf<{
          user_id: string;
          file_name: string;
          kind: string;
          progress: ImportProgress | null;
        }>(
          db,
          `UPDATE imports SET status = 'COMMITTED'
            WHERE tenant_id = $1 AND id = $2 AND status = 'COMMITTING'
            RETURNING user_id, file_name, kind, progress`,
          [tenantId, id],
        );
        if (!item) return false;
        await insertRows(db, ImportError, [
          {
            importId: id,
            tenantId,
            sheet: '',
            row: 1,
            code: 'import_interrupted',
            messageVi: importMessage('import_interrupted'),
            severity: 'error',
          },
        ]);
        await db.query(
          `DELETE FROM import_rows WHERE tenant_id = $1 AND import_id = $2`,
          [tenantId, id],
        );
        await this.audit.record(
          {
            tenantId,
            userId: item.user_id,
            action: AuditAction.Import,
            entity: 'import',
            entityId: id,
            meta: {
              fileName: item.file_name,
              kind: item.kind,
              interrupted: true,
              batches: item.progress?.total ?? 0,
              batchesDone: item.progress?.done ?? 0,
            },
          },
          db,
        );
        return true;
      });
      if (done) closed++;
    }
    return closed;
  }

  private async applyAgentPlan(
    plan: AgentPlan,
    scope: Scope,
    importId: string,
    userId: string,
    now: Date,
    db: EntityManager,
  ): Promise<void> {
    await insertRows(
      db,
      Agent,
      plan.writes
        .filter((write) => write.isNew)
        .map((write) => ({
          ...write.values,
          tenantId: scope.tenantId,
          agentCode: write.code,
          nameNorm: normalizeName(write.values.name!),
          ancestors: [],
          depth: 0,
          managerFixed: false,
          updatedByImportId: importId,
          lastSeenAt: now,
        })),
    );
    await updateRows(
      db,
      Agent,
      scope.tenantId,
      'agentCode',
      plan.writes
        .filter((write) => !write.isNew)
        .map((write) => ({
          ...write.values,
          agentCode: write.code,
          ...(write.values.name && {
            nameNorm: normalizeName(write.values.name),
          }),
          ...Object.fromEntries(write.cleared.map((field) => [field, null])),
          updatedByImportId: importId,
        })),
    );
    await db.query(
      `UPDATE agents SET last_seen_at = $3 WHERE tenant_id = $1 AND agent_code = ANY($2::text[])`,
      [scope.tenantId, plan.seen, now],
    );

    // IMP-21: only fields that really changed
    await insertRows(
      db,
      RecordChange,
      plan.writes.flatMap((write) =>
        write.changes.map((change) => ({
          tenantId: scope.tenantId,
          entity: 'agent',
          entityKey: write.code,
          field: change.field,
          oldValue: change.oldValue ?? null,
          newValue: change.newValue ?? null,
          importId,
          changedBy: userId,
          changedAt: now,
        })),
      ),
    );
  }

  async cancel(actor: Actor, id: string): Promise<void> {
    const scope = this.scopeOf(actor);
    await this.tenantDb.run(scope, async (db) => {
      const current = await this.owned(actor, id, db, true);
      if (
        current.status !== ImportStatus.Parsing &&
        current.status !== ImportStatus.Validated
      )
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ImportNotOpen);
      await db
        .getRepository(Import)
        .update(
          { id: current.id, tenantId: scope.tenantId },
          { status: ImportStatus.Failed },
        );
      await db.query(
        `DELETE FROM import_rows WHERE tenant_id = $1 AND import_id = $2`,
        [scope.tenantId, current.id],
      );
    });
  }

  private toSummary(item: Import, userNames: Map<string, string>) {
    return {
      id: item.id,
      kind: item.kind,
      fileName: item.fileName,
      snapshotDate: item.snapshotDate,
      status: item.status,
      sheets: item.sheets,
      userId: item.userId,
      userName: userNames.get(item.userId) ?? null,
      createdAt: item.createdAt,
      committedAt: item.committedAt,
      progress: item.progress,
    };
  }

  private async userNames(
    scope: Scope,
    ids: string[],
    db: EntityManager,
  ): Promise<Map<string, string>> {
    const users = await rowsOf<{ id: string; name: string }>(
      db,
      `SELECT id, name FROM users WHERE tenant_id = $1 AND id = ANY($2::uuid[])`,
      [scope.tenantId, [...new Set(ids)]],
    );
    return new Map(users.map((user) => [user.id, user.name]));
  }

  /** IMP-12 */
  async list(actor: Actor, query: ListImportsQueryDto) {
    const scope = this.scopeOf(actor);
    if (!this.canRead(actor)) throw forbidden();
    return this.tenantDb.run(scope, async (db) => {
      const where = {
        tenantId: scope.tenantId,
        ...(!actor.permissions.includes(Permission.ImportsViewAll) && {
          userId: actor.id,
        }),
      };
      const [items, total] = await db.getRepository(Import).findAndCount({
        where,
        order: { createdAt: 'DESC', id: 'DESC' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      const names = await this.userNames(
        scope,
        items.map((item) => item.userId),
        db,
      );
      return {
        items: items.map((item) => this.toSummary(item, names)),
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
    });
  }

  async detail(actor: Actor, id: string) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const item = await this.readable(actor, id, db);
      const [counts] = await rowsOf<{
        errors: number;
        warnings: number;
        skipped: number;
      }>(
        db,
        `SELECT count(*) FILTER (WHERE severity = 'error')::int AS errors,
                count(*) FILTER (WHERE severity = 'warning')::int AS warnings,
                count(*) FILTER (WHERE severity = 'skipped')::int AS skipped
           FROM import_errors WHERE tenant_id = $1 AND import_id = $2`,
        [scope.tenantId, item.id],
      );
      const names = await this.userNames(scope, [item.userId], db);
      return {
        ...this.toSummary(item, names),
        errorsTotal: counts.errors,
        warningsTotal: counts.warnings,
        skippedTotal: counts.skipped,
        canCommit: item.userId === actor.id,
      };
    });
  }

  async listErrors(actor: Actor, id: string, query: ListImportErrorsQueryDto) {
    const scope = this.scopeOf(actor);
    return this.tenantDb.run(scope, async (db) => {
      const found = await this.readable(actor, id, db);
      const [items, total] = await db.getRepository(ImportError).findAndCount({
        where: {
          tenantId: scope.tenantId,
          importId: found.id,
          ...(query.sheet && { sheet: query.sheet }),
          ...(query.severity && { severity: query.severity }),
        },
        order: { sheet: 'ASC', row: 'ASC', id: 'ASC' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      });
      return {
        items: items.map((item) => ({
          id: item.id,
          sheet: item.sheet,
          row: item.row,
          column: item.column,
          code: item.code,
          recordKey: item.recordKey,
          messageVi: item.messageVi,
          severity: item.severity,
        })),
        page: query.page,
        pageSize: query.pageSize,
        total,
      };
    });
  }

  async report(actor: Actor, id: string): Promise<Buffer> {
    const scope = this.scopeOf(actor);
    const items = await this.tenantDb.run(scope, async (db) => {
      const found = await this.readable(actor, id, db);
      return db.getRepository(ImportError).find({
        where: { tenantId: scope.tenantId, importId: found.id },
        order: { sheet: 'ASC', row: 'ASC', id: 'ASC' },
      });
    });
    return buildErrorReport(
      items.map((item) => ({
        sheet: item.sheet,
        row: item.row,
        column: item.column ?? undefined,
        recordKey: item.recordKey ?? undefined,
        severity: item.severity,
        messageVi: item.messageVi,
      })),
    );
  }

  template(actor: Actor, kind: ImportKind): Promise<Buffer> {
    this.scopeOf(actor);
    if (!actor.permissions.includes(permissionFor(kind))) throw forbidden();
    return buildTemplate(kind);
  }

  /** IMP-23 and IMP-24: what the mapping screen needs. */
  async leadSetup(actor: Actor) {
    const agents = await this.agentsService.listForPicker(this.scopeOf(actor));
    return {
      columns: LEADS_SHEET.columns.map((column) => ({
        field: column.field,
        header: column.header,
        required: column.requiredColumn,
        aliases: column.aliases ?? [],
      })),
      agents,
    };
  }

  /** IMP-24: automatic matches, for the person to confirm or change. */
  async matchAgents(actor: Actor, values: string[]) {
    const agents = await this.agentsService.listForPicker(this.scopeOf(actor));
    return {
      matches: [...new Set(values)].map((value) => ({
        value,
        agentCode: matchAgent(value, agents)?.agentCode ?? null,
      })),
    };
  }
}
