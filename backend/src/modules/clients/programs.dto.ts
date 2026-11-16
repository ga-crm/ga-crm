import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
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
} from 'class-validator';
import { PRODUCT_KEY, PRODUCT_ROLES } from './client.constants.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateProgramDto {
  @ApiProperty({ example: 'Bảo hiểm Hưu Trí An Nhàn', maxLength: 200 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label: string;

  @ApiProperty({ enum: PRODUCT_ROLES })
  @IsIn(PRODUCT_ROLES)
  productRole: (typeof PRODUCT_ROLES)[number];

  /** PRG-6 */
  @ApiPropertyOptional({
    example: 'P001',
    description: 'Mã sản phẩm trên 11_Products, nếu biết',
  })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, value) => value !== '')
  @Matches(PRODUCT_KEY)
  productCode?: string;
}

export class UpdateProgramDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional({ enum: PRODUCT_ROLES })
  @IsOptional()
  @IsIn(PRODUCT_ROLES)
  productRole?: (typeof PRODUCT_ROLES)[number];

  @ApiPropertyOptional({
    nullable: true,
    description: 'Chuỗi rỗng hoặc null để xóa',
  })
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, value) => value !== '' && value !== null)
  @Matches(PRODUCT_KEY)
  productCode?: string | null;

  @ApiPropertyOptional()
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
