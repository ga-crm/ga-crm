import { HttpStatus, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  ApiException,
  ErrorCode,
  notFound,
  pgError,
} from '../../common/errors.js';
import { codeFromLabel, normalizeName } from '../../common/normalize.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { LeadOption, TEXT_CODE_KINDS } from './infrastructure/lead.entities.js';
import type { LeadOptionKind } from './infrastructure/lead.entities.js';
import type {
  CreateLeadOptionDto,
  UpdateLeadOptionDto,
} from './lead-options.dto.js';

interface Default {
  code: string;
  label: string;
  isOpportunity?: boolean;
  isFinal?: boolean;
}

/** OPT-2: every GA starts with the codes that the pipeline, reports and imports understand. */
const DEFAULTS: Record<'interest' | 'care_status', readonly Default[]> = {
  interest: [
    { code: 'NOT_REACHED', label: 'Chưa nghe máy' },
    { code: 'UNDETERMINED', label: 'Chưa xác định' },
    { code: 'NOT_INTERESTED', label: 'Không quan tâm', isFinal: true },
    {
      code: 'LIFE',
      label: 'Quan tâm nhân thọ',
      isOpportunity: true,
      isFinal: true,
    },
    {
      code: 'HEALTH_CARD',
      label: 'Quan tâm thẻ rời',
      isOpportunity: true,
      isFinal: true,
    },
  ],
  care_status: [
    { code: 'CARING', label: 'Đang chăm sóc' },
    { code: 'WON', label: 'Đã chốt' },
    { code: 'DROPPED', label: 'Chốt xịt' },
    { code: 'NOT_INTERESTED', label: 'Không quan tâm' },
  ],
};

/** The lead column each list feeds. */
const LEAD_COLUMN: Record<LeadOptionKind, string> = {
  interest: 'interest',
  care_status: 'care_status',
  source: 'source',
  phone_source: 'phone_source',
  lost_reason: 'lost_reason',
};

/** Open question D: at most this many values in one "add many". */
export const MAX_BULK_OPTIONS = 200;

const isDuplicate = (error: unknown) => pgError(error)?.code === '23505';

/** OPT-3: the longest label a catalogue value may have. */
const SOURCE_LABEL_MAX = 60;

