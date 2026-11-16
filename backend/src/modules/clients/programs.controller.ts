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
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentActor, SESSION_COOKIE } from '../../common/auth.decorators.js';
import { forbidden } from '../../common/errors.js';
import { IdPipe } from '../../common/pagination.js';
import type { Actor, Scope } from '../../common/rbac.js';
import type { InsuranceProgram } from './infrastructure/client.entities.js';
import { CreateProgramDto, UpdateProgramDto } from './programs.dto.js';
import { ProgramsService } from './programs.service.js';

const scopeOf = (actor: Actor): Scope => {
  if (!actor.tenantId) throw forbidden();
  return { tenantId: actor.tenantId };
};

const toDto = (program: InsuranceProgram) => ({
  id: program.id as string,
  code: program.code,
  label: program.label,
  productRole: program.productRole,
  productCode: program.productCode ?? null,
  active: program.active,
  sortOrder: program.sortOrder,
});

/** Section 17.5 and 5.4: the GA's insurance programme catalogue. */
@ApiTags('Insurance programmes')
@ApiCookieAuth(SESSION_COOKIE)
@ApiForbiddenResponse({
  description: 'forbidden: sửa cần Chủ GA hoặc catalog.manage (PRG-3)',
})
@Controller('programs')
export class ProgramsController {
  constructor(private readonly programs: ProgramsService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh mục chương trình bảo hiểm',
    description: 'Mọi người trong GA (PRG-3). Gồm cả chương trình đã ẩn.',
  })
  async list(@CurrentActor() actor: Actor) {
    return { items: (await this.programs.list(scopeOf(actor))).map(toDto) };
  }

  @Post()
  @ApiOperation({
    summary: 'Thêm chương trình',
    description: 'Chủ GA hoặc catalog.manage',
  })
  @ApiConflictResponse({ description: 'program_exists' })
  async create(@CurrentActor() actor: Actor, @Body() dto: CreateProgramDto) {
    return toDto(await this.programs.create(scopeOf(actor), actor, dto));
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Đổi tên, vai trò, mã sản phẩm, hiện / ẩn, thứ tự',
    description: 'Đổi tên không đổi mã (PRG-4)',
  })
  async update(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: UpdateProgramDto,
  ) {
    return toDto(await this.programs.update(scopeOf(actor), actor, id, dto));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xóa chương trình chưa có hợp đồng dùng',
    description: 'PRG-5',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'program_in_use' })
  async remove(@CurrentActor() actor: Actor, @Param('id', IdPipe) id: string) {
    await this.programs.remove(scopeOf(actor), actor, id);
  }
}
