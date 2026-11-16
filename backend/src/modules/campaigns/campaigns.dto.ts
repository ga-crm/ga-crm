import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDate,
  IsIn,
  IsInt,
  IsUUID,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination.js';
import { IsCalendarDate } from '../../common/validators.js';
import {
  CAMPAIGN_STATUSES,
  CAMPAIGN_TYPES,
  MEMBER_STATUSES,
} from '../leads/infrastructure/lead.entities.js';
import type {
  CampaignStatus,
  CampaignType,
  MemberStatus,
} from '../leads/infrastructure/lead.entities.js';

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/** Present and not null: null clears the field on PATCH. */
const given = (_: unknown, value: unknown) =>
  value !== undefined && value !== null;

/** CMP-5: one assignment of seminar members takes at most this many leads. */
export const MAX_MEMBERS = 200;

export class ListCampaignsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Tên chiến dịch' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: CAMPAIGN_TYPES })
  @IsOptional()
  @IsIn(CAMPAIGN_TYPES)
  type?: CampaignType;

  @ApiPropertyOptional({ enum: CAMPAIGN_STATUSES })
  @IsOptional()
  @IsIn(CAMPAIGN_STATUSES)
  status?: CampaignStatus;
}

/** CMP-1 + CMP-2: what may change on a campaign; null clears an optional field. */
export class CampaignFieldsDto {
  @ApiPropertyOptional({ example: 'Hội thảo hưu trí tháng 12' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: CAMPAIGN_TYPES })
  @IsOptional()
  @IsIn(CAMPAIGN_TYPES)
  type?: CampaignType;

  @ApiPropertyOptional({ enum: CAMPAIGN_STATUSES })
  @IsOptional()
  @IsIn(CAMPAIGN_STATUSES)
  status?: CampaignStatus;

  @ApiPropertyOptional({ nullable: true, example: 'Facebook' })
  @ValidateIf(given)
  @Transform(trimmed)
  @IsString()
  @MaxLength(100)
  channel?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '2026-12-01' })
  @ValidateIf(given)
  @IsCalendarDate()
  startDate?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '2026-12-31' })
  @ValidateIf(given)
  @IsCalendarDate()
  endDate?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'VND' })
  @ValidateIf(given)
  @IsInt()
  @Min(0)
  budgetVnd?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(given)
  @IsUUID()
  ownerUserId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(given)
  @Transform(trimmed)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  /** CMP-2 */
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  @ValidateIf(given)
  @Type(() => Date)
  @IsDate()
  eventAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(given)
  @Transform(trimmed)
  @IsString()
  @MaxLength(300)
  location?: string | null;
}

export class CreateCampaignDto extends CampaignFieldsDto {
  @ApiProperty({ example: 'Hội thảo hưu trí tháng 12' })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  declare name: string;

  @ApiProperty({ enum: CAMPAIGN_TYPES })
  @IsIn(CAMPAIGN_TYPES)
  declare type: CampaignType;
}

/** CMP-2: invite or register leads for a seminar. */
export class AddMembersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_MEMBERS)
  @IsUUID(undefined, { each: true })
  leadIds: string[];

  @ApiProperty({ enum: MEMBER_STATUSES })
  @IsIn(MEMBER_STATUSES)
  status: MemberStatus;
}

export class UpdateMemberDto {
  @ApiProperty({ enum: MEMBER_STATUSES })
  @IsIn(MEMBER_STATUSES)
  status: MemberStatus;
}
