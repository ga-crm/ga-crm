import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProperty,
  ApiTags,
} from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import type { Request, Response } from 'express';
import {
  AllowMfaPending,
  AllowMfaSetup,
  Public,
} from '../../common/auth.decorators.js';
import { notFound } from '../../common/errors.js';
import type { Env } from '../../config/env.validation.js';
import { MeDto } from '../users/users.dto.js';
import { AuthService } from './auth.service.js';
import { MeService } from './me.service.js';
import { readSessionToken, setSessionCookie } from './session-cookie.js';

export class DevSwitchDto {
  @ApiProperty({ description: 'Id của tài khoản muốn đăng nhập' })
  @IsUUID()
  userId: string;
}

/**
 * Account switcher for testing, on only with DEV_ACCOUNT_SWITCHER=true (never in production: the API
 * refuses to start that way). Off, both routes answer 404 as if they did not exist.
 */
@ApiTags('Dev')
@Public()
@AllowMfaPending()
@AllowMfaSetup()
@Controller('dev')
export class DevSwitchController {
  constructor(
    private readonly auth: AuthService,
    private readonly me: MeService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private assertOn(): void {
    const on =
      this.config.get('DEV_ACCOUNT_SWITCHER', { infer: true }) === 'true' &&
      this.config.get('NODE_ENV', { infer: true }) !== 'production';
    if (!on) throw notFound();
  }

  @Get('accounts')
  @ApiOperation({
    summary: 'Mọi tài khoản để chuyển nhanh (chỉ môi trường thử)',
    description:
      'Cần DEV_ACCOUNT_SWITCHER=true; tắt thì trả 404. Không có ở production.',
  })
  async accounts() {
    this.assertOn();
    return { items: await this.auth.devAccounts() };
  }

  @Post('switch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đăng nhập thẳng bằng một tài khoản (chỉ môi trường thử)',
    description:
      'Không cần mật khẩu hay mã MFA. Ghi kiểm toán LOGIN kèm via: dev-switch.',
  })
  @ApiOkResponse({ type: MeDto })
  async switch(
    @Body() dto: DevSwitchDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertOn();
    const { actor, token } = await this.auth.devSwitch(
      dto.userId,
      readSessionToken(req, this.config),
    );
    setSessionCookie(res, token, this.auth.sessionTtlMs, this.config);
    return this.me.get(actor);
  }
}
