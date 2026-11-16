import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentActor, SESSION_COOKIE } from '../../common/auth.decorators.js';
import type { Actor } from '../../common/rbac.js';
import {
  LinkLeadDto,
  LinkSuggestionsQueryDto,
  UnlinkLeadDto,
} from './clients.dto.js';
import { LeadLinkService } from './lead-link.service.js';

/** Section 8.8 + 17.7: the lead routes that reach into the client book (LEAD-32). */
@ApiTags('Leads')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('leads')
export class LeadLinksController {
  constructor(private readonly links: LeadLinkService) {}

  @Get(':id/link-suggestions')
  @ApiOperation({
    summary: 'Gợi ý khách hàng để liên kết với lead',
    description:
      'LEAD-32. Tối đa 5 gợi ý theo điểm, hoặc 10 kết quả khi tìm `q`. Chỉ khách trong phạm vi của tư vấn viên được giao, chưa liên kết lead khác.',
  })
  @ApiParam({ name: 'id' })
  suggestions(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Query() query: LinkSuggestionsQueryDto,
  ) {
    return this.links.suggestions(actor, id, query.q);
  }

  @Post(':id/link')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Liên kết lead với khách hàng',
    description:
      'LEAD-32. Lead từ giai đoạn Đề xuất trở đi hoặc đã chốt. Người được giao lead thấy và sở hữu khách (CUS-4).',
  })
  @ApiParam({ name: 'id' })
  @ApiNoContentResponse()
  @ApiConflictResponse({
    description: 'client_already_linked, lead_not_linkable',
  })
  @ApiNotFoundResponse({ description: 'Khách / hồ sơ ngoài phạm vi' })
  async link(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: LinkLeadDto,
  ): Promise<void> {
    await this.links.link(actor, id, dto);
  }

  @Delete(':id/link')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Hủy liên kết lead với khách hàng',
    description: 'LEAD-32: cần lý do, ghi kiểm toán UNLINK.',
  })
  @ApiParam({ name: 'id' })
  @ApiNoContentResponse()
  async unlink(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: UnlinkLeadDto,
  ): Promise<void> {
    await this.links.unlink(actor, id, dto);
  }
}
