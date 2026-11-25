import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Module,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentActor,
  RequireRoles,
  SESSION_COOKIE,
} from '../../common/auth.decorators.js';
import { Role } from '../../common/rbac.js';
import type { Actor } from '../../common/rbac.js';
import { SaveProductsDto, UpdateProductDto } from './products.dto.js';
import { ProductsService } from './products.service.js';

/** TENANT-5: the Platform Admin keeps the product catalogue every GA shares. */
@ApiTags('Platform')
@ApiCookieAuth(SESSION_COOKIE)
@ApiForbiddenResponse({ description: 'forbidden: chỉ Quản trị nền tảng' })
@RequireRoles(Role.PlatformAdmin)
@Controller('platform/products')
export class PlatformProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Danh mục sản phẩm (cả sản phẩm đã ẩn)' })
  async list() {
    return { items: await this.products.listAll() };
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Thêm / cập nhật sản phẩm theo mã (form hoặc file 11_Products)',
    description:
      'rows 1-500, upsert theo productCode. Có kiểm toán (IMPORT products khi fromFile).',
  })
  save(@CurrentActor() actor: Actor, @Body() dto: SaveProductsDto) {
    return this.products.save(actor, dto);
  }

  @Patch(':code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Ẩn / hiện sản phẩm' })
  @ApiNoContentResponse()
  async update(
    @CurrentActor() actor: Actor,
    @Param('code') code: string,
    @Body() dto: UpdateProductDto,
  ): Promise<void> {
    await this.products.setActive(actor, code, dto.active);
  }
}

/** TENANT-5: the shared catalogue; clients and leads read it, the platform console writes it. */
@Module({
  controllers: [PlatformProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