@Injectable()
export class LeadOptionsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
  ) {}

  private repo(db: EntityManager) {
    return db.getRepository(LeadOption);
  }

  /**
   * OPT-9: everyone in the GA reads the catalogue. A GA without one gets the defaults first, with
   * the sources its leads already use (OPT-2), so existing GAs need no separate migration.
   */
  list(scope: Scope, outer?: EntityManager): Promise<LeadOption[]> {
    return this.tenantDb.run(
      scope,
      async (db) => {
        const find = () =>
          this.repo(db).find({
            where: { tenantId: scope.tenantId },
            order: { kind: 'ASC', sortOrder: 'ASC', id: 'ASC' },
          });
        const items = await find();
        if (items.some((item) => item.builtIn)) return items;
        await this.ensureDefaults(scope, db);
        return find();
      },
      outer,
    );
  }

  /** TENANT-2 + OPT-2. Idempotent, so concurrent first reads cannot duplicate anything. */
  async ensureDefaults(scope: Scope, db: EntityManager): Promise<void> {
    const sources = (
      await rowsOf<{ source: string }>(
        db,
        `SELECT DISTINCT source FROM leads WHERE tenant_id = $1`,
        [scope.tenantId],
      )
    ).map((row) => row.source);
    const rows: (Default & {
      kind: LeadOptionKind;
      builtIn: boolean;
      sortOrder: number;
    })[] = [
      ...(['interest', 'care_status'] as const).flatMap((kind) =>
        DEFAULTS[kind].map((item, index) => ({
          kind,
          ...item,
          builtIn: true,
          sortOrder: index + 1,
        })),
      ),
      ...[...new Set(sources.filter(Boolean))]
        .sort((a, b) => a.localeCompare(b))
        .map((label, index) => ({
          kind: 'source' as const,
          code: label,
          label,
          builtIn: false,
          sortOrder: index + 1,
        })),
    ];
    const seen = new Set<string>();
    const values = rows
      .filter((row) => {
        // Two sources that differ only in case or marks become one value
        const key = `${row.kind}:${normalizeName(row.label)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((row) => ({
        tenantId: scope.tenantId,
        kind: row.kind,
        code: row.code,
        label: row.label,
        labelNorm: normalizeName(row.label),
        isOpportunity: row.isOpportunity ?? false,
        isFinal: row.isFinal ?? false,
        active: true,
        sortOrder: row.sortOrder,
        builtIn: row.builtIn,
      }));
    // Another request may create the same values at the same moment
    await db
      .createQueryBuilder()
      .insert()
      .into(LeadOption)
      .values(values)
      .orIgnore()
      .execute();
  }

  /** OPT-3, OPT-4: GA_HEAD only (PERM-3). */
  async create(
    scope: Scope,
    actor: Actor,
    dto: CreateLeadOptionDto,
  ): Promise<LeadOption> {
    await this.list(scope);
    const label = dto.label.trim();
    // OPT-3: sources are written as text in files, so a source's code is its label
    const code = TEXT_CODE_KINDS.includes(dto.kind) ? label : codeFromLabel(label);
    if (!code)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput);
    const interest = dto.kind === 'interest';
    try {
      return await this.tenantDb.run(scope, async (db) => {
        const [last] = await rowsOf<{ max: number | null }>(
          db,
          `SELECT max(sort_order) AS max FROM lead_options WHERE tenant_id = $1 AND kind = $2`,
          [scope.tenantId, dto.kind],
        );
        const option = await this.repo(db).save(
          this.repo(db).create({
            tenantId: scope.tenantId,
            kind: dto.kind,
            code,
            label,
            labelNorm: normalizeName(label),
            isOpportunity: interest && !!dto.isOpportunity,
            isFinal: interest && !!dto.isFinal,
            active: true,
            sortOrder: (last?.max ?? 0) + 1,
            builtIn: false,
          }),
        );
        // OPT-12
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: actor.id,
            action: AuditAction.Create,
            entity: 'lead_option',
            entityId: option.id,
            meta: { kind: dto.kind, code, label },
          },
          db,
        );
        return option;
      });
    } catch (error) {
      if (isDuplicate(error))
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.OptionExists);
      throw error;
    }
  }

  /**
   * Open question D: the GA head adds a whole list at once (pasted or from a file). Labels that are
   * already in the list, or repeated in the input, are skipped (OPT-4 compares them without case or
   * diacritics); the rest are added in the given order, each audited like a single add (OPT-12).
   */
  async createMany(
    scope: Scope,
    actor: Actor,
    kind: LeadOptionKind,
    labels: string[],
  ): Promise<{ created: string[]; skipped: string[] }> {
    await this.list(scope);
    return this.tenantDb.run(scope, async (db) => {
      const existing = new Set(
        (
          await rowsOf<{ label_norm: string }>(
            db,
            `SELECT label_norm FROM lead_options WHERE tenant_id = $1 AND kind = $2`,
            [scope.tenantId, kind],
          )
        ).map((row) => row.label_norm),
      );
      const [last] = await rowsOf<{ max: number | null }>(
        db,
        `SELECT max(sort_order) AS max FROM lead_options WHERE tenant_id = $1 AND kind = $2`,
        [scope.tenantId, kind],
      );
      let sortOrder = last?.max ?? 0;
      const created: string[] = [];
      const skipped: string[] = [];
      for (const raw of labels) {
        const label = raw.trim();
        const labelNorm = normalizeName(label);
        const code = TEXT_CODE_KINDS.includes(kind) ? label : codeFromLabel(label);
        if (!label || !code || existing.has(labelNorm)) {
          if (label) skipped.push(label);
          continue;
        }
        existing.add(labelNorm);
        const option = await this.repo(db).save(
          this.repo(db).create({
            tenantId: scope.tenantId,
            kind,
            code,
            label,
            labelNorm,
            isOpportunity: false,
            isFinal: false,
            active: true,
            sortOrder: ++sortOrder,
            builtIn: false,
          }),
        );
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: actor.id,
            action: AuditAction.Create,
            entity: 'lead_option',
            entityId: option.id,
            meta: { kind, code, label, bulk: true },
          },
          db,
        );
        created.push(label);
      }
      return { created, skipped };
    });
  }

  /** OPT-3: renaming changes the label only; the code that leads carry stays. */
  async update(
    scope: Scope,
    actor: Actor,
    id: string,
    dto: UpdateLeadOptionDto,
  ): Promise<LeadOption> {
    try {
      return await this.tenantDb.run(scope, async (db) => {
        const option = await this.getById(scope, id, db);
        const before = this.snapshot(option);
        if (dto.label !== undefined) {
          option.label = dto.label.trim();
          option.labelNorm = normalizeName(option.label);
        }
        if (option.kind === 'interest') {
          if (dto.isOpportunity !== undefined)
            option.isOpportunity = dto.isOpportunity;
          if (dto.isFinal !== undefined) option.isFinal = dto.isFinal;
        }
        if (dto.active !== undefined) option.active = dto.active;
        if (dto.sortOrder !== undefined) option.sortOrder = dto.sortOrder;
        await this.repo(db).update(
          { id: option.id },
          {
            label: option.label,
            labelNorm: option.labelNorm,
            isOpportunity: option.isOpportunity,
            isFinal: option.isFinal,
            active: option.active,
            sortOrder: option.sortOrder,
          },
        );
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: actor.id,
            action: AuditAction.Update,
            entity: 'lead_option',
            entityId: option.id,
            meta: { before, after: this.snapshot(option) },
          },
          db,
        );
        return option;
      });
    } catch (error) {
      if (isDuplicate(error))
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.OptionExists);
      throw error;
    }
  }

  /** OPT-5: only a value the GA added and no lead uses can go; anything else is hidden instead. */
  async remove(scope: Scope, actor: Actor, id: string): Promise<void> {
    await this.tenantDb.run(scope, async (db) => {
      const option = await this.getById(scope, id, db);
      if (option.builtIn)
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.OptionBuiltIn);
      const [used] = await rowsOf<{ used: boolean }>(
        db,
        `SELECT EXISTS (SELECT 1 FROM leads WHERE tenant_id = $1 AND ${LEAD_COLUMN[option.kind]} = $2) AS used`,
        [scope.tenantId, option.code],
      );
      if (used.used)
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.OptionInUse);
      await this.repo(db).delete({ id: option.id, tenantId: scope.tenantId });
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Delete,
          entity: 'lead_option',
          entityId: option.id,
          meta: this.snapshot(option),
        },
        db,
      );
    });
  }

  /**
   * OPT-8 + LEAD-15: a value set by hand must be in the catalogue and shown; the value a lead
   * already carries stays valid even once hidden, so editing another field never fails on it.
   */
  async assertUsable(
    scope: Scope,
    kind: 'interest' | 'care_status',
    code: string,
    current: string | null | undefined,
    db?: EntityManager,
  ): Promise<void> {
    if (code === current) return;
    await this.tenantDb.run(
      scope,
      async (tx) => {
        await this.list(scope, tx);
        const found = await this.repo(tx).existsBy({
          tenantId: scope.tenantId,
          kind,
          code,
          active: true,
        });
        if (!found)
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            ErrorCode.UnknownOption,
          );
      },
      db,
    );
  }

  /** LEAD-14: whether the interest a lead carries locks it for agents. */
  async isFinalInterest(
    scope: Scope,
    code: string | null | undefined,
    db?: EntityManager,
  ): Promise<boolean> {
    if (!code) return false;
    return this.tenantDb.run(
      scope,
      async (tx) => {
        await this.list(scope, tx);
        const option = await this.repo(tx).findOneBy({
          tenantId: scope.tenantId,
          kind: 'interest',
          code,
        });
        return !!option?.isFinal;
      },
      db,
    );
  }

  /**
   * The source to store for a label typed or chosen by hand. A known source keeps its code, a hidden
   * one is refused (OPT-8), and a new one joins the catalogue the way a file's new source does
   * (IMP-25). OPT-13, decided 24/11/2026: whoever makes a lead may bring a new source, as long as
   * it fits a catalogue label (OPT-3).
   */
  async resolveSource(
    scope: Scope,
    actor: Actor,
    label: string,
    db: EntityManager,
  ): Promise<string> {
    const [code] = await this.registerSources(
      scope,
      actor.id,
      [label],
      db,
      true,
    );
    return code;
  }

  /**
   * IMP-25: sources from a file. Each label maps to the catalogue value with the same label (any
   * case or marks); labels the GA does not have yet are added. Returns codes in the same order.
   */
  async registerSources(
    scope: Scope,
    userId: string | null,
    labels: readonly string[],
    db: EntityManager,
    refuseHidden = false,
  ): Promise<string[]> {
    await this.list(scope, db);
    const known = await this.repo(db).findBy({
      tenantId: scope.tenantId,
      kind: 'source',
    });
    // By label first; a renamed source is still found by its code (OPT-3: renaming keeps the code)
    const byNorm = new Map(
      [
        ...known.map((item) => [normalizeName(item.code), item] as const),
        ...known.map((item) => [item.labelNorm, item] as const),
      ].map(([norm, item]) => [norm, { code: item.code, active: item.active }]),
    );
    let sortOrder = Math.max(0, ...known.map((item) => item.sortOrder));
    const added: Partial<LeadOption>[] = [];
    const codes = labels.map((raw) => {
      const label = raw.trim();
      const norm = normalizeName(label);
      const existing = byNorm.get(norm);
      if (existing) {
        if (refuseHidden && !existing.active)
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            ErrorCode.UnknownOption,
          );
        return existing.code;
      }
      // OPT-3: a value added by hand is a catalogue label; files keep whatever they carry (IMP-25)
      if (refuseHidden && label.length > SOURCE_LABEL_MAX)
        throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput, {
          issues: [
            {
              path: 'source',
              message: `source must be shorter than or equal to ${SOURCE_LABEL_MAX} characters`,
            },
          ],
        });
      byNorm.set(norm, { code: label, active: true });
      added.push({
        tenantId: scope.tenantId,
        kind: 'source',
        code: label,
        label,
        labelNorm: norm,
        isOpportunity: false,
        isFinal: false,
        active: true,
        sortOrder: ++sortOrder,
        builtIn: false,
      });
      return label;
    });
    if (added.length > 0) {
      const created = await this.repo(db).save(
        added.map((item) => this.repo(db).create(item)),
      );
      for (const option of created)
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId,
            action: AuditAction.Create,
            entity: 'lead_option',
            entityId: option.id,
            meta: { kind: 'source', code: option.code, label: option.label },
          },
          db,
        );
    }
    return codes;
  }

  /** IMP-25 + OPT-10: the active interest and care labels a GA writes in its files, by code. */
  async importLabels(scope: Scope): Promise<{
    interest: Map<string, string>;
    care_status: Map<string, string>;
    hidden: { interest: Set<string>; care_status: Set<string> };
  }> {
    const items = await this.list(scope);
    const lists = {
      interest: new Map<string, string>(),
      care_status: new Map<string, string>(),
      hidden: {
        interest: new Set<string>(),
        care_status: new Set<string>(),
      },
    };
    for (const item of items) {
      // Only interest and care status are matched by label in files
      if (item.kind !== 'interest' && item.kind !== 'care_status') continue;
      if (item.active) lists[item.kind].set(item.labelNorm, item.code);
      else lists.hidden[item.kind].add(item.code);
    }
    return lists;
  }

  private async getById(
    scope: Scope,
    id: string,
    db: EntityManager,
  ): Promise<LeadOption> {
    const option = await this.repo(db).findOneBy({
      id,
      tenantId: scope.tenantId,
    });
    if (!option) throw notFound(); // TEN-3
    return option;
  }

  private snapshot(option: LeadOption) {
    return {
      kind: option.kind,
      code: option.code,
      label: option.label,
      isOpportunity: option.isOpportunity,
      isFinal: option.isFinal,
      active: option.active,
      sortOrder: option.sortOrder,
    };
  }
}
