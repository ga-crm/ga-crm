import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination.js';
import {
  Permission,
  Role,
  TENANT_ROLES,
  UI_THEMES,
} from '../../common/rbac.js';
import type { Reach, UiTheme } from '../../common/rbac.js';
import { UserStatus } from './infrastructure/user.entity.js';
import type { User } from './infrastructure/user.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class InviteUserDto {
  @ApiProperty({ example: 'fc.moi@gacrm.local' })
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Trần Thị B' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  /** ROLE-3: PLATFORM_ADMIN is not assignable here. */
  @ApiProperty({ enum: TENANT_ROLES, isArray: true, example: [Role.FC] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(TENANT_ROLES, { each: true })
  roles: Role[];

  @ApiPropertyOptional({
    example: '00123456',
    description:
      'Bắt buộc với FC, UM, BM, GAD. Chỉ gồm chữ số, giữ nguyên số 0 ở đầu.',
  })
  @IsOptional()
  @Matches(/^\d{1,20}$/)
  agentCode?: string;
}

export class UpdateUserDto {
  /** USER-6: normalised like an invite; must be unused across the system (USER-2). */
  @ApiPropertyOptional({ example: 'fc.moi@gacrm.local' })
  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Trần Thị B' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: TENANT_ROLES, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(TENANT_ROLES, { each: true })
  roles?: Role[];

  @ApiPropertyOptional({ type: String, nullable: true, example: '00123456' })
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @Matches(/^\d{1,20}$/)
  agentCode?: string | null;
}

/** USER-9: why the user left, kept on the user record only. */
export class ArchiveUserDto {
  @ApiPropertyOptional({ example: 'Nghỉ việc từ 01/11/2026', maxLength: 200 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  reason?: string;
}

export class ListUsersQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo họ tên, email hoặc mã đại lý' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: Role, enumName: 'Role' })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @ApiPropertyOptional({
    enum: UserStatus,
    enumName: 'UserStatus',
    description: 'Mặc định không gồm người dùng đã lưu trữ (USER-7)',
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    description:
      'Thứ tự theo lần đăng nhập gần nhất; mặc định là người mới tạo trước',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  order?: 'asc' | 'desc';
}

export class UserDto {
  /** USER-7: null means this agent code is not on the tree yet. */
  @ApiPropertyOptional({ nullable: true, type: String })
  agentName?: string | null;

  @ApiProperty({ example: '665f1c2e8a1b2c3d4e5f6a7b' })
  id: string;

  @ApiProperty({ example: 'fc1@ga1.gacrm.local' })
  email: string;

  @ApiProperty({ example: 'Trần Thị B' })
  name: string;

  @ApiProperty({ enum: Role, enumName: 'Role', isArray: true })
  roles: Role[];

  @ApiPropertyOptional({ example: '00123456' })
  agentCode?: string;

  @ApiProperty({ enum: UserStatus, enumName: 'UserStatus' })
  status: UserStatus;

  @ApiPropertyOptional()
  lastLoginAt?: Date;

  @ApiPropertyOptional({
    description: 'USER-9: khi nào người dùng được lưu trữ',
  })
  archivedAt?: Date;

  @ApiPropertyOptional()
  archiveReason?: string;

  @ApiProperty({ description: 'USER-16: đã bật xác thực hai lớp' })
  mfaEnabled: boolean;

  @ApiProperty()
  createdAt: Date;
}

export class UsersPageDto {
  @ApiProperty({ type: [UserDto] })
  items: UserDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 25 })
  pageSize: number;

  @ApiProperty({ example: 1 })
  total: number;
}

export class InvitedUserDto {
  @ApiProperty({ type: UserDto })
  user: UserDto;

  @ApiProperty({ example: 'http://localhost:5173/invite/abc' })
  inviteUrl: string;
}

export class ResetUrlDto {
  @ApiProperty({ example: 'http://localhost:5173/reset-password/abc' })
  resetUrl: string;
}

export class AdminSetPasswordDto {
  /** USER-4: the same length rule as activating an account. */
  @ApiProperty({ minLength: 8, maxLength: 128, example: 'mat-khau-moi-123' })
  @IsString()
  @Matches(/^[\s\S]{8,128}$/)
  password: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  token: string;

  @ApiProperty({ minLength: 8, maxLength: 128, example: 'mat-khau-moi-123' })
  @IsString()
  @Matches(/^[\s\S]{8,128}$/)
  password: string;
}

export class PasswordResetInfoDto {
  @ApiProperty({ example: 'fc1@ga1.gacrm.local' })
  email: string;
}

export class InviteUrlDto {
  @ApiProperty({ example: 'http://localhost:5173/invite/abc' })
  inviteUrl: string;
}

/** Unset fields stay out of the JSON, as they did with MongoDB, so the API contract is unchanged. */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    roles: user.roles as Role[],
    agentCode: user.agentCode ?? undefined,
    status: user.status,
    lastLoginAt: user.lastLoginAt ?? undefined,
    archivedAt: user.archivedAt ?? undefined,
    archiveReason: user.archiveReason ?? undefined,
    mfaEnabled: user.mfaEnabled ?? false,
    createdAt: user.createdAt,
  };
}

export class AcceptInviteDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  token: string;

  /** USER-4 */
  @ApiProperty({ minLength: 8, maxLength: 128, example: 'mat-khau-moi-123' })
  @IsString()
  @Matches(/^[\s\S]{8,128}$/)
  password: string;
}

export class InviteInfoDto {
  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: String, nullable: true })
  tenantName: string | null;
}

export class SignInDto {
  @ApiProperty({ example: 'head@ga1.gacrm.local' })
  @Transform(normalizeEmail)
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Demo@2026' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}

export class AppearanceDto {
  @ApiProperty({ enum: UI_THEMES, example: 'dark' })
  @IsIn(UI_THEMES)
  theme: UiTheme;

  @ApiProperty({ example: '#0057d2', description: 'Màu nhấn dạng #rrggbb' })
  @Matches(/^#[0-9a-fA-F]{6}$/)
  accent: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword: string;

  /** USER-4: the same length rule as activating an account. */
  @ApiProperty({ minLength: 8, maxLength: 128, example: 'mat-khau-moi-123' })
  @IsString()
  @Matches(/^[\s\S]{8,128}$/)
  newPassword: string;
}

export class UpdateMeDto {
  @ApiPropertyOptional({ example: 'Nguyễn Văn A' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ type: AppearanceDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AppearanceDto)
  appearance?: AppearanceDto;
}

class MeUserDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  email: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  agentCode?: string;
}

class MeTenantDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'GA-HN' })
  gaCode: string;

  @ApiProperty()
  name: string;
}

/** Section 17.2: GET /me */
export class MeDto {
  @ApiProperty({ type: MeUserDto })
  user: MeUserDto;

  @ApiProperty({ type: MeTenantDto, nullable: true })
  tenant: MeTenantDto | null;

  @ApiProperty({ enum: Role, enumName: 'Role', isArray: true })
  roles: Role[];

  @ApiProperty({ enum: Permission, enumName: 'Permission', isArray: true })
  permissions: Permission[];

  @ApiProperty({ enum: ['TENANT', 'DOWNLINE', 'OWN', 'NONE'] })
  reach: Reach;

  @ApiProperty({ type: AppearanceDto })
  appearance: AppearanceDto;

  @ApiProperty({ type: Object })
  settings: Record<string, unknown>;

  @ApiProperty({
    type: Object,
    description: 'USER-16: `{enabled, required, setupRequired}`',
  })
  mfa: { enabled: boolean; required: boolean; setupRequired: boolean };
}
