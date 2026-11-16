import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AI_PROVIDER_IDS } from './ai-providers.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

/** AI-15 */
export class SaveAiKeyDto {
  @ApiProperty({
    minLength: 8,
    maxLength: 500,
    description: 'Khóa API, chỉ ghi',
  })
  @Transform(trim)
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  apiKey: string;
}

/** AI-11: a provider and one of its models. */
export class ModelRefDto {
  @ApiProperty({ enum: AI_PROVIDER_IDS })
  @IsIn(AI_PROVIDER_IDS)
  provider: string;

  @ApiProperty({ example: 'gemini-3.5-flash' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Matches(/^[\w.:/-]+$/)
  model: string;
}

export class AiTiersDto {
  @ApiProperty({ type: ModelRefDto })
  @ValidateNested()
  @Type(() => ModelRefDto)
  FAST: ModelRefDto;

  @ApiProperty({ type: ModelRefDto })
  @ValidateNested()
  @Type(() => ModelRefDto)
  BALANCED: ModelRefDto;

  @ApiProperty({ type: ModelRefDto })
  @ValidateNested()
  @Type(() => ModelRefDto)
  DEEP: ModelRefDto;
}

/** Section 17.13 PUT /ai/admin/settings */
export class UpdateAiSettingsDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ type: AiTiersDto })
  @ValidateNested()
  @Type(() => AiTiersDto)
  tiers: AiTiersDto;

  @ApiProperty({ type: ModelRefDto })
  @ValidateNested()
  @Type(() => ModelRefDto)
  router: ModelRefDto;

  @ApiProperty({
    example: 0,
    description: 'Token mỗi tháng, 0 = không giới hạn',
  })
  @IsInt()
  @Min(0)
  @Max(1_000_000_000_000)
  monthlyTokenLimit: number;
}
