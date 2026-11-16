import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsOptional } from 'class-validator';
import { IsCalendarDate } from '../../common/validators.js';

/** RPT-4: Vietnam dates, both included; this month when absent. */
export class ReportRangeDto {
  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsCalendarDate()
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @IsCalendarDate()
  to?: string;
}

/** The reports on screen so far (slices 6a and 6b). */
export const REPORTS = [
  'conversion',
  'activities',
  'handovers',
  'funnel',
  'pipeline',
  'care',
] as const;

/** R3: what the funnel rows are. */
export const FUNNEL_GROUPS = ['source', 'campaign', 'phoneSource'] as const;
export type FunnelGroup = (typeof FUNNEL_GROUPS)[number];

export class FunnelQueryDto extends ReportRangeDto {
  @ApiPropertyOptional({ enum: FUNNEL_GROUPS, default: 'source' })
  @IsOptional()
  @IsIn(FUNNEL_GROUPS)
  groupBy?: FunnelGroup;
}

/** RPT-6 */
export class ExportReportDto extends ReportRangeDto {
  @ApiProperty({ enum: REPORTS })
  @IsIn(REPORTS)
  report: (typeof REPORTS)[number];
}

/** Home dashboard: how many days the trend and source charts cover. */
export const DASHBOARD_DAYS = [7, 30, 90] as const;

export class DashboardQueryDto {
  @ApiPropertyOptional({ enum: DASHBOARD_DAYS, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsIn(DASHBOARD_DAYS)
  days?: (typeof DASHBOARD_DAYS)[number];
}
