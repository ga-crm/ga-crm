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
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentActor, SESSION_COOKIE } from '../../common/auth.decorators.js';
import type { Actor } from '../../common/rbac.js';
import {
  AddActivityDto,
  AddCommentDto,
  AddNoteDto,
  MentionQueryDto,
} from '../leads/leads.dto.js';
import { ClientCareService } from './client-care.service.js';
import { IdPipe } from '../../common/pagination.js';
import { ClientEditorService } from './client-editor.service.js';
import {
  AssignClientsDto,
  ClientFieldsDto,
  CreateClientDto,
  CreatePolicyDto,
  FamilyInputDto,
  FamilyLeadDto,
  FamilyUpdateDto,
  ListClientsQueryDto,
  PolicyFieldsDto,
} from './clients.dto.js';
import { ClientsService } from './clients.service.js';

/** Section 17.8. Who sees what is decided by the service (CUS-5, CUS-8). */
@ApiTags('Clients')
@ApiCookieAuth(SESSION_COOKIE)
@ApiForbiddenResponse({
  description: 'forbidden: Marketing và Admin không có sổ khách hàng (CUS-5)',
})
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly editor: ClientEditorService,
    private readonly care: ClientCareService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách khách hàng trong phạm vi',
    description:
      'CUS-14. Mặc định là khách hàng đại lý đang đăng nhập sở hữu; `agents=ALL` là mọi khách trong phạm vi.',
  })
  list(@CurrentActor() actor: Actor, @Query() query: ListClientsQueryDto) {
    return this.clients.list(actor, query);
  }

  @Post()
  @ApiOperation({
    summary: 'Thêm khách hàng bằng tay, có thể kèm hợp đồng',
    description:
      'MAN-1 đến MAN-5. Mã khách hàng đúng 10 chữ số. Khách và hợp đồng lưu cùng một transaction.',
  })
  @ApiCreatedResponse({ description: '{ id }' })
  @ApiConflictResponse({
    description:
      'invalid_policy_no, policy_not_yours (hợp đồng ngoài phạm vi), holder_exists, person_on_policy',
  })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateClientDto) {
    return this.editor.create(actor, dto);
  }

  @Post('assign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Phân công khách hàng cho một đại lý, hoặc bỏ phân công',
    description:
      'ASG-1 đến ASG-4. Chủ GA hoặc người có `clients.assign`. Tối đa 200 khách; `agentCode: null` chỉ xóa liên kết MANUAL.',
  })
  @ApiNotFoundResponse({ description: 'Có mã khách không thuộc GA / phạm vi' })
  assign(@CurrentActor() actor: Actor, @Body() dto: AssignClientsDto) {
    return this.editor.assign(actor, dto);
  }

  @Get('counts')
  @ApiOperation({
    summary: 'Đếm khách theo tab tín hiệu',
    description:
      'SIG-1. Cùng bộ lọc "Khách hàng của" với danh sách; 0 khi không có.',
  })
  counts(@CurrentActor() actor: Actor, @Query() query: ListClientsQueryDto) {
    return this.clients.counts(actor, query);
  }

  @Get(':clientId')
  @ApiOperation({
    summary:
      'Chi tiết khách hàng, hợp đồng, gia đình, quyền lợi, cơ hội chăm sóc',
    description:
      'Ghi kiểm toán VIEW_CLIENT (CUS-9). Gia đình FAM-1, quyền lợi COV-1 đến COV-5, tín hiệu mục 10.11, ghi chú NOTE-1.',
  })
  @ApiParam({ name: 'clientId', format: 'uuid' })
  @ApiNotFoundResponse({
    description: 'not_found (kể cả khách ngoài phạm vi hoặc GA khác)',
  })
  async detail(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
  ) {
    const detail = await this.clients.detail(actor, clientId);
    return { ...detail, ...(await this.care.insights(actor, clientId)) };
  }

  @Patch(':clientId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sửa thông tin khách hàng',
    description:
      'MAN-6. Người sở hữu khách và Chủ GA. Trường vắng giữ nguyên, null là xóa.',
  })
  @ApiParam({ name: 'clientId', format: 'uuid' })
  @ApiNoContentResponse()
  async update(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Body() dto: ClientFieldsDto,
  ): Promise<void> {
    await this.editor.update(actor, clientId, dto);
  }

  @Post(':clientId/policies')
  @ApiOperation({
    summary: 'Thêm hợp đồng bằng tay',
    description:
      'POL-1 đến POL-3. Đại lý phục vụ 100%; chương trình chỉ chọn từ danh mục.',
  })
  @ApiParam({ name: 'clientId', format: 'uuid' })
  @ApiConflictResponse({ description: 'policy_exists, program_repeated' })
  addPolicy(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Body() dto: CreatePolicyDto,
  ) {
    return this.editor.addPolicy(actor, clientId, dto);
  }

  @Patch(':clientId/policies/:policyNo')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sửa hợp đồng',
    description:
      'POL-4. Thay toàn bộ chương trình khi gửi `products`. Không đổi số HĐBH và đại lý phục vụ.',
  })
  @ApiParam({ name: 'clientId', format: 'uuid' })
  @ApiParam({ name: 'policyNo', example: '000000001' })
  @ApiNoContentResponse()
  async updatePolicy(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Param('policyNo') policyNo: string,
    @Body() dto: PolicyFieldsDto,
  ): Promise<void> {
    await this.editor.updatePolicy(actor, clientId, policyNo, dto);
  }
  @Delete(':clientId/policies/:policyNo')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xóa hợp đồng nhập tay sai',
    description:
      'POL-7: chỉ hợp đồng nhập tay, chưa được file Success ghi vào, trong 7 ngày sau khi nhập; người sửa được khách hàng. Lỗi: `policy_not_deletable`.',
  })
  @ApiParam({ name: 'clientId', format: 'uuid' })
  @ApiParam({ name: 'policyNo', example: '000000001' })
  @ApiNoContentResponse()
  async deletePolicy(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Param('policyNo') policyNo: string,
  ): Promise<void> {
    await this.editor.deletePolicy(actor, clientId, policyNo);
  }

  @Post(':clientId/family')
  @ApiOperation({
    summary: 'Thêm người thân hoặc gắn nhãn quan hệ với khách khác',
    description:
      'FAM-2 đến FAM-4, FAM-8. Gửi `relatedClientCode` (khách có sẵn) hoặc `fullName` (người thân chưa là khách), không gửi cả hai.',
  })
  @ApiParam({ name: 'clientId', format: 'uuid' })
  @ApiCreatedResponse({ description: '{ id }' })
  @ApiConflictResponse({ description: 'already_client' })
  @ApiNotFoundResponse({ description: 'Khách liên quan ngoài phạm vi' })
  addFamily(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Body() dto: FamilyInputDto,
  ) {
    return this.care.addFamily(actor, clientId, dto);
  }

  @Patch(':clientId/family/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sửa quan hệ hoặc thông tin người thân',
    description:
      'FAM-2: sửa từ phía khách bên kia thì lưu quan hệ ngược. Trường vắng giữ nguyên, null là xóa.',
  })
  @ApiParam({ name: 'clientId', format: 'uuid' })
  @ApiNoContentResponse()
  async updateFamily(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Param('id') id: string,
    @Body() dto: FamilyUpdateDto,
  ): Promise<void> {
    await this.care.updateFamily(actor, clientId, id, dto);
  }

  @Delete(':clientId/family/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa quan hệ gia đình', description: 'FAM-8.' })
  @ApiParam({ name: 'clientId', format: 'uuid' })
  @ApiNoContentResponse()
  async removeFamily(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Param('id') id: string,
  ): Promise<void> {
    await this.care.removeFamily(actor, clientId, id);
  }

  @Post(':clientId/family/:id/lead')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tạo lead từ người thân, hoặc liên kết lead đã có',
    description:
      'FAM-6. `{leadId}` liên kết lead người gọi thấy; `{create:{phone, consent}}` tạo lead mới (nguồn Giới thiệu).',
  })
  @ApiParam({ name: 'clientId', format: 'uuid' })
  familyLead(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Param('id') id: string,
    @Body() dto: FamilyLeadDto,
  ) {
    return this.care.familyLead(actor, clientId, id, dto);
  }

  @Post(':clientId/notes')
  @ApiOperation({
    summary: 'Ghi chú cho khách hàng',
    description: 'NOTE-1, NOTE-5: người sở hữu khách và Chủ GA.',
  })
  @ApiParam({ name: 'clientId', format: 'uuid' })
  @ApiCreatedResponse({ description: '{ id }' })
  addNote(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Body() dto: AddNoteDto,
  ) {
    return this.care.addNote(actor, clientId, dto);
  }

  @Post(':clientId/comments')
  @ApiOperation({
    summary: 'Góp ý trên khách hàng (CMT-5)',
    description:
      'Ai thấy khách hàng thì góp ý được (quản lý tuyến, người sở hữu). `mentions`: người được @nhắc tên, phải thấy khách hàng (`mention_not_visible`).',
  })
  @ApiParam({ name: 'clientId', format: 'uuid' })
  @ApiCreatedResponse({ description: '{ id }' })
  addComment(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Body() dto: AddCommentDto,
  ) {
    return this.care.addComment(actor, clientId, dto);
  }

  @Get(':clientId/mentionable')
  @ApiOperation({
    summary: 'Người có thể @nhắc tên trong góp ý (CMT-5)',
    description: 'Tối đa 8 người dùng đang hoạt động thấy khách hàng này.',
  })
  @ApiParam({ name: 'clientId', format: 'uuid' })
  mentionable(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Query() query: MentionQueryDto,
  ) {
    return this.care.mentionable(actor, clientId, query.q);
  }

  @Post(':clientId/activities')
  @ApiOperation({
    summary: 'Ghi nhận liên hệ với khách hàng',
    description: 'NOTE-2: thời điểm có thể ở quá khứ, không ở tương lai.',
  })
  @ApiParam({ name: 'clientId', format: 'uuid' })
  @ApiCreatedResponse({ description: '{ id }' })
  addActivity(
    @CurrentActor() actor: Actor,
    @Param('clientId', IdPipe) clientId: string,
    @Body() dto: AddActivityDto,
  ) {
    return this.care.addActivity(actor, clientId, dto);
  }
}
