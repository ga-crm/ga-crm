import { HttpStatus, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { ApiException, ErrorCode, notFound } from '../../common/errors.js';
import { normalizeName } from '../../common/normalize.js';
import type { Actor } from '../../common/rbac.js';
import { PlatformDb } from '../../core/tenancy/platform-db.js';
import { AuditAction, AuditService } from '../audit/audit.service.js';
import { Product } from './product.entity.js';
import type { ProductRowDto, SaveProductsDto } from './products.dto.js';

/** The columns a row of the file or form writes. */
const FIELDS = [
  'productName',
  'productRole',
  'category',
  'minEntryAge',
  'maxEntryAge',
  'maxCoverAge',
  'gender',
  'waitingPeriod',
  'keyBenefits',
  'fitRule',
  'triggerEvent',
  'ruleStatus',
] as const;

/**
 * TENANT-5 (decided 25/11/2026): the DLVN product catalogue shared by every GA. The Platform Admin
 * writes it through the platform connection; GA code reads it in its own transaction (the table
 * lets every tenant SELECT), through the helpers below that take the caller's `db`.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly platformDb: PlatformDb,
    private readonly audit: AuditService,
  ) {}

  /** Platform console: every product, hidden ones too. */
  listAll(): Promise<Product[]> {
    return this.platformDb.run('platform-console', (db) =>
      db.getRepository(Product).find({ order: { nameNorm: 'ASC' } }),
    );
  }

  /** TENANT-5: upsert by product code; one audit entry per call. */
  async save(
    actor: Actor,
    dto: SaveProductsDto,
  ): Promise<{ inserted: number; updated: number }> {
    const codes = dto.rows.map((row) => row.productCode);
    if (new Set(codes).size !== codes.length)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.InvalidInput, {
        issues: [{ path: 'rows', message: 'duplicate product_code' }],
      });
    return this.platformDb.run('platform-console', async (db) => {
      const repo = db.getRepository(Product);
      const known = new Set(
        (await repo.findBy({ productCode: In(codes) })).map(
          (product) => product.productCode,
        ),
      );
      const now = new Date();
      const values = (row: ProductRowDto) => ({
        ...Object.fromEntries(
          FIELDS.filter((field) => row[field] !== undefined).map((field) => [
            field,
            row[field],
          ]),
        ),
        nameNorm: normalizeName(row.productName),
        updatedAt: now,
        updatedBy: actor.id,
      });
      for (const row of dto.rows) {
        if (known.has(row.productCode))
          await repo.update({ productCode: row.productCode }, values(row));
        else
          await repo.insert({
            productCode: row.productCode,
            active: true,
            ruleStatus: 'DRAFT',
            createdAt: now,
            ...values(row),
          });
      }
      const inserted = codes.filter((code) => !known.has(code)).length;
      const updated = codes.length - inserted;
      await this.audit.record(
        {
          tenantId: null,
          userId: actor.id,
          action: dto.fromFile
            ? AuditAction.Import
            : inserted
              ? AuditAction.Create
              : AuditAction.Update,
          entity: 'products',
          ...(codes.length === 1 && !dto.fromFile && { entityId: codes[0] }),
          meta: { inserted, updated, ...(codes.length <= 20 && { codes }) },
        },
        db,
      );
      return { inserted, updated };
    });
  }

  /** Hide or show a product. */
  async setActive(actor: Actor, code: string, active: boolean): Promise<void> {
    await this.platformDb.run('platform-console', async (db) => {
      const result = await db
        .getRepository(Product)
        .update(
          { productCode: code },
          { active, updatedAt: new Date(), updatedBy: actor.id },
        );
      if (!result.affected) throw notFound();
      await this.audit.record(
        {
          tenantId: null,
          userId: actor.id,
          action: AuditAction.Update,
          entity: 'products',
          entityId: code,
          meta: { active },
        },
        db,
      );
    });
  }

  // ---- Reads inside a GA's transaction ------------------------------------------------------

  /** The products shown to GA users, by name. */
  shown(db: EntityManager): Promise<Product[]> {
    return db
      .getRepository(Product)
      .find({ where: { active: true }, order: { nameNorm: 'ASC' } });
  }

  /** The products with these codes, hidden ones too (to name what stored data carries). */
  async byCode(
    db: EntityManager,
    codes: readonly string[],
  ): Promise<Map<string, Product>> {
    const wanted = [...new Set(codes.filter(Boolean))];
    if (wanted.length === 0) return new Map();
    const found = await db
      .getRepository(Product)
      .findBy({ productCode: In(wanted) });
    return new Map(found.map((product) => [product.productCode, product]));
  }

  /**
   * The shown products a request names, or `400 unknown_product` pointing at the first missing
   * one. `keep` are codes already stored on the record, accepted even when no longer shown.
   */
  async usable(
    db: EntityManager,
    codes: readonly { code: string; path: string }[],
    keep: ReadonlySet<string> = new Set(),
  ): Promise<Map<string, Product>> {
    const found = await this.byCode(
      db,
      codes.map((item) => item.code),
    );
    const missing = codes.find(
      (item) =>
        !keep.has(item.code) && !(found.get(item.code)?.active ?? false),
    );
    if (missing)
      throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.UnknownProduct, {
        issues: [{ path: missing.path, message: ErrorCode.UnknownProduct }],
      });
    return found;
  }

  /** 13_Leads: the product a cell names, by code or by name (no marks, any case). */
  async matchText(
    db: EntityManager,
    texts: readonly string[],
  ): Promise<Map<string, string>> {
    const products = await this.shown(db);
    const byKey = new Map<string, string>();
    for (const product of products) {
      byKey.set(normalizeName(product.productCode), product.productCode);
      byKey.set(product.nameNorm, product.productCode);
    }
    const result = new Map<string, string>();
    for (const text of texts) {
      const code = byKey.get(normalizeName(text));
      if (code) result.set(text, code);
    }
    return result;
  }
}
