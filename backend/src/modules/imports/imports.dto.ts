import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination.js';
import {
  IMPORT_KINDS,
  type ImportKind,
} from './infrastructure/import.entities.js';

export const MAX_ROWS_PER_CHUNK = 500; // Section 17.10
const MAX_CELLS_PER_ROW = 40;
const MAX_CELL_LENGTH = 4001; // Section 19.7: progress notes go up to 4000, and the extra one reports too_long

@ValidatorConstraint({ name: 'importCell' })
class ImportCellConstraint implements ValidatorConstraintInterface {
  validate(cells: unknown): boolean {
    return (
      Array.isArray(cells) &&
      cells.every(
        (cell) =>
          cell === null ||
          (typeof cell === 'number' && Number.isFinite(cell)) ||
          (typeof cell === 'string' && cell.length <= MAX_CELL_LENGTH),
      )
    );
  }

  defaultMessage(): string {
    return 'cells must be text of at most 4001 characters, numbers or null';
  }
}

class SheetHeadersDto {
  @ApiProperty({ example: '01_Agents' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(200)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  headers: string[];
}

class AgentMappingDto {
  @ApiProperty({ example: 'FC Trang' })
  @IsString()
  @MaxLength(200)
  value: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'null là chưa phân công',
  })
  @IsOptional()
  @Matches(/^\d{1,20}$/)
  agentCode: string | null;
}

/** IMP-23 and IMP-24 */
class LeadMappingDto {
  @ApiProperty({
    description: 'Trường → vị trí cột trong file',
    example: { fullName: 0 },
  })
  @IsObject()
  columns: Record<string, number>;

  @ApiProperty({ type: [AgentMappingDto] })
  @IsArray()
  @ArrayMaxSize(5000)
  @ValidateNested({ each: true })
  @Type(() => AgentMappingDto)
  agents: AgentMappingDto[];
}

export class MatchAgentsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(5000)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  values: string[];
}

export class CreateImportDto {
  @ApiProperty({ example: 'cay-dai-ly.xlsx' })
  @IsString()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({ example: '2026-11-06' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  snapshotDate: string;

  @ApiProperty({ enum: IMPORT_KINDS })
  @IsIn(IMPORT_KINDS)
  kind: ImportKind;

  @ApiProperty({ type: [SheetHeadersDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => SheetHeadersDto)
  sheets: SheetHeadersDto[];

  @ApiPropertyOptional({ type: LeadMappingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LeadMappingDto)
  mapping?: LeadMappingDto;
}

class ImportRowDto {
  @ApiProperty({ description: 'Số dòng trên Excel' })
  @IsInt()
  @Min(1)
  r: number;

  @ApiProperty({
    description: 'Giá trị theo đúng thứ tự cột `present` của kế hoạch',
    type: 'array',
    items: { oneOf: [{ type: 'string' }, { type: 'number' }] },
  })
  @ArrayMaxSize(MAX_CELLS_PER_ROW)
  @Validate(ImportCellConstraint)
  c: (string | number | null)[];
}

export class AddImportRowsDto {
  @ApiProperty({ example: '01_Agents' })
  @IsString()
  @MaxLength(100)
  sheet: string;

  @ApiProperty({ type: [ImportRowDto] })
  @IsArray()
  @ArrayMaxSize(MAX_ROWS_PER_CHUNK)
  @ValidateNested({ each: true })
  @Type(() => ImportRowDto)
  rows: ImportRowDto[];
}

/** DATA-7: import errors may be read 500 at a time. */
export class ListImportErrorsQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  pageSize: number = 25;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  sheet?: string;

  @ApiPropertyOptional({ enum: ['error', 'warning', 'skipped'] })
  @IsOptional()
  @IsIn(['error', 'warning', 'skipped'])
  severity?: 'error' | 'warning' | 'skipped';
}

export class ListImportsQueryDto extends PageQueryDto {}
