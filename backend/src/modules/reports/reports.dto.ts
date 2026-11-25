import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsOptional,
  Matches,
} from 'class-validator';
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

/** R2 columns a list can be opened for (decided 26/11/2026). */
export const ACTIVITY_COLUMNS = [
  'CALL',
  'ZALO',
  'MEETING',
  'SEMINAR',
  'PROPOSAL',
  'SOCIAL_POST',
  'CHECKIN',
  'COACHING',
  'OTHER',
] as const;
export const ACTIVITY_SOURCES = ['CRM', 'SUCCESS'] as const;

/**
 * Decided 26/11/2026: the activities behind one number of R2, so a manager can check it: for some
 * agents (one row, or a team's), one type or source, over the period.
 */
export class ActivityDetailsQueryDto extends ReportRangeDto {
  @ApiProperty({
    type: String,
    example: '00100004,00100005',
    description: 'Mã đại lý, cách nhau bằng dấu phẩy (tối đa 300)',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(300)
  @Matches(/^\d{1,20}$/, { each: true })
  agents: string[];

  @ApiPropertyOptional({ enum: ACTIVITY_COLUMNS })
  @IsOptional()
  @IsIn(ACTIVITY_COLUMNS)
  type?: (typeof ACTIVITY_COLUMNS)[number];

  @ApiPropertyOptional({ enum: ACTIVITY_SOURCES })
  @IsOptional()
  @IsIn(ACTIVITY_SOURCES)
  source?: (typeof ACTIVITY_SOURCES)[number];
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
