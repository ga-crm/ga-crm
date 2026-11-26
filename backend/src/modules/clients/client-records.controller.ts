import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentActor, SESSION_COOKIE } from '../../common/auth.decorators.js';
import { IdPipe } from '../../common/pagination.js';
import type { Actor } from '../../common/rbac.js';
import {
  CareRecordDto,
  ReferralDto,
  UpdateCareRecordDto,
  UpdateReferralDto,
} from './client-records.dto.js';
import { ClientRecordsService } from './client-records.service.js';

/**
 * Decided 26/11/2026: the care a GA records for a client (claims, events, gifts, signing gifts)
 * and the people the client referred. The lists come with `GET /clients/:clientId`; only whoever
 * may edit the client writes here (CUS-6).
 */
@ApiTags('Clients')
@ApiCookieAuth(SESSION_COOKIE)
@ApiParam({ name: 'clientId', format: 'uuid' })
@ApiNotFoundResponse({
  description: 'not_found (kể cả khách ngoài phạm vi hoặc GA khác)',
})
@Controller('clients/:clientId')
export class ClientRecordsController {
  constructor(private readonly records: ClientRecordsService) {}

  @Post('care-records')
  @ApiOperation({
    summary: 'Thêm một mục chăm sóc',
    description:
      'CLAIM cần `place`, GIFT và SIGNING_GIFT cần `title`, SIGNING_CASH cần `amountVnd`; `policyNo` phải là hợp đồng của khách. Lỗi: `invalid_input` kèm `issues`.',
  })
  addCareRecord(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Body() dto: CareRecordDto,
  ): Promise<{ id: string }> {
    return this.records.addCareRecord(actor, clientId, dto);
  }

  @Patch('care-records/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sửa một mục chăm sóc',
    description: 'Trường không gửi giữ nguyên; gửi `null` để xóa giá trị.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  async updateCareRecord(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Param('id', IdPipe) id: string,
    @Body() dto: UpdateCareRecordDto,
  ): Promise<void> {
    await this.records.updateCareRecord(actor, clientId, id, dto);
  }

  @Delete('care-records/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa một mục chăm sóc' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  async removeCareRecord(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Param('id', IdPipe) id: string,
  ): Promise<void> {
    await this.records.removeCareRecord(actor, clientId, id);
  }

  @Post('referrals')
  @ApiOperation({
    summary: 'Thêm một lượt giới thiệu',
    description:
      '`premiumVnd` (phí bảo hiểm của hợp đồng do giới thiệu) chỉ đi cùng `result: SUCCESS`.',
  })
  addReferral(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Body() dto: ReferralDto,
  ): Promise<{ id: string }> {
    return this.records.addReferral(actor, clientId, dto);
  }

  @Patch('referrals/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sửa một lượt giới thiệu' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  async updateReferral(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Param('id', IdPipe) id: string,
    @Body() dto: UpdateReferralDto,
  ): Promise<void> {
    await this.records.updateReferral(actor, clientId, id, dto);
  }

  @Delete('referrals/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa một lượt giới thiệu' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse()
  async removeReferral(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Param('id', IdPipe) id: string,
  ): Promise<void> {
    await this.records.removeReferral(actor, clientId, id);
  }
}
