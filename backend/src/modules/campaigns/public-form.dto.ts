import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  Equals,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { FORM_FIELDS } from '../leads/infrastructure/lead.entities.js';
import type { FormField } from '../leads/infrastructure/lead.entities.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const blankToUndefined = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || undefined : value;

/** CMP-4: the form's settings on its campaign (campaigns.manage). */
export class PublicFormSettingsDto {
  @ApiProperty()
  @IsBoolean()
  enabled: boolean;

  @ApiProperty({ enum: FORM_FIELDS, isArray: true })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(FORM_FIELDS.length)
  @IsIn(FORM_FIELDS, { each: true })
  fields: FormField[];

  @ApiProperty({ description: 'Nội dung đồng ý liên hệ hiện cạnh ô đánh dấu' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  consentText: string;

  @ApiProperty({ description: 'Thông báo quyền riêng tư của GA' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  privacyNotice: string;
}

/** Section 17.9 POST /public/forms/{slug} */
export class SubmitFormDto {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName: string;

  @ApiProperty({ example: '0912345678' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  phone: string;

  @ApiProperty({ description: 'Phải là true (bắt buộc đồng ý để gửi)' })
  @Equals(true)
  consent: true;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToUndefined)
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(100)
  province?: string;

  @ApiPropertyOptional({ description: 'Nhu cầu, viết tự do' })
  @IsOptional()
  @Transform(blankToUndefined)
  @IsString()
  @MaxLength(500)
  need?: string;

  @ApiPropertyOptional({ description: 'Token của Cloudflare Turnstile' })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  turnstileToken?: string;
}
