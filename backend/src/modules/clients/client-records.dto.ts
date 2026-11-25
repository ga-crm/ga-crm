import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { IsCalendarDate } from '../../common/validators.js';
import {
  CARE_RECORD_KINDS,
  POLICY_NO,
  REFERRAL_RELATIONS,
  REFERRAL_RESULTS,
} from './client.constants.js';
import type {
  CareRecordKind,
  ReferralRelation,
  ReferralResult,
} from './client.constants.js';

/** A blank text means "nothing": it is stored as null. */
const blankIsNull = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() || null : value;
/** One trillion dong: more than any gift or premium, and safe as a JavaScript number. */
const MAX_VND = 1_000_000_000_000;

/** Decided 26/11/2026: one care event of a client. What each kind must say: `careRecordIssues`. */
export class CareRecordDto {
  @ApiProperty({ enum: CARE_RECORD_KINDS })
  @IsIn(CARE_RECORD_KINDS)
  kind: CareRecordKind;

  @ApiProperty({ example: '2026-10-12' })
  @IsCalendarDate()
  occurredOn: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Tên sự kiện hoặc tên quà. Bắt buộc với GIFT, SIGNING_GIFT.',
  })
  @Transform(blankIsNull)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Cơ sở y tế hoặc địa điểm. Bắt buộc với CLAIM.',
  })
  @Transform(blankIsNull)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  place?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Số tiền hoặc giá trị (VND). Bắt buộc với SIGNING_CASH.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_VND)
  amountVnd?: number | null;

  @ApiPropertyOptional({
    nullable: true,
    example: '000000001',
    description: 'Hợp đồng liên quan, phải là hợp đồng của khách.',
  })
  @Transform(blankIsNull)
  @IsOptional()
  @Matches(POLICY_NO)
  policyNo?: string | null;

  /** PDP-1: never a diagnosis or a health condition. */
  @ApiPropertyOptional({ nullable: true })
  @Transform(blankIsNull)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class UpdateCareRecordDto extends PartialType(CareRecordDto) {}

/** Decided 26/11/2026: one person a client referred. */
export class ReferralDto {
  @ApiProperty({ example: 'Trần Văn Bạn' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  personName: string;

  @ApiProperty({ enum: REFERRAL_RELATIONS })
  @IsIn(REFERRAL_RELATIONS)
  relation: ReferralRelation;

  @ApiProperty({ example: '2026-10-12' })
  @IsCalendarDate()
  referredOn: string;

  @ApiProperty({ enum: REFERRAL_RESULTS })
  @IsIn(REFERRAL_RESULTS)
  result: ReferralResult;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Phí bảo hiểm của hợp đồng do giới thiệu, chỉ khi SUCCESS.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_VND)
  premiumVnd?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(blankIsNull)
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

export class UpdateReferralDto extends PartialType(ReferralDto) {}
