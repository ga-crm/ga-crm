import { HttpStatus, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import {
  ApiException,
  ErrorCode,
  forbidden,
  notFound,
  pgError,
} from '../../common/errors.js';
import { codeFromLabel } from '../../common/normalize.js';
import { Permission, Role } from '../../common/rbac.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { rowsOf } from '../../core/persistence/sql.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { InsuranceProgram } from './infrastructure/client.entities.js';
import type { CreateProgramDto, UpdateProgramDto } from './programs.dto.js';

/** PRG-2: every GA starts with these three. */
const DEFAULTS = [
  { code: 'AN_TAM_SONG_HANH', label: 'An Tâm Song Hành', productRole: 'Chính' },
  {
    code: 'BH_CHAM_SOC_SUC_KHOE',
    label: 'BH Chăm Sóc Sức Khoẻ',
    productRole: 'Bổ trợ',
  },
  {
    code: 'BH_TAI_NAN_CAO_CAP',
    label: 'BH Tai Nạn Cao Cấp',
    productRole: 'Bổ trợ',
  },
] as const;

const isDuplicate = (error: unknown) => pgError(error)?.code === '23505';

@Injectable()
export class ProgramsService {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly audit: AuditService,
  ) {}

  private repo(db: EntityManager) {
    return db.getRepository(InsuranceProgram);
  }

  /** PRG-3: catalog.manage (Admin by default) and GA_HEAD edit; everyone in the GA reads. */
  assertCanManage(actor: Actor): void {
    if (
      !actor.roles.includes(Role.GAD) &&
      !actor.permissions.includes(Permission.CatalogManage)
    )
      throw forbidden();
  }

  /** PRG-2: a GA without programmes gets the three defaults on first read. Idempotent. */
  list(scope: Scope, outer?: EntityManager): Promise<InsuranceProgram[]> {
    return this.tenantDb.run(
      scope,
      async (db) => {
        const find = () =>
          this.repo(db).find({
            where: { tenantId: scope.tenantId },
            order: { sortOrder: 'ASC', id: 'ASC' },
          });
        const items = await find();
        if (items.length > 0) return items;
        await db
          .createQueryBuilder()
          .insert()
          .into(InsuranceProgram)
          .values(
            DEFAULTS.map((item, index) => ({
              tenantId: scope.tenantId,
              ...item,
              active: true,
              sortOrder: index + 1,
            })),
          )
          .orIgnore()
          .execute();
        return find();
      },
      outer,
    );
  }

  /** PRD-2: a programme set by hand must be in the catalogue and shown. */
  async usable(
    scope: Scope,
    codes: readonly string[],
    db?: EntityManager,
  ): Promise<Map<string, InsuranceProgram>> {
    const items = await this.list(scope, db);
    const found = new Map(
      items.filter((item) => item.active).map((item) => [item.code, item]),
    );
    if (codes.some((code) => !found.has(code)))
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.UnknownProgram);
    return found;
  }

  /** PRG-4 */
  async create(
    scope: Scope,
    actor: Actor,
    dto: CreateProgramDto,
  ): Promise<InsuranceProgram> {
    this.assertCanManage(actor);
    await this.list(scope);
    const code = codeFromLabel(dto.label);
    if (!code)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput);
    try {
      return await this.tenantDb.run(scope, async (db) => {
        const [last] = await rowsOf<{ max: number | null }>(
          db,
          `SELECT max(sort_order) AS max FROM insurance_programs WHERE tenant_id = $1`,
          [scope.tenantId],
        );
        const program = await this.repo(db).save(
          this.repo(db).create({
            tenantId: scope.tenantId,
            code,
            label: dto.label,
            productRole: dto.productRole,
            productCode: dto.productCode || null,
            active: true,
            sortOrder: (last?.max ?? 0) + 1,
          }),
        );
        // PRG-8
        await this.audit.record(
          {
            tenantId: scope.tenantId,
            userId: actor.id,
            action: AuditAction.Create,
            entity: 'insurance_program',
            entityId: program.id,
            meta: { code, label: dto.label },
          },
          db,
        );
        return program;
      });
    } catch (error) {
      if (isDuplicate(error))
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ProgramExists);
      throw error;
    }
  }

  /** PRG-4 + PRG-5: renaming keeps the code; hiding leaves the policies that carry it alone. */
  async update(
    scope: Scope,
    actor: Actor,
    id: string,
    dto: UpdateProgramDto,
  ): Promise<InsuranceProgram> {
    this.assertCanManage(actor);
    return this.tenantDb.run(scope, async (db) => {
      const program = await this.getById(scope, id, db);
      const before = this.snapshot(program);
      if (dto.label !== undefined) program.label = dto.label;
      if (dto.productRole !== undefined) program.productRole = dto.productRole;
      if (dto.productCode !== undefined)
        program.productCode = dto.productCode || null;
      if (dto.active !== undefined) program.active = dto.active;
      if (dto.sortOrder !== undefined) program.sortOrder = dto.sortOrder;
      await this.repo(db).update(
        { id: program.id },
        {
          label: program.label,
          productRole: program.productRole,
          productCode: program.productCode,
          active: program.active,
          sortOrder: program.sortOrder,
        },
      );
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'insurance_program',
          entityId: program.id,
          meta: { before, after: this.snapshot(program) },
        },
        db,
      );
      return program;
    });
  }

  /** PRG-5: a programme on a policy can only be hidden. */
  async remove(scope: Scope, actor: Actor, id: string): Promise<void> {
    this.assertCanManage(actor);
    await this.tenantDb.run(scope, async (db) => {
      const program = await this.getById(scope, id, db);
      const [used] = await rowsOf<{ used: boolean }>(
        db,
        `SELECT EXISTS (SELECT 1 FROM policies
                         WHERE tenant_id = $1 AND products @> jsonb_build_array(jsonb_build_object('programCode', $2::text))) AS used`,
        [scope.tenantId, program.code],
      );
      if (used.used)
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.ProgramInUse);
      await this.repo(db).delete({ id: program.id, tenantId: scope.tenantId });
      await this.audit.record(
        {
          tenantId: scope.tenantId,
          userId: actor.id,
          action: AuditAction.Delete,
          entity: 'insurance_program',
          entityId: program.id,
          meta: this.snapshot(program),
        },
        db,
      );
    });
  }

  private async getById(scope: Scope, id: string, db: EntityManager) {
    const program = await this.repo(db).findOneBy({
      id,
      tenantId: scope.tenantId,
    });
    if (!program) throw notFound(); // TEN-3
    return program;
  }

  private snapshot(program: InsuranceProgram) {
    return {
      code: program.code,
      label: program.label,
      productRole: program.productRole,
      productCode: program.productCode,
      active: program.active,
      sortOrder: program.sortOrder,
    };
  }
}
