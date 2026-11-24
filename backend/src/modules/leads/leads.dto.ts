import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsEmail,
  IsIn,
  IsUUID,
  IsObject,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination.js';
import { IsBirthDate } from '../../common/validators.js';
import { CONTACT_TYPES } from './infrastructure/lead.entities.js';
import {
  LEAD_CARE_STATUSES,
  LEAD_INTERESTS,
  LEAD_STAGES,
  type LeadCareStatus,
  type LeadInterest,
  type LeadStage,
} from './lead-rules.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isSet = (_: unknown, value: unknown) => value !== undefined;

/** LEAD-21: one assignment takes at most this many leads. */
export const MAX_ASSIGN = 200;

export class ListLeadsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    description: 'Theo tên; theo số điện thoại chỉ với leads.manage (LEAD-35)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({
    example: 'LIFE',
    description: 'Mã trong Danh mục lead (OPT-1), hoặc NONE = chưa có',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  interest?: LeadInterest;

  @ApiPropertyOptional({
    example: 'CARING',
    description: 'Mã trong Danh mục lead (OPT-1), hoặc NONE = chưa có',
  })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  care?: LeadCareStatus;

  @ApiPropertyOptional({ enum: LEAD_STAGES })
  @IsOptional()
  @IsIn(LEAD_STAGES)
  stage?: LeadStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({
    description: 'Mã đại lý; NONE là chưa phân công; DEPARTED là lead của người đã nghỉ (câu 12e)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  assignee?: string;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Matches(ISO_DATE)
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @Matches(ISO_DATE)
  to?: string;

  @ApiPropertyOptional({ enum: ['1'] })
  @IsOptional()
  @IsIn(['1'])
  overdue?: '1';

  @ApiPropertyOptional({ enum: ['1'] })
  @IsOptional()
  @IsIn(['1'])
  isNew?: '1';

  @ApiPropertyOptional({ enum: ['1'] })
  @IsOptional()
  @IsIn(['1'])
  newComment?: '1';

  @ApiPropertyOptional({ enum: ['1'], description: 'Chỉ lead của tôi' })
  @IsOptional()
  @IsIn(['1'])
  mine?: '1';

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    description: 'Theo ngày nhận lead; mặc định theo LEAD-38',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class AssigneesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}

/** LEAD-3. The phone is checked by the service, because an invalid one has its own error code. */
export class CreateLeadDto {
  @ApiProperty({ example: 'Nguyễn Văn A' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName: string;

  @ApiProperty({ example: '0912345678' })
  @IsString()
  @MaxLength(30)
  phone: string;

  @ApiProperty({ example: 'Facebook' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  source: string;

  @ApiProperty({ description: 'Có hoặc không đều hợp lệ, nhưng phải trả lời' })
  @IsBoolean()
  consent: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  province?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  gender?: string;

  @ApiPropertyOptional({ example: '1990-01-15' })
  @IsOptional()
  @IsBirthDate()
  dob?: string;

  @ApiPropertyOptional({ description: 'Chỉ người quản lý lead' })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({ description: 'Trở thành ghi chú đầu tiên' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(4000)
  note?: string;

  @ApiPropertyOptional({ description: 'Chỉ người quản lý lead' })
  @IsOptional()
  @Matches(/^\d{1,20}$/)
  assignedAgentCode?: string;
}

export class UpdateLeadDto {
  @ApiPropertyOptional()
  @ValidateIf(isSet)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional()
  @ValidateIf(isSet)
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsBirthDate()
  dob?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  region?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  province?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional()
  @ValidateIf(isSet)
  @IsBoolean()
  consent?: boolean;

  /** LEAD-15: a shown value of the GA's catalogue, or the value the lead already has. */
  @ApiPropertyOptional({
    example: 'LIFE',
    description: `Mã trong Danh mục lead. Mã hệ thống: ${LEAD_INTERESTS.join(', ')}`,
  })
  @ValidateIf(isSet)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  interest?: LeadInterest;

  @ApiPropertyOptional({
    example: 'CARING',
    description: `Mã trong Danh mục lead. Mã hệ thống: ${LEAD_CARE_STATUSES.join(', ')}`,
  })
  @ValidateIf(isSet)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  careStatus?: LeadCareStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  lostReason?: string | null;

  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  nextActionAt?: Date | null;

  @ApiPropertyOptional({ description: 'Chữ và số, 4-20 ký tự' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  applicationNo?: string | null;

  @ApiPropertyOptional({ description: 'Đúng 9 chữ số' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  policyNo?: string | null;

  @ApiPropertyOptional({ enum: LEAD_STAGES, description: 'LEAD-19' })
  @ValidateIf(isSet)
  @IsIn(LEAD_STAGES)
  stage?: LeadStage;

  @ApiPropertyOptional({ description: 'Chỉ người quản lý lead' })
  @ValidateIf(isSet)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  source?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Chỉ người quản lý lead',
  })
  @IsOptional()
  @IsUUID()
  campaignId?: string | null;

  /** LEAD-19: an optional note on a manual stage move, kept in the lead's history. */
  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  stageNote?: string;
}

export class AssignLeadsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ASSIGN)
  @IsUUID(undefined, { each: true })
  leadIds: string[];

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'null là hủy phân công',
  })
  @IsOptional()
  @Matches(/^\d{1,20}$/)
  agentCode: string | null;
}

export class AddNoteDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;
}

export class AddActivityDto {
  @ApiProperty({ enum: CONTACT_TYPES })
  @IsIn(CONTACT_TYPES)
  type: (typeof CONTACT_TYPES)[number];

  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  note: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  outcome?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  occurredAt?: Date;
}

export class AddCommentDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  body: string;

  /** CMT-5: users named with @; each must be able to see the lead or client. */
  @ApiPropertyOptional({ type: [String], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsUUID(undefined, { each: true })
  mentions?: string[];
}

/** NOTE-8: the author changes their own note or contact text within 24 hours. */
export class EditNoteDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  outcome?: string | null;
}

/** LEAD-38: a named filter of the lead list, as the screen's URL holds it. */
export class SaveFilterDto {
  @ApiProperty({ example: 'Lead Facebook quá hạn' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;

  @ApiProperty({
    type: Object,
    example: { source: 'FACEBOOK', tab: 'overdue' },
    description:
      'Tham số bộ lọc trên URL của màn hình (tối đa 20, mỗi giá trị ≤ 200 ký tự)',
  })
  @IsObject()
  query: Record<string, string>;
}

/** LEAD-40 + PDP-6: SOFT can be undone for 30 days; PDP erases personal fields for good. */
export const DELETE_MODES = ['SOFT', 'PDP'] as const;

export class DeleteLeadDto {
  @ApiProperty({ example: 'Tạo nhầm, trùng với lead khác' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  @ApiProperty({ enum: DELETE_MODES })
  @IsIn(DELETE_MODES)
  mode: (typeof DELETE_MODES)[number];
}

/** LEAD-41: `mergeId` folds into `keepId`. */
export class MergeLeadsDto {
  @ApiProperty()
  @IsUUID()
  keepId: string;

  @ApiProperty()
  @IsUUID()
  mergeId: string;
}

/** CMT-5: people who could be mentioned, by name or email. */
export class MentionQueryDto {
  @ApiPropertyOptional({ example: 'Trang' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class AddTaskDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Type(() => Date)
  @IsDate()
  dueAt: Date;
}

export class UpdateTaskDto {
  @ApiPropertyOptional()
  @ValidateIf(isSet)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  @ValidateIf(isSet)
  @Type(() => Date)
  @IsDate()
  dueAt?: Date;

  @ApiPropertyOptional()
  @ValidateIf(isSet)
  @IsBoolean()
  done?: boolean;
}
