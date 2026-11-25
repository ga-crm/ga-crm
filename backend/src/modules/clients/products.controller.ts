import { Controller, Get, Param } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentActor, SESSION_COOKIE } from '../../common/auth.decorators.js';
import { forbidden } from '../../common/errors.js';
import type { Actor } from '../../common/rbac.js';
import { TenantDb } from '../../core/tenancy/tenant-db.js';
import { toProductView } from '../products/product.entity.js';
import { ProductsService } from '../products/products.service.js';
import { ClientsService } from './clients.service.js';

/** TENANT-5: the shared product catalogue as everyone in a GA reads it. */
@ApiTags('Products')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('products')
export class ProductsController {
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly products: ProductsService,
    private readonly clients: ClientsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Danh mục sản phẩm đang bán (dùng chung mọi GA)',
    description: 'Không có quy tắc phù hợp (fit_rule, trigger_event).',
  })
  async list(@CurrentActor() actor: Actor) {
    if (!actor.tenantId) throw forbidden();
    return this.tenantDb.run({ tenantId: actor.tenantId }, async (db) => ({
      items: (await this.products.shown(db)).map(toProductView),
    }));
  }

  @Get(':code')
  @ApiOperation({
    summary:
      'Một sản phẩm và các hợp đồng có sản phẩm này trong phạm vi người xem',
    description:
      'policies là null với Marketing và Admin (không có sổ khách hàng, CUS-5).',
  })
  @ApiParam({ name: 'code', example: 'P001' })
  product(@CurrentActor() actor: Actor, @Param('code') code: string) {
    return this.clients.product(actor, code);
  }
}
