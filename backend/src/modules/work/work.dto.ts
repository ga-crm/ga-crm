import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsIn,
  IsUUID,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { IsCalendarDate } from '../../common/validators.js';
import { CLIENT_CODE } from '../clients/client.constants.js';
import { SIGNAL_CODES } from '../clients/client-insights.js';
import { TASK_STATUSES } from '../leads/infrastructure/lead.entities.js';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const isSet = (_: unknown, value: unknown) =>
  value !== undefined && value !== null;

/** Section 17.14 GET /tasks */
export class ListTasksQueryDto {
  @ApiPropertyOptional({ enum: TASK_STATUSES, default: 'OPEN' })
  @IsOptional()
  @IsIn(TASK_STATUSES)
  status?: (typeof TASK_STATUSES)[number];

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsCalendarDate()
  dueFrom?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @IsCalendarDate()
  dueTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({ example: '0000000001' })
  @IsOptional()
  @Matches(CLIENT_CODE)
  clientCode?: string;

  /** "quản lý: của đội" */
  @ApiPropertyOptional({ description: '1 = việc của cả tuyến (quản lý)' })
  @IsOptional()
  @IsIn(['1'])
  team?: '1';
}

/** TASK-1: a personal task, or a task on a client the person owns. */
export class CreateTaskDto {
  @ApiProperty({ example: 'Gọi chúc mừng sinh nhật' })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  dueAt: Date;

  @ApiPropertyOptional({ example: '0000000001' })
  @IsOptional()
  @Matches(CLIENT_CODE)
  clientCode?: string;
}

/** Section 17.8 POST /clients/{code}/tasks, from a care opportunity when `signal` is given (SIG-2). */
export class CreateClientTaskDto {
  @ApiProperty({ example: 'Nhắc đóng phí HĐ 000000001' })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  dueAt: Date;

  @ApiPropertyOptional({ enum: SIGNAL_CODES })
  @IsOptional()
  @IsIn(SIGNAL_CODES)
  signal?: (typeof SIGNAL_CODES)[number];
}

/** TASK-2: title, due time, done or open again; or cancelled. */
export class EditTaskDto {
  @ApiPropertyOptional()
  @ValidateIf(isSet)
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf(isSet)
  @Type(() => Date)
  @IsDate()
  dueAt?: Date;

  @ApiPropertyOptional()
  @ValidateIf(isSet)
  @IsBoolean()
  done?: boolean;

  @ApiPropertyOptional({ description: 'Hủy việc' })
  @ValidateIf(isSet)
  @IsBoolean()
  cancelled?: boolean;
}

/** TASK-6 */
export class CalendarQueryDto {
  @ApiProperty({ example: '2026-11-01' })
  @IsCalendarDate()
  from: string;

  @ApiProperty({ example: '2026-11-30' })
  @IsCalendarDate()
  to: string;
}
