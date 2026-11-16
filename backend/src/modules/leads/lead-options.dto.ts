import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LEAD_OPTION_KINDS } from './infrastructure/lead.entities.js';
import type {
  LeadOption,
  LeadOptionKind,
} from './infrastructure/lead.entities.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateLeadOptionDto {
  @ApiProperty({ enum: LEAD_OPTION_KINDS })
  @IsIn(LEAD_OPTION_KINDS)
  kind: LeadOptionKind;

  /** OPT-3: at most 60 characters. */
  @ApiProperty({ example: 'Quan tâm hưu trí', maxLength: 60 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label: string;

  @ApiPropertyOptional({ description: 'Chỉ với Nhu cầu: tính là cơ hội' })
  @IsOptional()
  @IsBoolean()
  isOpportunity?: boolean;

  @ApiPropertyOptional({ description: 'Chỉ với Nhu cầu: khóa sau khi chọn' })
  @IsOptional()
  @IsBoolean()
  isFinal?: boolean;
}

/** Open question D: a whole list at once, one label per entry (OPT-3: at most 60 characters each). */
export class BulkLeadOptionsDto {
  @ApiProperty({ enum: LEAD_OPTION_KINDS })
  @IsIn(LEAD_OPTION_KINDS)
  kind: LeadOptionKind;

  @ApiProperty({ type: [String], maxItems: 200, example: ['Miền Bắc', 'Miền Trung', 'Miền Nam'] })
  @Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map((item) => (typeof item === 'string' ? item.trim() : item)) : value,
  )
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  @MaxLength(60, { each: true })
  labels: string[];
}

export class UpdateLeadOptionDto {
  @ApiPropertyOptional({ maxLength: 60 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOpportunity?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFinal?: boolean;

  @ApiPropertyOptional({ description: 'Hiện trong ô chọn' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ minimum: 0, maximum: 10000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}

export class LeadOptionDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ enum: LEAD_OPTION_KINDS })
  kind: LeadOptionKind;

  @ApiProperty({ example: 'LIFE' })
  code: string;

  @ApiProperty({ example: 'Quan tâm nhân thọ' })
  label: string;

  @ApiProperty()
  isOpportunity: boolean;

  @ApiProperty()
  isFinal: boolean;

  @ApiProperty()
  active: boolean;

  @ApiProperty()
  sortOrder: number;

  @ApiProperty()
  builtIn: boolean;
}

export class LeadOptionsDto {
  @ApiProperty({ type: [LeadOptionDto] })
  items: LeadOptionDto[];
}

export const toLeadOptionDto = (option: LeadOption): LeadOptionDto => ({
  id: option.id,
  kind: option.kind,
  code: option.code,
  label: option.label,
  isOpportunity: option.isOpportunity,
  isFinal: option.isFinal,
  active: option.active,
  sortOrder: option.sortOrder,
  builtIn: option.builtIn,
});
