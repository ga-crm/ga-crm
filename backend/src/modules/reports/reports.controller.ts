import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentActor, SESSION_COOKIE } from '../../common/auth.decorators.js';
import type { Actor } from '../../common/rbac.js';
import {
  ActivityDetailsQueryDto,
  DashboardQueryDto,
  ExportReportDto,
  FunnelQueryDto,
  ReportRangeDto,
} from './reports.dto.js';
import { ReportsService } from './reports.service.js';

/** Section 17.13: reports in the agent-tree layout (RPT-1). Who sees what: RPT-3. */
@ApiTags('Reports')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('dashboard')
  @ApiOperation({
    summary: 'Số liệu trang chủ',
    description:
      'Lead trong phạm vi báo cáo của người dùng (RPT-3): pipeline theo giai đoạn, lead mới và đã liên hệ theo ngày, theo nguồn, theo đại lý. Không có phạm vi thì `available: false`. Thay đổi đến qua sự kiện WebSocket `dashboard.changed`.',
  })
  dashboard(@CurrentActor() actor: Actor, @Query() query: DashboardQueryDto) {
    return this.reports.dashboard(actor, query.days ?? 30);
  }

  @Get('conversion')
  @ApiOperation({
    summary: 'R1 Báo cáo chuyển đổi',
    description:
      'Theo đại lý, lead có ngày lead trong kỳ. Một cột cho mỗi Nhu cầu của Danh mục.',
  })
  conversion(@CurrentActor() actor: Actor, @Query() query: ReportRangeDto) {
    return this.reports.conversion(actor, query);
  }

  @Get('activities')
  @ApiOperation({
    summary: 'R2 Hoạt động đại lý',
    description:
      'Liên hệ CRM và 07_Activities theo ngày Việt Nam, gộp trùng cùng số trong ngày.',
  })
  activities(@CurrentActor() actor: Actor, @Query() query: ReportRangeDto) {
    return this.reports.activities(actor, query);
  }

  @Get('activities/details')
  @ApiOperation({
    summary: 'R2: các hoạt động đằng sau một con số',
    description:
      'Theo đại lý (một dòng hoặc cả đội), loại hoặc nguồn, trong kỳ; mỗi dòng có tính vào báo cáo hay không và lý do (trùng cùng số trong ngày, hoặc Success nháp / từ chối). Tối đa 500 dòng, mới nhất trước.',
  })
  activityDetails(
    @CurrentActor() actor: Actor,
    @Query() query: ActivityDetailsQueryDto,
  ) {
    return this.reports.activityDetails(actor, query);
  }

  @Get('handovers')
  @ApiOperation({
    summary: 'R8 Lần bàn giao lead',
    description:
      'Nhận, bàn giao đi, bàn giao không liên hệ, số ngày giữ (LEAD-28).',
  })
  handovers(@CurrentActor() actor: Actor, @Query() query: ReportRangeDto) {
    return this.reports.handovers(actor, query);
  }

  @Get('funnel')
  @ApiOperation({
    summary: 'R3 Phễu theo nguồn và chiến dịch',
    description:
      'Lead trong kỳ theo nguồn / chiến dịch / nguồn SĐT: đã liên hệ, cơ hội, đã chốt, đã liên kết, phát hành, APE, chi phí.',
  })
  funnel(@CurrentActor() actor: Actor, @Query() query: FunnelQueryDto) {
    return this.reports.funnel(actor, query);
  }

  @Get('pipeline')
  @ApiOperation({
    summary: 'R5 Pipeline theo đội',
    description:
      'Lead đang trong pipeline theo đại lý và giai đoạn, giá trị dự kiến, số ngày ở giai đoạn. Không theo kỳ.',
  })
  pipeline(@CurrentActor() actor: Actor) {
    return this.reports.pipeline(actor);
  }

  @Get('care')
  @ApiOperation({
    summary: 'R7 Khối lượng chăm sóc',
    description:
      'Khách có tín hiệu theo đại lý sở hữu (hiện tại) và liên hệ / ghi chú trên khách trong kỳ.',
  })
  care(@CurrentActor() actor: Actor, @Query() query: ReportRangeDto) {
    return this.reports.care(actor, query);
  }

  @Post('exports')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Ghi nhận xuất báo cáo',
    description:
      'RPT-6: cần exports.data; ghi kiểm toán EXPORT kèm kỳ báo cáo.',
  })
  @ApiNoContentResponse()
  async export(
    @CurrentActor() actor: Actor,
    @Body() dto: ExportReportDto,
  ): Promise<void> {
    await this.reports.recordExport(actor, dto);
  }
}
