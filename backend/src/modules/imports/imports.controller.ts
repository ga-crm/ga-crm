import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CurrentActor,
  RequireAnyPermission,
  RequirePermissions,
  SESSION_COOKIE,
} from '../../common/auth.decorators.js';
import { notFound } from '../../common/errors.js';
import { IdPipe } from '../../common/pagination.js';
import { Permission } from '../../common/rbac.js';
import type { Actor } from '../../common/rbac.js';
import {
  AddImportRowsDto,
  CreateImportDto,
  ListImportErrorsQueryDto,
  ListImportsQueryDto,
  MatchAgentsDto,
} from './imports.dto.js';
import type { ImportKind } from './infrastructure/import.entities.js';
import { ImportsService } from './imports.service.js';
import { SUCCESS_SCOPES } from './templates.js';

const XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** IMP-11, and since 27/11/2026 one template per "Dữ liệu" screen. */
const TEMPLATE_FILES: Record<
  string,
  { kind: ImportKind; only?: readonly string[]; name: string } | undefined
> = {
  'SUCCESS.xlsx': { kind: 'SUCCESS', name: 'GA_CRM_Mau_Nhap_Du_Lieu.xlsx' },
  'CLIENTS.xlsx': {
    kind: 'SUCCESS',
    only: SUCCESS_SCOPES.clients,
    name: 'GA_CRM_Mau_Nhap_Khach_Hang.xlsx',
  },
  'AGENTS.xlsx': {
    kind: 'SUCCESS',
    only: SUCCESS_SCOPES.agents,
    name: 'GA_CRM_Mau_Nhap_Dai_Ly.xlsx',
  },
  'LEADS.xlsx': { kind: 'LEADS', name: 'GA_CRM_Mau_Nhap_Lead.xlsx' },
};

function sendWorkbook(res: Response, fileName: string, content: Buffer): void {
  res
    .setHeader('Content-Type', XLSX)
    .setHeader('Content-Disposition', `attachment; filename="${fileName}"`)
    .send(content);
}

/** Section 17.10 */
@ApiTags('Imports')
@ApiCookieAuth(SESSION_COOKIE)
@ApiForbiddenResponse({ description: 'forbidden' })
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Get()
  @ApiOperation({
    summary: 'Lịch sử nhập dữ liệu',
    description: 'Lần nhập của mình; `imports.view_all` xem của cả GA.',
  })
  list(@CurrentActor() actor: Actor, @Query() query: ListImportsQueryDto) {
    return this.imports.list(actor, query);
  }

  @Get('templates/:file')
  @RequireAnyPermission(Permission.ImportsUpload, Permission.LeadsImport)
  @ApiOperation({
    summary: 'Tải file mẫu (IMP-11)',
    description:
      '`templates/CLIENTS.xlsx` (khách hàng, hợp đồng), `templates/AGENTS.xlsx` (đại lý, hoạt động), `templates/LEADS.xlsx`, hoặc `templates/SUCCESS.xlsx` (đủ sheet).',
  })
  @ApiProduces(XLSX)
  async template(
    @CurrentActor() actor: Actor,
    @Param('file') file: string,
    @Res() res: Response,
  ): Promise<void> {
    const template = TEMPLATE_FILES[file];
    if (!template) throw notFound();
    sendWorkbook(
      res,
      template.name,
      await this.imports.template(actor, template.kind, template.only),
    );
  }

  @Get('lead-setup')
  @RequirePermissions(Permission.LeadsImport)
  @ApiOperation({
    summary: 'Cột và đại lý cho màn hình ánh xạ (IMP-23, IMP-24)',
    description: 'Quyền: `leads.import`.',
  })
  leadSetup(@CurrentActor() actor: Actor) {
    return this.imports.leadSetup(actor);
  }

  @Post('lead-agents/match')
  @RequirePermissions(Permission.LeadsImport)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tự ghép tên trong file với đại lý (IMP-24)',
    description: 'Quyền: `leads.import`.',
  })
  matchAgents(@CurrentActor() actor: Actor, @Body() dto: MatchAgentsDto) {
    return this.imports.matchAgents(actor, dto.values);
  }

  @Post()
  @RequireAnyPermission(Permission.ImportsUpload, Permission.LeadsImport)
  @ApiOperation({
    summary: 'Bắt đầu lần nhập, trả về kế hoạch từng sheet',
    description:
      'Hủy lần nhập chưa xác nhận trước đó của chính người dùng (IMP-2).',
  })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateImportDto) {
    return this.imports.create(actor, dto);
  }

  @Post(':id/rows')
  @RequireAnyPermission(Permission.ImportsUpload, Permission.LeadsImport)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gửi một đợt tối đa 500 dòng',
    description:
      'Lỗi: `import_not_open`, `sheet_not_ready`, `import_too_large`.',
  })
  addRows(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: AddImportRowsDto,
  ) {
    return this.imports.addRows(actor, id, dto);
  }

  @Post(':id/validate')
  @RequireAnyPermission(Permission.ImportsUpload, Permission.LeadsImport)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kiểm tra chéo và tạo bản xem trước',
    description: 'Chưa ghi gì vào dữ liệu thật. Lỗi: `import_not_open`.',
  })
  validate(@CurrentActor() actor: Actor, @Param('id', IdPipe) id: string) {
    return this.imports.validate(actor, id);
  }

  @Post(':id/commit')
  @RequireAnyPermission(Permission.ImportsUpload, Permission.LeadsImport)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xác nhận ghi dữ liệu',
    description: 'Lỗi: `import_not_validated`.',
  })
  commit(@CurrentActor() actor: Actor, @Param('id', IdPipe) id: string) {
    return this.imports.commit(actor, id);
  }

  @Post(':id/cancel')
  @RequireAnyPermission(Permission.ImportsUpload, Permission.LeadsImport)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Hủy lần nhập chưa xác nhận',
    description: 'Lỗi: `import_not_open`.',
  })
  cancel(@CurrentActor() actor: Actor, @Param('id', IdPipe) id: string) {
    return this.imports.cancel(actor, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết lần nhập và số lượng từng sheet' })
  detail(@CurrentActor() actor: Actor, @Param('id', IdPipe) id: string) {
    return this.imports.detail(actor, id);
  }

  @Get(':id/errors')
  @ApiOperation({
    summary: 'Danh sách lỗi và cảnh báo (tối đa 500 dòng mỗi trang)',
  })
  errors(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Query() query: ListImportErrorsQueryDto,
  ) {
    return this.imports.listErrors(actor, id, query);
  }

  @Get(':id/report.xlsx')
  @ApiOperation({ summary: 'Tải báo cáo lỗi (IMP-10)' })
  @ApiProduces(XLSX)
  async report(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    sendWorkbook(
      res,
      'Bao_cao_loi_nhap_du_lieu.xlsx',
      await this.imports.report(actor, id),
    );
  }
}
