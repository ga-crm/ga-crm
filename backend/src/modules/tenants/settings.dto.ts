import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ProfileDto {
  /** Empty clears it, and the app shows the name the platform gave the GA again. */
  @ApiPropertyOptional({ example: 'GA BẮC TỪ LIÊM', maxLength: 120 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiPropertyOptional({
    example: '12 Phạm Văn Đồng, Bắc Từ Liêm, Hà Nội',
    maxLength: 300,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  address?: string;
}

export class LeadRulesDto {
  /** LEAD-29 */
  @ApiPropertyOptional({ example: 48, minimum: 1, maximum: 720 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  contactDeadlineHours?: number;

  /** LEAD-30 */
  @ApiPropertyOptional({ example: 24, minimum: 1, maximum: 720 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(720)
  contactedInTimeHours?: number;

  /** Decided 27/11/2026: days without care before a lead goes back to the pool. */
  @ApiPropertyOptional({ example: 30, minimum: 1, maximum: 365 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  abandonDays?: number;

  @ApiPropertyOptional({ description: 'OPEN: lưu lại, chưa có hiệu lực' })
  @IsOptional()
  @IsBoolean()
  managersMayReassign?: boolean;

  @ApiPropertyOptional({
    description: 'LEAD-26: áp dụng khi có chiến dịch telesales',
  })
  @IsOptional()
  @IsBoolean()
  consentForTelesales?: boolean;
}

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Section 5.2 + NTF-3: quiet hours, Vietnam time. */
export class QuietHoursDto {
  @ApiProperty({ example: '21:00' })
  @Matches(HH_MM)
  from: string;

  @ApiProperty({ example: '07:30' })
  @Matches(HH_MM)
  to: string;
}

export class NotificationSettingsDto {
  @ApiProperty({ type: QuietHoursDto })
  @ValidateNested()
  @Type(() => QuietHoursDto)
  quietHours: QuietHoursDto;
}

/** USER-16 */
export class SecuritySettingsDto {
  @ApiProperty({ description: 'Bắt buộc MFA cho mọi người trong GA' })
  @IsBoolean()
  mfaForAll: boolean;
}

/** Section 5.2: only the parts sent change; `version` must be the one the form was opened with. */
export class UpdateSettingsDto {
  @ApiProperty({
    example: 3,
    description:
      'Phiên bản đã đọc; khác phiên bản hiện tại → 409 stale_settings',
  })
  @IsInt()
  @Min(0)
  version: number;

  @ApiPropertyOptional({ type: ProfileDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ProfileDto)
  profile?: ProfileDto;

  @ApiPropertyOptional({ type: LeadRulesDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LeadRulesDto)
  leadRules?: LeadRulesDto;

  @ApiPropertyOptional({ type: NotificationSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationSettingsDto)
  notifications?: NotificationSettingsDto;

  @ApiPropertyOptional({ type: SecuritySettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SecuritySettingsDto)
  security?: SecuritySettingsDto;
}
