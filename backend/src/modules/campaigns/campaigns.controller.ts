import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentActor, SESSION_COOKIE } from '../../common/auth.decorators.js';
import type { Actor } from '../../common/rbac.js';
import {
  AddMembersDto,
  CampaignFieldsDto,
  CreateCampaignDto,
  ListCampaignsQueryDto,
  UpdateMemberDto,
} from './campaigns.dto.js';
import { CampaignsService } from './campaigns.service.js';
import { PublicFormSettingsDto } from './public-form.dto.js';
import { PublicFormService } from './public-form.service.js';

/** Section 17.9: campaigns and seminars. Writes need campaigns.manage (CMP-5). */
@ApiTags('Campaigns')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly forms: PublicFormService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách chiến dịch, kèm số lead',
    description:
      'CMP-5: ai thấy lead đều xem được. Số lead tính trên lead người gọi thấy (LEAD-6).',
  })
  list(@CurrentActor() actor: Actor, @Query() query: ListCampaignsQueryDto) {
    return this.campaigns.list(actor, query);
  }

  @Get('owners')
  @ApiOperation({
    summary: 'Người có thể phụ trách chiến dịch',
    description: 'Người dùng đang hoạt động của GA. Cần campaigns.manage.',
  })
  owners(@CurrentActor() actor: Actor) {
    return this.campaigns.owners(actor);
  }

  @Post()
  @ApiOperation({ summary: 'Tạo chiến dịch', description: 'CMP-1, CMP-5.' })
  @ApiCreatedResponse({ description: '{ id }' })
  @ApiConflictResponse({ description: 'campaign_exists' })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateCampaignDto) {
    return this.campaigns.create(actor, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Trang chiến dịch: số liệu và người tham dự hội thảo',
    description: 'CMP-3, CMP-2.',
  })
  @ApiParam({ name: 'id' })
  @ApiNotFoundResponse()
  detail(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.campaigns.detail(actor, id);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sửa chiến dịch',
    description:
      'CMP-1. Trường vắng giữ nguyên, null là xóa. Kết thúc = status ENDED.',
  })
  @ApiParam({ name: 'id' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'campaign_exists' })
  async update(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: CampaignFieldsDto,
  ): Promise<void> {
    await this.campaigns.update(actor, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xóa chiến dịch tạo nhầm',
    description:
      'CMP-5 + DATA-8: chiến dịch đã có lead hoặc người tham dự thì chỉ kết thúc được.',
  })
  @ApiParam({ name: 'id' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'campaign_in_use' })
  async remove(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<void> {
    await this.campaigns.remove(actor, id);
  }

  @Put(':id/form')
  @ApiOperation({
    summary: 'Cài đặt form công khai của chiến dịch (CMP-4)',
    description:
      'campaigns.manage. Mã link (slug) giữ nguyên sau lần đầu để QR đã in vẫn dùng được.',
  })
  configureForm(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: PublicFormSettingsDto,
  ) {
    return this.forms.configure(actor, id, dto);
  }

  @Post(':id/members')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mời / đăng ký lead vào hội thảo',
    description:
      'CMP-2. Tối đa 200 lead; ATTENDED ghi liên hệ SEMINAR trên lead.',
  })
  @ApiParam({ name: 'id' })
  @ApiConflictResponse({ description: 'campaign_not_seminar' })
  addMembers(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: AddMembersDto,
  ) {
    return this.campaigns.addMembers(actor, id, dto);
  }

  @Patch(':id/members/:leadId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Đổi trạng thái người tham dự',
    description: 'CMP-2: người có campaigns.manage hoặc người được giao lead.',
  })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'leadId' })
  @ApiNoContentResponse()
  async updateMember(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Param('leadId') leadId: string,
    @Body() dto: UpdateMemberDto,
  ): Promise<void> {
    await this.campaigns.updateMember(actor, id, leadId, dto);
  }
}
