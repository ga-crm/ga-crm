import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ApiException,
  ErrorCode,
  forbidden,
  notFound,
  pgError,
} from '../../common/errors.js';
import type { Actor, Scope } from '../../common/rbac.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { SavedFilter } from './infrastructure/lead.entities.js';
import type { SaveFilterDto } from './leads.dto.js';

const MAX_FILTERS = 20;
const MAX_PARAMS = 20;
const KEY = /^[a-zA-Z]{1,30}$/;

/** LEAD-38 NEW: each person's named filters of the lead list. Private to their owner. */
@Injectable()
export class SavedFiltersService {
  constructor(private readonly tenantDb: TenantDb) {}

  private owner(actor: Actor) {
    if (!actor.tenantId) throw forbidden();
    const scope: Scope = { tenantId: actor.tenantId };
    return {
      scope,
      where: { tenantId: actor.tenantId, userId: actor.id, screen: 'leads' },
    };
  }

  async list(actor: Actor) {
    const { scope, where } = this.owner(actor);
    const items = await this.tenantDb.run(scope, (db) =>
      db.getRepository(SavedFilter).find({ where, order: { name: 'ASC' } }),
    );
    return {
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        query: item.query,
      })),
    };
  }

  async save(actor: Actor, dto: SaveFilterDto): Promise<{ id: string }> {
    const { scope, where } = this.owner(actor);
    const entries = Object.entries(dto.query ?? {});
    // The page and dialogs are not part of a filter
    const query = Object.fromEntries(
      entries.filter(([key]) => !['page', 'create', 'dialog'].includes(key)),
    );
    if (
      entries.length > MAX_PARAMS ||
      Object.entries(query).some(
        ([key, value]) =>
          !KEY.test(key) || typeof value !== 'string' || value.length > 200,
      )
    )
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput);
    try {
      return await this.tenantDb.run(scope, async (db) => {
        const filters = db.getRepository(SavedFilter);
        if ((await filters.countBy(where)) >= MAX_FILTERS)
          throw new ApiException(HttpStatus.CONFLICT, ErrorCode.FilterLimit);
        const created = await filters.save(
          filters.create({
            ...where,
            name: dto.name,
            query: query as Record<string, string>,
            createdAt: new Date(),
          }),
        );
        return { id: created.id };
      });
    } catch (error) {
      if (pgError(error)?.code === '23505')
        throw new ApiException(HttpStatus.CONFLICT, ErrorCode.FilterExists);
      throw error;
    }
  }

  async remove(actor: Actor, id: string): Promise<void> {
    const { scope, where } = this.owner(actor);
    const { affected } = await this.tenantDb.run(scope, (db) =>
      db.getRepository(SavedFilter).delete({ ...where, id }),
    );
    if (!affected) throw notFound();
  }
}
