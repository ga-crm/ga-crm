import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
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
import { PageQueryDto } from '../../common/pagination.js';
import { TenantStatus } from '../tenants/infrastructure/tenant.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

class TenantHeadDto {
  @ApiProperty({ example: 'chu.ga@gacrm.local' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Lê Văn C' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: '00100001' })
  @IsOptional()
  @Matches(/^\d{1,20}$/)
  agentCode?: string;
}

export class CreateTenantDto {
  /** TENANT-1 */
  @ApiProperty({ example: 'GA-HCM-012' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @Matches(/^[A-Z0-9][A-Z0-9-]{1,30}[A-Z0-9]$/)
  gaCode: string;

  @ApiProperty({ example: 'Tổng đại lý HCM 012' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ type: TenantHeadDto })
  @ValidateNested()
  @Type(() => TenantHeadDto)
  head: TenantHeadDto;
}

/** Section 5.2: null (or absent) = no limit. */
export class TenantLimitsDto {
  @ApiPropertyOptional({ nullable: true, minimum: 1, example: 50 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  maxUsers?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, example: 5_000_000 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(1_000_000_000_000)
  aiTokensPerMonth?: number | null;

  @ApiPropertyOptional({ nullable: true, minimum: 1, example: 10_240 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  storageMb?: number | null;
}

export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: TenantStatus, enumName: 'TenantStatus' })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;

  @ApiPropertyOptional({ example: 'standard' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  plan?: string;

  @ApiPropertyOptional({ type: TenantLimitsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TenantLimitsDto)
  limits?: TenantLimitsDto;
}

export class ListTenantsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo mã GA hoặc tên' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: TenantStatus, enumName: 'TenantStatus' })
  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}
