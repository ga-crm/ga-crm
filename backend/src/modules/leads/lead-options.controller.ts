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
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentActor,
  RequireRoles,
  SESSION_COOKIE,
} from '../../common/auth.decorators.js';
import { forbidden } from '../../common/errors.js';
import { IdPipe } from '../../common/pagination.js';
import { Role } from '../../common/rbac.js';
import type { Actor, Scope } from '../../common/rbac.js';
import {
  BulkLeadOptionsDto,
  CreateLeadOptionDto,
  LeadOptionDto,
  LeadOptionsDto,
  toLeadOptionDto,
  UpdateLeadOptionDto,
} from './lead-options.dto.js';
import { LeadOptionsService } from './lead-options.service.js';

const scopeOf = (actor: Actor): Scope => {
  if (!actor.tenantId) throw forbidden();
  return { tenantId: actor.tenantId };
};

/** Section 17.5 and 5.3: the GA's lead catalogue. Everyone reads it (OPT-9); only GA_HEAD edits (PERM-3). */
@ApiTags('Lead catalogue')
@ApiCookieAuth(SESSION_COOKIE)
@ApiForbiddenResponse({ description: 'forbidden' })
@Controller('lead-options')
export class LeadOptionsController {
  constructor(private readonly options: LeadOptionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh mục lead: Nhu cầu, Trạng thái hiện tại, Nguồn',
    description: 'Mọi người trong GA (OPT-9). Gồm cả giá trị đã ẩn.',
  })
  @ApiOkResponse({ type: LeadOptionsDto })
  async list(@CurrentActor() actor: Actor): Promise<LeadOptionsDto> {
    const items = await this.options.list(scopeOf(actor));
    return { items: items.map(toLeadOptionDto) };
  }

  @Post()
  @RequireRoles(Role.GAD)
  @ApiOperation({ summary: 'Thêm giá trị', description: 'Chỉ Chủ GA (PERM-3)' })
  @ApiCreatedResponse({ type: LeadOptionDto })
  @ApiConflictResponse({ description: 'option_exists' })
  async create(
    @CurrentActor() actor: Actor,
    @Body() dto: CreateLeadOptionDto,
  ): Promise<LeadOptionDto> {
    return toLeadOptionDto(
      await this.options.create(scopeOf(actor), actor, dto),
    );
  }

  @Post('bulk')
  @RequireRoles(Role.GAD)
  @ApiOperation({
    summary: 'Thêm nhiều giá trị một lần',
    description:
      'Chỉ Chủ GA. Tối đa 200 nhãn, mỗi nhãn ≤ 60 ký tự. Nhãn đã có (không phân biệt hoa thường, dấu) hoặc lặp lại được bỏ qua. Trả về các nhãn đã thêm và đã bỏ qua.',
  })
  createMany(@CurrentActor() actor: Actor, @Body() dto: BulkLeadOptionsDto) {
    return this.options.createMany(scopeOf(actor), actor, dto.kind, dto.labels);
  }

  @Patch(':id')
  @RequireRoles(Role.GAD)
  @ApiOperation({
    summary: 'Đổi tên, cờ, hiện / ẩn, thứ tự',
    description: 'Chỉ Chủ GA. Đổi tên không đổi mã mà lead đang mang (OPT-3).',
  })
  @ApiOkResponse({ type: LeadOptionDto })
  @ApiConflictResponse({ description: 'option_exists' })
  async update(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: UpdateLeadOptionDto,
  ): Promise<LeadOptionDto> {
    return toLeadOptionDto(
      await this.options.update(scopeOf(actor), actor, id, dto),
    );
  }

  @Delete(':id')
  @RequireRoles(Role.GAD)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xóa giá trị GA tự thêm và chưa có lead dùng',
    description: 'Chỉ Chủ GA (OPT-5)',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'option_built_in, option_in_use' })
  async remove(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
  ): Promise<void> {
    await this.options.remove(scopeOf(actor), actor, id);
  }
}
