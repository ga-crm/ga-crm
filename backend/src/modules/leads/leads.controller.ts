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
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentActor,
  RequireAnyPermission,
  RequirePermissions,
  SESSION_COOKIE,
} from '../../common/auth.decorators.js';
import { IdPipe, PageQueryDto } from '../../common/pagination.js';
import { Permission } from '../../common/rbac.js';
import type { Actor } from '../../common/rbac.js';
import {
  AddActivityDto,
  AddCommentDto,
  AddSupporterDto,
  DeleteLeadDto,
  EditNoteDto,
  SaveFilterDto,
  MergeLeadsDto,
  MentionQueryDto,
  AddNoteDto,
  AddTaskDto,
  AssigneesQueryDto,
  AssignLeadsDto,
  CreateLeadDto,
  ListLeadsQueryDto,
  UpdateLeadDto,
  UpdateTaskDto,
} from './leads.dto.js';
import { LeadRemovalService } from './lead-removal.service.js';
import { LeadSupportersService } from './lead-supporters.service.js';
import { LeadsService } from './leads.service.js';
import { SavedFiltersService } from './saved-filters.service.js';

/** Section 17.7. What each person sees and may do is decided by the service (LEAD-6, LEAD-7). */
@ApiTags('Leads')
@ApiCookieAuth(SESSION_COOKIE)
@ApiForbiddenResponse({ description: 'forbidden' })
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly removal: LeadRemovalService,
    private readonly filters: SavedFiltersService,
    private readonly supporters: LeadSupportersService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách lead trong phạm vi được xem',
    description: 'Số điện thoại bị che với cấp quản lý tuyến trên (PDP-3).',
  })
  list(@CurrentActor() actor: Actor, @Query() query: ListLeadsQueryDto) {
    return this.leads.list(actor, query);
  }

  @Get('ids')
  @ApiOperation({
    summary: 'Id của các lead theo bộ lọc, để chọn tất cả (LEAD-24)',
    description:
      'Người quản lý lead, hoặc quản lý tuyến (`leads.assign_line`, chỉ lead trong tuyến). Cùng bộ lọc và thứ tự với danh sách, tối đa 200 id (một lần phân công). `total` là tổng số lead khớp bộ lọc.',
  })
  selectIds(@CurrentActor() actor: Actor, @Query() query: ListLeadsQueryDto) {
    return this.leads.selectIds(actor, query);
  }

  @Get('board')
  @ApiOperation({
    summary: 'Kanban theo giai đoạn (LEAD-19)',
    description:
      'Cùng bộ lọc với danh sách (bỏ qua `stage`); mỗi cột có tổng và tối đa 50 thẻ theo thứ tự LEAD-38. `canWork` cho biết thẻ nào kéo được.',
  })
  board(@CurrentActor() actor: Actor, @Query() query: ListLeadsQueryDto) {
    return this.leads.board(actor, query);
  }

  @Get('filters')
  @ApiOperation({ summary: 'Bộ lọc đã lưu của tôi (LEAD-38)' })
  savedFilters(@CurrentActor() actor: Actor) {
    return this.filters.list(actor);
  }

  @Post('filters')
  @ApiOperation({
    summary: 'Lưu bộ lọc hiện tại (LEAD-38)',
    description:
      'Tối đa 20 bộ lọc mỗi người. Lỗi: `filter_exists`, `filter_limit`.',
  })
  saveFilter(@CurrentActor() actor: Actor, @Body() dto: SaveFilterDto) {
    return this.filters.save(actor, dto);
  }

  @Delete('filters/:filterId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa bộ lọc đã lưu' })
  @ApiNoContentResponse()
  async removeFilter(
    @CurrentActor() actor: Actor,
    @Param('filterId', IdPipe) filterId: string,
  ): Promise<void> {
    await this.filters.remove(actor, filterId);
  }

  @Get('deleted')
  @RequirePermissions(Permission.LeadsManage)
  @ApiOperation({
    summary: 'Lead đã xóa trong 30 ngày (LEAD-40)',
    description: 'Mới nhất trước; khôi phục được trừ lead đã gộp.',
  })
  deleted(@CurrentActor() actor: Actor, @Query() query: PageQueryDto) {
    return this.removal.deleted(actor, query);
  }

  @Post('merge')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.LeadsManage)
  @ApiOperation({
    summary: 'Gộp hai lead (LEAD-41)',
    description:
      '`mergeId` gộp vào `keepId`: ghi chú, liên hệ, việc, góp ý, lịch sử, chiến dịch chuyển sang; lead kia vào thùng rác (không khôi phục). Lỗi: `lead_merge_conflict`.',
  })
  @ApiNoContentResponse()
  async merge(
    @CurrentActor() actor: Actor,
    @Body() dto: MergeLeadsDto,
  ): Promise<void> {
    await this.removal.merge(actor, dto.keepId, dto.mergeId);
  }

  @Get('counts')
  @ApiOperation({ summary: 'Số lượng trên từng tab (LEAD-36)' })
  counts(@CurrentActor() actor: Actor) {
    return this.leads.counts(actor);
  }

  @Get('facets')
  @ApiOperation({ summary: 'Giá trị cho bộ lọc' })
  facets(@CurrentActor() actor: Actor) {
    return this.leads.facets(actor);
  }

  @Get('departed')
  @RequirePermissions(Permission.LeadsManage)
  @ApiOperation({
    summary: 'Lead và khách còn đứng tên người đã nghỉ (câu 12e)',
    description:
      'Người có tài khoản đã khóa / lưu trữ (và không ai đang dùng mã đại lý đó) hoặc đại lý ngưng hoạt động: số lead đang mở, số khách sở hữu. Lọc danh sách lead bằng `assignee=DEPARTED` hoặc mã đại lý.',
  })
  departed(@CurrentActor() actor: Actor) {
    return this.leads.departedWork(actor);
  }

  @Get('assignees')
  @RequireAnyPermission(Permission.LeadsManage, Permission.LeadsAssignLine)
  @ApiOperation({
    summary: 'Danh sách đại lý để phân công (LEAD-23)',
    description: 'Quyền: `leads.manage` (cả GA) hoặc `leads.assign_line` (chỉ đại lý trong tuyến của mình).',
  })
  assignees(@CurrentActor() actor: Actor, @Query() query: AssigneesQueryDto) {
    return this.leads.assignees(actor, query.q);
  }

  @Post()
  @ApiOperation({
    summary: 'Thêm lead (LEAD-3)',
    description:
      'Đại lý tạo lead tự khai thác; `leads.manage` tạo lead của GA. Lỗi: `invalid_phone`, `phone_exists`, `agent_not_found`, `campaign_not_found`.',
  })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateLeadDto) {
    return this.leads.create(actor, dto);
  }

  @Post('assign')
  @RequireAnyPermission(Permission.LeadsManage, Permission.LeadsAssignLine)
  @ApiOperation({
    summary: 'Phân công tối đa 200 lead (LEAD-21)',
    description:
      'Quyền: `leads.manage`, hoặc `leads.assign_line` cho quản lý tuyến: chỉ lead và đại lý trong tuyến của mình, không bỏ phân công. Lỗi: `agent_not_found`, `agent_out_of_line`, `own_lead_locked`.',
  })
  assign(@CurrentActor() actor: Actor, @Body() dto: AssignLeadsDto) {
    return this.leads.assign(actor, dto.leadIds, dto.agentCode ?? null);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Chi tiết lead',
    description: 'Đánh dấu đã xem nếu người mở là đại lý được giao (LEAD-25).',
  })
  async detail(@CurrentActor() actor: Actor, @Param('id', IdPipe) id: string) {
    return {
      ...(await this.leads.detail(actor, id)),
      // Decided 26/11/2026: who supports the lead, and whether the viewer may change that
      ...(await this.supporters.forLead(actor, id)),
    };
  }

  @Get(':id/supporters/candidates')
  @ApiOperation({
    summary: 'Người có thể thêm làm người hỗ trợ',
    description:
      'Tối đa 10 người dùng đang hoạt động của GA, trừ người được giao và người đã hỗ trợ. Chỉ người phụ trách lead, người quản lý lead và quản lý tuyến của lead.',
  })
  supporterCandidates(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Query() query: MentionQueryDto,
  ) {
    return this.supporters.candidates(actor, id, query.q);
  }

  @Post(':id/supporters')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Thêm người hỗ trợ cho lead',
    description:
      'Người hỗ trợ xem được lead nhưng số điện thoại luôn được che (PDP-3) và không sửa được lead; được góp ý. Ghi lịch sử, kiểm toán và báo cho người được thêm.',
  })
  @ApiNoContentResponse()
  async addSupporter(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: AddSupporterDto,
  ): Promise<void> {
    await this.supporters.add(actor, id, dto.userId);
  }

  @Delete(':id/supporters/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Bỏ một người hỗ trợ',
    description: 'Người hỗ trợ cũng tự rời được.',
  })
  @ApiNoContentResponse()
  async removeSupporter(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Param('userId', IdPipe) userId: string,
  ): Promise<void> {
    await this.supporters.remove(actor, id, userId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Cập nhật lead',
    description:
      'Lỗi: `lead_not_yours`, `interest_locked`, `lost_reason_required`, `won_needs_numbers`, `invalid_phone`, `phone_exists`, `campaign_not_found`.',
  })
  update(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: UpdateLeadDto,
  ) {
    return this.leads.update(actor, id, dto);
  }

  @Post(':id/notes')
  @ApiOperation({
    summary: 'Thêm ghi chú',
    description: 'Lỗi: `lead_not_yours`.',
  })
  addNote(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: AddNoteDto,
  ) {
    return this.leads.addNote(actor, id, dto.body);
  }

  @Patch(':id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sửa ghi chú của mình (NOTE-8)',
    description:
      'Tác giả, trong 24 giờ; bản cũ giữ trong lịch sử. Lỗi: `note_not_editable`.',
  })
  @ApiNoContentResponse()
  async editNote(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Param('noteId', IdPipe) noteId: string,
    @Body() dto: EditNoteDto,
  ): Promise<void> {
    await this.leads.editNote(actor, id, noteId, dto);
  }

  @Delete(':id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xóa ghi chú của mình (NOTE-8)',
    description:
      'Tác giả, trong 24 giờ, chỉ ghi chú thường (không xóa liên hệ). Lỗi: `note_not_editable`.',
  })
  @ApiNoContentResponse()
  async deleteNote(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Param('noteId', IdPipe) noteId: string,
  ): Promise<void> {
    await this.leads.deleteNote(actor, id, noteId);
  }

  @Post(':id/activities')
  @ApiOperation({
    summary: 'Ghi nhận lượt liên hệ (NOTE-4)',
    description: 'Lỗi: `lead_not_yours`.',
  })
  addActivity(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: AddActivityDto,
  ) {
    return this.leads.addActivity(actor, id, dto);
  }

  @Post(':id/comments')
  @ApiOperation({ summary: 'Thêm góp ý (CMT-1)' })
  addComment(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: AddCommentDto,
  ) {
    return this.leads.addComment(actor, id, dto);
  }

  @Get(':id/mentionable')
  @ApiOperation({
    summary: 'Người có thể @nhắc tên trong góp ý (CMT-5)',
    description: 'Tối đa 8 người dùng đang hoạt động thấy lead này.',
  })
  mentionable(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Query() query: MentionQueryDto,
  ) {
    return this.leads.mentionable(actor, id, query.q);
  }

  @Post(':id/tasks')
  @ApiOperation({
    summary: 'Thêm việc cần làm',
    description: 'Lỗi: `lead_not_yours`.',
  })
  addTask(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: AddTaskDto,
  ) {
    return this.leads.addTask(actor, id, dto);
  }

  @Patch(':id/tasks/:taskId')
  @ApiOperation({
    summary: 'Sửa, hoàn thành hoặc mở lại việc cần làm',
    description: 'Lỗi: `lead_not_yours`.',
  })
  updateTask(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Param('taskId', IdPipe) taskId: string,
    @Body() dto: UpdateTaskDto,
  ) {
    return this.leads.updateTask(actor, id, taskId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.LeadsManage)
  @ApiOperation({
    summary: 'Xóa lead (LEAD-40, PDP-6)',
    description:
      '`SOFT`: vào thùng rác, khôi phục trong 30 ngày. `PDP`: xóa vĩnh viễn thông tin cá nhân theo yêu cầu của khách, giữ thống kê ẩn danh. Có audit.',
  })
  @ApiNoContentResponse()
  async remove(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: DeleteLeadDto,
  ): Promise<void> {
    await this.removal.remove(actor, id, dto);
  }

  @Post(':id/restore')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.LeadsManage)
  @ApiOperation({
    summary: 'Khôi phục lead đã xóa (LEAD-40)',
    description: 'Trong 30 ngày. Lỗi: `lead_not_restorable`, `phone_exists`.',
  })
  @ApiNoContentResponse()
  async restore(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
  ): Promise<void> {
    await this.removal.restore(actor, id);
  }
}
