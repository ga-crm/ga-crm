import { Controller, Get, Global, Module, Param } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { SESSION_COOKIE } from '../../common/auth.decorators.js';
import { notFound } from '../../common/errors.js';
import { GeoService } from './geo.service.js';

/** Decided 26/11/2026: provinces and communes after 1 July 2025, for the lead address. */
@ApiTags('Geo')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('geo')
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  @Get('provinces')
  @ApiOperation({
    summary: '34 tỉnh / thành phố sau sắp xếp 1/7/2025',
    description: 'Dữ liệu tham chiếu dùng chung, sắp theo tên.',
  })
  provinces() {
    return { items: this.geo.listProvinces() };
  }

  @Get('provinces/:code/wards')
  @ApiOperation({ summary: 'Xã / phường / đặc khu của một tỉnh' })
  @ApiParam({ name: 'code', example: '01' })
  @ApiNotFoundResponse({ description: 'not_found: mã tỉnh không có' })
  wards(@Param('code') code: string) {
    const items = this.geo.listWards(code);
    if (!items) throw notFound();
    return { items };
  }
}

@Global()
@Module({
  controllers: [GeoController],
  providers: [GeoService],
  exports: [GeoService],
})
export class GeoModule {}
