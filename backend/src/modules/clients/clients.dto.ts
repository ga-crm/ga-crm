import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsUUID,
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
import { IsBirthDate, IsCalendarDate } from '../../common/validators.js';
import {
  AGE_BANDS,
  APPLICATION_KEY,
  CLIENT_TIERS,
  GENDERS,
  MARITAL_STATUSES,
  PREMIUM_FREQUENCIES,
  PRODUCT_KEY,
  PRODUCT_ROLES,
} from './client.constants.js';
import { LIST_SIGNALS, RELATIONS } from './client-insights.js';
import type { ListSignal, Relation } from './client-insights.js';

/** CUS-14 */
export class ListClientsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    description:
      'Tên, mã hợp đồng (ra mọi người trên hợp đồng) hoặc số điện thoại',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: CLIENT_TIERS })
  @IsOptional()
  @IsIn(CLIENT_TIERS)
  tier?: string;

  /**
   * CUS-7 + CUS-14: "Khách hàng của". Agent codes separated by commas, filtered by ownership; `ALL`
   * means every client in scope. Absent: the clients the signed-in agent owns, or every client in
   * scope for someone without an agent code.
   */
  @ApiPropertyOptional({
    example: '00100004,00100005',
    description:
      'Mã đại lý cách nhau bởi dấu phẩy (tối đa 200), hoặc ALL. Lọc theo khách hàng đại lý **sở hữu**.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @Matches(/^(ALL|\d{1,20}(,\d{1,20}){0,199})$/)
  agents?: string;

  /** SIG-1 */
  @ApiPropertyOptional({ enum: LIST_SIGNALS })
  @IsOptional()
  @IsIn(LIST_SIGNALS)
  signal?: ListSignal;
}

const trimmed = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
/** Present and not null: null clears the field on PATCH (MAN-6). */
const given = (_: unknown, value: unknown) =>
  value !== undefined && value !== null;

/** PRD-1: one product for one insured person, in the order the GA asked for. */
export class ProductLineDto {
  @ApiPropertyOptional({
    example: 'Nguyễn Văn Con',
    description: 'Để trống = người được bảo hiểm chính',
  })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  insuredName?: string;

  @ApiPropertyOptional({ example: '2015-04-02' })
  @IsOptional()
  @IsBirthDate()
  insuredDob?: string;

  @ApiPropertyOptional({ enum: GENDERS })
  @IsOptional()
  @IsIn(GENDERS)
  insuredGender?: string;

  /**
   * PRD-2 as decided on 25/11/2026: a product of the shared catalogue (TENANT-5), by its code. A
   * line already on the policy may keep a code the catalogue no longer shows.
   */
  @ApiProperty({ example: 'P001' })
  @Matches(PRODUCT_KEY)
  productCode: string;

  @ApiPropertyOptional({ example: 500000000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  sumAssuredVnd?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 120 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(120)
  termYears?: number;

  @ApiPropertyOptional({ example: 'Đang hiệu lực' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(100)
  status?: string;

  @ApiPropertyOptional({ example: 10000000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  annualPremiumVnd?: number;

  @ApiPropertyOptional({
    enum: PRODUCT_ROLES,
    description: 'Mặc định theo danh mục (PRG-7)',
  })
  @IsOptional()
  @IsIn(PRODUCT_ROLES)
  productRole?: string;

  @ApiPropertyOptional({ example: '2024-06-01' })
  @IsOptional()
  @IsCalendarDate()
  startDate?: string;
}

/** POL-2. Used to add a policy, and (without policyNo and agentCode) to change one. */
/**
 * POL-2, as decided on 25/11/2026: every field but the number may come later (or from Success),
 * so a person can be put on a policy from its number alone.
 */
export class PolicyFieldsDto {
  @ApiPropertyOptional({ example: 'Đang hiệu lực' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  status?: string;

  @ApiPropertyOptional({ example: '2024-06-01' })
  @IsOptional()
  @IsCalendarDate()
  effectiveDate?: string;

  @ApiPropertyOptional({ example: '2044-06-01' })
  @IsOptional()
  @IsCalendarDate()
  maturityDate?: string;

  @ApiPropertyOptional({ enum: PREMIUM_FREQUENCIES })
  @IsOptional()
  @IsIn(PREMIUM_FREQUENCIES)
  premiumFrequency?: string;

  @ApiPropertyOptional({ example: 12000000 })
  @IsOptional()
  @IsInt()
  @Min(0)
  basePremiumVnd?: number;

  @ApiPropertyOptional({ example: '2027-06-01' })
  @IsOptional()
  @IsCalendarDate()
  premiumDueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  plannedPremiumVnd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  unpaidPremiumVnd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  aplDebtVnd?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasBeneficiary?: boolean;

  /** POL-2: blank = the client is also the main insured. */
  @ApiPropertyOptional({ example: 'Nguyễn Văn Con' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(200)
  insuredName?: string;

  @ApiPropertyOptional({ type: [ProductLineDto], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ProductLineDto)
  products?: ProductLineDto[];
}

export class CreatePolicyDto extends PolicyFieldsDto {
  /** POL-2: exactly 9 digits, unused in the GA. */
  @ApiProperty({ example: '000000123' })
  @IsString()
  policyNo: string;

  /** POL-2: blank = the person entering it, or the client's agent. */
  @ApiPropertyOptional({ example: '00100004' })
  @IsOptional()
  @Matches(/^\d{1,20}$/)
  agentCode?: string;
}

/** MAN-2 and MAN-6: the client fields a person may enter. */
export class ClientFieldsDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn Khách' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  /** CUS-3: kept by the GA. */
  @ApiPropertyOptional({ example: '0912345678', nullable: true })
  @ValidateIf(given)
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({ enum: CLIENT_TIERS, nullable: true })
  @ValidateIf(given)
  @IsIn(CLIENT_TIERS)
  tier?: string | null;

  @ApiPropertyOptional({ example: '1985-05-12', nullable: true })
  @ValidateIf(given)
  @IsBirthDate()
  dob?: string | null;

  /** MAN-2: blank is worked out from the birth date. */
  @ApiPropertyOptional({ enum: AGE_BANDS, nullable: true })
  @ValidateIf(given)
  @IsIn(AGE_BANDS)
  ageBand?: string | null;

  @ApiPropertyOptional({ enum: GENDERS, nullable: true })
  @ValidateIf(given)
  @IsIn(GENDERS)
  gender?: string | null;

  @ApiPropertyOptional({ enum: MARITAL_STATUSES, nullable: true })
  @ValidateIf(given)
  @IsIn(MARITAL_STATUSES)
  maritalStatus?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(given)
  @IsInt()
  @Min(0)
  loyaltyPoints?: number | null;

  @ApiPropertyOptional({ nullable: true, description: 'null = không rõ' })
  @ValidateIf(given)
  @IsBoolean()
  usesDconnect?: boolean | null;

  @ApiPropertyOptional({ nullable: true, example: '2026-11-01T08:30:00+07:00' })
  @ValidateIf(given)
  @IsISO8601({ strict: true })
  dconnectLastLoginAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(given)
  @IsBoolean()
  ekycRegistered?: boolean | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(given)
  @IsISO8601({ strict: true })
  ekycRegisteredAt?: string | null;

  /** PDP-1: whether the ID card was updated; the number is never stored. */
  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(given)
  @IsBoolean()
  idUpdated?: boolean | null;
}

/** The roles a person holds on a policy (CUS-11): owner, life insured, beneficiary. */
export const POLICY_ROLES = ['PO', 'LI', 'BEN'] as const;
export type PolicyRole = (typeof POLICY_ROLES)[number];

/**
 * MAN-1 to MAN-3, as decided on 25/11/2026: a client is added on a policy, by its number and the
 * role they hold. A number not in the GA yet starts a policy with only that number.
 */
export class CreateClientDto extends ClientFieldsDto {
  /** POL-2: exactly 9 digits; checked by the service so the error names the field. */
  @ApiProperty({ example: '000000123', description: 'Mã hợp đồng (số HĐBH)' })
  @IsString()
  policyNo: string;

  @ApiProperty({
    enum: POLICY_ROLES,
    description: 'PO bên mua BH, LI người được BH, BEN người thụ hưởng',
  })
  @IsIn(POLICY_ROLES)
  role: PolicyRole;

  @ApiProperty({ example: 'Nguyễn Văn Khách' })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  declare name: string;

  /** MAN-3 */
  @ApiPropertyOptional({ example: '00100004' })
  @IsOptional()
  @Matches(/^\d{1,20}$/)
  agentCode?: string;
}

/** FAM-2 to FAM-4: a relation to a client, or a relative who is not a client yet. */
export class FamilyInputDto {
  @ApiProperty({ enum: RELATIONS })
  @IsIn(RELATIONS)
  relation: Relation;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  note?: string;

  /** FAM-3: a client in scope, or someone on one of this client's policies. */
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  relatedClientId?: string;

  /** FAM-4: a relative who is not a client. */
  @ApiPropertyOptional({ example: 'Nguyễn Bé An' })
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional({ enum: GENDERS })
  @IsOptional()
  @IsIn(GENDERS)
  gender?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 31 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  birthDay?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  birthMonth?: number;

  @ApiPropertyOptional({ minimum: 1900, maximum: 2100 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  birthYear?: number;
}

/** FAM-2 + FAM-4: what may change on a relation; null clears an optional field. */
export class FamilyUpdateDto {
  @ApiPropertyOptional({ enum: RELATIONS })
  @IsOptional()
  @IsIn(RELATIONS)
  relation?: Relation;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(given)
  @Transform(trimmed)
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fullName?: string;

  @ApiPropertyOptional({ enum: GENDERS, nullable: true })
  @ValidateIf(given)
  @IsIn(GENDERS)
  gender?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(given)
  @IsInt()
  @Min(1)
  @Max(31)
  birthDay?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(given)
  @IsInt()
  @Min(1)
  @Max(12)
  birthMonth?: number | null;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(given)
  @IsInt()
  @Min(1900)
  @Max(2100)
  birthYear?: number | null;
}

/** FAM-6: the lead made for a relative; the name comes from the family record. */
export class FamilyNewLeadDto {
  @ApiProperty({ example: '0912345678' })
  @IsString()
  @MaxLength(30)
  phone: string;

  @ApiProperty()
  @IsBoolean()
  consent: boolean;
}

/** FAM-6: link a lead the person sees, or create one for the relative. */
export class FamilyLeadDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  leadId?: string;

  @ApiPropertyOptional({ type: () => FamilyNewLeadDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FamilyNewLeadDto)
  create?: FamilyNewLeadDto;
}

/** ASG-1: one assignment takes at most this many clients. */
export const MAX_CLIENT_ASSIGN = 200;

/** ASG-1 to ASG-3: hand clients to one agent of the GA, or take the hand-made link away. */
export class AssignClientsDto {
  @ApiProperty({ type: [String], format: 'uuid' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CLIENT_ASSIGN)
  @IsUUID('all', { each: true })
  clientIds: string[];

  /** Required, so a body that forgets it never unassigns by accident. */
  @ApiProperty({
    nullable: true,
    type: String,
    example: '00100004',
    description: 'null là bỏ phân công (chỉ xóa liên kết MANUAL, ASG-3)',
  })
  @ValidateIf((_, value) => value !== null)
  @Matches(/^\d{1,20}$/)
  agentCode: string | null;
}

/** LEAD-32: the client a lead became, and the application if the agent knows it. */
export class LinkLeadDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  clientId: string;

  @ApiPropertyOptional({ example: 'A0001' })
  @IsOptional()
  @Matches(APPLICATION_KEY)
  applicationNo?: string;
}

/** LEAD-32: undoing a link needs a reason. */
export class UnlinkLeadDto {
  @ApiProperty({ example: 'Liên kết nhầm khách hàng trùng tên' })
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}

export class LinkSuggestionsQueryDto {
  @ApiPropertyOptional({
    description: 'Tìm theo tên, mã hợp đồng hoặc số điện thoại',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;
}
