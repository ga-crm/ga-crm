import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
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
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PRODUCT_KEY, PRODUCT_ROLES } from '../clients/client.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/** A blank cell of the file or form means "not given". */
const blankIsNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' && value.trim() === '' ? null : trim({ value });
const given = (_: object, value: unknown) =>
  value !== null && value !== undefined;

export const RULE_STATUSES = ['DRAFT', 'APPROVED'] as const;

/** Section 19.9: one row of 11_Products, also what the form sends. */
export class ProductRowDto {
  @ApiProperty({ example: 'P001' })
  @Transform(trim)
  @Matches(PRODUCT_KEY)
  productCode: string;

  @ApiProperty({ example: 'An Phát Đầu Tư Thịnh Vượng' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  productName: string;

  @ApiProperty({ enum: PRODUCT_ROLES })
  @IsIn(PRODUCT_ROLES)
  productRole: (typeof PRODUCT_ROLES)[number];

  /** COV-3: decides the benefit group, e.g. "Sức khỏe", "Tai nạn", "Bệnh hiểm nghèo". */
  @ApiPropertyOptional({ nullable: true, example: 'Sức khỏe' })
  @Transform(blankIsNull)
  @ValidateIf(given)
  @IsString()
  @MaxLength(100)
  category?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(given)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  minEntryAge?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(given)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  maxEntryAge?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(given)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  maxCoverAge?: number | null;

  @ApiPropertyOptional({ nullable: true, example: 'Nam, Nữ' })
  @Transform(blankIsNull)
  @ValidateIf(given)
  @IsString()
  @MaxLength(30)
  gender?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '30 ngày' })
  @Transform(blankIsNull)
  @ValidateIf(given)
  @IsString()
  @MaxLength(200)
  waitingPeriod?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(blankIsNull)
  @ValidateIf(given)
  @IsString()
  @MaxLength(4000)
  keyBenefits?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(blankIsNull)
  @ValidateIf(given)
  @IsString()
  @MaxLength(4000)
  fitRule?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(blankIsNull)
  @ValidateIf(given)
  @IsString()
  @MaxLength(4000)
  triggerEvent?: string | null;

  @ApiPropertyOptional({ enum: RULE_STATUSES, default: 'DRAFT' })
  @IsOptional()
  @IsIn(RULE_STATUSES)
  ruleStatus?: (typeof RULE_STATUSES)[number];
}

/** TENANT-5 + section 17: `{rows}` of 1-500, upserted by product code. */
export class SaveProductsDto {
  @ApiProperty({ type: [ProductRowDto], minItems: 1, maxItems: 500 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ProductRowDto)
  rows: ProductRowDto[];

  /** A file upload is audited as an import; a form save as a create or an update. */
  @ApiPropertyOptional({ description: 'true khi gửi từ file 11_Products' })
  @IsOptional()
  @IsBoolean()
  fromFile?: boolean;
}

/** Hide or show a product; a hidden one is not offered for new policies and leads. */
export class UpdateProductDto {
  @ApiProperty()
  @IsBoolean()
  active: boolean;
}
