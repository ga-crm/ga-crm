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

/** 127.0.0.0/8 and ::1, also written as IPv4 inside IPv6. */
export function isLoopback(address: string | undefined): boolean {
  if (!address) return false;
  const plain = address.replace(/^::ffff:/i, '');
  return plain === '::1' || /^127\.\d+\.\d+\.\d+$/.test(plain);
}

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

  /**
   * On only with the flag, outside production, and for a caller on this machine. Signing in with no
   * password must never reach another computer, even when a laptop or a misconfigured server
   * shares a network. The socket address is used, not req.ip, so X-Forwarded-For cannot fake it;
   * the Vite dev proxy connects from this machine.
   */
  private assertOn(req: Request): void {
    const on =
      this.config.get('DEV_ACCOUNT_SWITCHER', { infer: true }) === 'true' &&
      this.config.get('NODE_ENV', { infer: true }) !== 'production' &&
      isLoopback(req.socket.remoteAddress);
    if (!on) throw notFound();
  }

  @Get('accounts')
  @ApiOperation({
    summary: 'Mọi tài khoản để chuyển nhanh (chỉ môi trường thử)',
    description:
      'Cần DEV_ACCOUNT_SWITCHER=true và gọi từ chính máy chạy API; nếu không trả 404. Không có ở production.',
  })
  async accounts(@Req() req: Request) {
    this.assertOn(req);
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
    this.assertOn(req);
    const { actor, token } = await this.auth.devSwitch(
      dto.userId,
      readSessionToken(req, this.config),
    );
    setSessionCookie(res, token, this.auth.sessionTtlMs, this.config);
    return this.me.get(actor);
  }
}
