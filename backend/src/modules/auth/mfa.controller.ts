import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import type { Request } from 'express';
import {
  AllowMfaPending,
  AllowMfaSetup,
  CurrentActor,
  RequirePermissions,
  SESSION_COOKIE,
} from '../../common/auth.decorators.js';
import { Permission } from '../../common/rbac.js';
import type { Actor } from '../../common/rbac.js';
import type { Env } from '../../config/env.validation.js';
import { MfaService } from './mfa.service.js';
import { readSessionToken } from './session-cookie.js';

export class MfaCodeDto {
  @ApiProperty({
    example: '123456',
    description: 'Mã 6 số trong ứng dụng, hoặc một mã dự phòng',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;
}

/** Section 17.2 + USER-16: TOTP MFA of the signed-in person. */
@ApiTags('Auth')
@ApiCookieAuth(SESSION_COOKIE)
@Throttle({ default: { ttl: 60_000, limit: 20 } })
@Controller('auth/mfa')
export class MfaController {
  constructor(
    private readonly mfa: MfaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('verify')
  @AllowMfaPending()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Nhập mã MFA sau khi đăng nhập',
    description:
      'Mã 6 số hoặc mã dự phòng. Lỗi: `invalid_code`, 429 khi sai nhiều lần.',
  })
  @ApiNoContentResponse()
  async verify(
    @CurrentActor() actor: Actor,
    @Req() req: Request,
    @Body() dto: MfaCodeDto,
  ): Promise<void> {
    await this.mfa.verify(
      actor,
      readSessionToken(req, this.config) ?? '',
      dto.code,
    );
  }

  @Get()
  @AllowMfaSetup()
  @ApiOperation({ summary: 'Trạng thái MFA của tôi' })
  status(@CurrentActor() actor: Actor) {
    return this.mfa.status(actor);
  }

  @Post('setup')
  @AllowMfaSetup()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bắt đầu cài MFA',
    description:
      'Trả khóa bí mật và link `otpauth://` để quét bằng ứng dụng xác thực. Chưa có hiệu lực tới khi xác nhận.',
  })
  setup(@CurrentActor() actor: Actor) {
    return this.mfa.setup(actor);
  }

  @Post('enable')
  @AllowMfaSetup()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Xác nhận cài MFA bằng mã đầu tiên',
    description: 'Trả 10 mã dự phòng, chỉ hiện một lần. Lỗi: `invalid_code`.',
  })
  enable(@CurrentActor() actor: Actor, @Body() dto: MfaCodeDto) {
    return this.mfa.enable(actor, dto.code);
  }

  @Post('recovery-codes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tạo mã dự phòng mới (mã cũ hết hiệu lực)' })
  regenerate(@CurrentActor() actor: Actor, @Body() dto: MfaCodeDto) {
    return this.mfa.regenerate(actor, dto.code);
  }

  @Post('disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Tắt MFA',
    description:
      'Cần mã. Lỗi: `mfa_mandatory` với Chủ GA, Admin, Platform Admin, hoặc khi GA bắt buộc.',
  })
  @ApiNoContentResponse()
  async disable(
    @CurrentActor() actor: Actor,
    @Body() dto: MfaCodeDto,
  ): Promise<void> {
    await this.mfa.disable(actor, dto.code);
  }
}

/** USER-16: a lost phone. Lives here, beside the MFA service, under the users path. */
@ApiTags('Users')
@ApiCookieAuth(SESSION_COOKIE)
@RequirePermissions(Permission.UsersManage)
@Controller('users')
export class MfaAdminController {
  constructor(private readonly mfa: MfaService) {}

  @Post(':id/mfa/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Đặt lại MFA (mất điện thoại)',
    description:
      'Quyền `users.manage`. Xóa MFA và đăng xuất mọi nơi; người dùng cài lại ở lần đăng nhập sau. Có audit.',
  })
  @ApiNoContentResponse()
  async reset(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<void> {
    await this.mfa.reset({ tenantId: actor.tenantId! }, actor, id);
  }
}
