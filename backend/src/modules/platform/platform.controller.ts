import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentActor,
  RequireRoles,
  SESSION_COOKIE,
} from '../../common/auth.decorators.js';
import { IdPipe } from '../../common/pagination.js';
import { Role } from '../../common/rbac.js';
import type { Actor } from '../../common/rbac.js';
import {
  InviteUrlDto,
  ListUsersQueryDto,
  UsersPageDto,
} from '../users/users.dto.js';
import {
  CreateTenantDto,
  ListTenantsQueryDto,
  PlatformSettingsDto,
  UpdateTenantDto,
} from './platform.dto.js';
import { PlatformService } from './platform.service.js';

@ApiTags('Platform')
@ApiCookieAuth(SESSION_COOKIE)
@ApiForbiddenResponse({ description: 'forbidden: chỉ Quản trị nền tảng' })
@RequireRoles(Role.PlatformAdmin)
@Controller('platform/tenants')
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách GA' })
  list(@Query() query: ListTenantsQueryDto) {
    return this.platform.listTenants(query);
  }

  @Post()
  @ApiOperation({
    summary: 'Tạo GA và tài khoản Chủ GA đầu tiên',
    description: 'Trả về inviteUrl để Chủ GA kích hoạt tài khoản.',
  })
  @ApiConflictResponse({ description: 'ga_code_taken, email_taken' })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateTenantDto) {
    return this.platform.createTenant(actor, dto);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sửa tên, gói cước, tạm đình chỉ / kích hoạt lại GA',
  })
  @ApiNoContentResponse()
  async update(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: UpdateTenantDto,
  ): Promise<void> {
    await this.platform.updateTenant(actor, id, dto);
  }

  @Get(':id/users')
  @ApiOperation({
    summary: 'Người dùng của một GA',
    description: 'Ghi kiểm toán CROSS_TENANT_READ.',
  })
  @ApiOkResponse({ type: UsersPageDto })
  listUsers(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Query() query: ListUsersQueryDto,
  ) {
    return this.platform.listTenantUsers(actor, id, query);
  }

  @Post(':id/users/:userId/invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cấp lại link mời' })
  @ApiOkResponse({ type: InviteUrlDto })
  @ApiConflictResponse({ description: 'not_invited' })
  async resendInvite(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Param('userId', IdPipe) userId: string,
  ): Promise<InviteUrlDto> {
    return { inviteUrl: await this.platform.resendInvite(actor, id, userId) };
  }

  @Post(':id/users/:userId/mfa/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Đặt lại MFA cho người dùng của GA (USER-16)',
    description:
      'Khi Chủ GA duy nhất mất điện thoại. Ghi `CROSS_TENANT_READ` rồi audit thao tác; người dùng bị đăng xuất mọi nơi.',
  })
  @ApiNoContentResponse()
  async resetMfa(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Param('userId', IdPipe) userId: string,
  ): Promise<void> {
    await this.platform.resetMfa(actor, id, userId);
  }
}

/** USER-16: switches for the whole platform, above every GA's own settings. */
@ApiTags('Platform')
@ApiCookieAuth(SESSION_COOKIE)
@ApiForbiddenResponse({ description: 'forbidden: chỉ Quản trị nền tảng' })
@RequireRoles(Role.PlatformAdmin)
@Controller('platform/settings')
export class PlatformSettingsController {
  constructor(private readonly platform: PlatformService) {}

  @Get()
  @ApiOperation({ summary: 'Cài đặt nền tảng' })
  @ApiOkResponse({ type: PlatformSettingsDto })
  get(): Promise<PlatformSettingsDto> {
    return this.platform.settings();
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Lưu cài đặt nền tảng',
    description:
      'Tắt `mfaEnforced`: không tài khoản nào bị buộc cài xác thực hai lớp, ở mọi GA; người đã bật vẫn phải nhập mã (USER-16). Có kiểm toán `SETTINGS_CHANGE`.',
  })
  @ApiNoContentResponse()
  async update(
    @CurrentActor() actor: Actor,
    @Body() dto: PlatformSettingsDto,
  ): Promise<void> {
    await this.platform.updateSettings(actor, dto);
  }
}
