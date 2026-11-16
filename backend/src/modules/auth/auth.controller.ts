import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  AllowMfaPending,
  AllowMfaSetup,
  CurrentActor,
  Public,
  SESSION_COOKIE,
} from '../../common/auth.decorators.js';
import type { Actor } from '../../common/rbac.js';
import type { Env } from '../../config/env.validation.js';
import {
  MeDto,
  AcceptInviteDto,
  ChangePasswordDto,
  InviteInfoDto,
  PasswordResetInfoDto,
  ResetPasswordDto,
  SignInDto,
  UpdateMeDto,
} from '../users/users.dto.js';
import { AuthService } from './auth.service.js';
import { MeService } from './me.service.js';
import {
  clearSessionCookie,
  readSessionToken,
  setSessionCookie,
} from './session-cookie.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly me: MeService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Public()
  // Above the spec's 10 because a whole GA office can share one IP; guessing is limited by LoginGuardService
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post('sign-in/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Đăng nhập',
    description:
      'Đặt session cookie. Sau khi gọi thành công, mọi API khác trên Swagger tự dùng cookie này. Tài khoản đã bật MFA nhận `{mfaRequired: true}` và phải gọi `POST /auth/mfa/verify` (USER-16).',
  })
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse({ description: 'invalid_credentials' })
  @ApiTooManyRequestsResponse({
    description:
      'rate_limited: 60 lần/phút theo IP; 50 lần sai/15 phút theo IP; 5 lần sai/phút theo tài khoản; 10 lần sai liên tiếp sẽ khóa tạm 15-60 phút. Có header Retry-After.',
  })
  async signIn(
    @Body() dto: SignInDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto | { mfaRequired: true }> {
    const { actor, token, mfaPending } = await this.auth.signIn(
      dto,
      readSessionToken(req, this.config),
    );
    setSessionCookie(res, token, this.auth.sessionTtlMs, this.config);
    // USER-16: the session opens with POST /auth/mfa/verify
    if (mfaPending) return { mfaRequired: true };
    return this.me.get(actor);
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('password/change')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({
    summary: 'Đổi mật khẩu của mình',
    description:
      'Đăng xuất mọi thiết bị khác và cấp session mới cho thiết bị hiện tại.',
  })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({
    description:
      'invalid_current_password, password_unchanged, password_too_weak, invalid_input',
  })
  async changePassword(
    @CurrentActor() actor: Actor,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const token = await this.auth.changePassword(actor, dto);
    setSessionCookie(res, token, this.auth.sessionTtlMs, this.config);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Get('password/reset/:token')
  @ApiOperation({ summary: 'Xem link đặt lại mật khẩu', description: 'Public' })
  @ApiOkResponse({ type: PasswordResetInfoDto })
  @ApiNotFoundResponse({ description: 'invite_invalid' })
  getPasswordReset(
    @Param('token') token: string,
  ): Promise<PasswordResetInfoDto> {
    return this.auth.getPasswordReset(token);
  }

  @Public()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('password/reset')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Đặt mật khẩu mới bằng link',
    description: 'Public. Link dùng một lần. Đăng xuất khỏi mọi thiết bị.',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({ description: 'invite_invalid' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<void> {
    await this.auth.resetPassword(dto);
  }

  @Post('sign-out')
  @AllowMfaPending()
  @AllowMfaSetup()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: 'Đăng xuất thiết bị hiện tại' })
  @ApiNoContentResponse()
  async signOut(
    @CurrentActor() actor: Actor,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.signOut(readSessionToken(req, this.config) ?? '', actor);
    clearSessionCookie(res, this.config);
  }

  @Post('sign-out-others')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth(SESSION_COOKIE)
  @ApiOperation({ summary: 'Đăng xuất khỏi mọi thiết bị khác' })
  @ApiNoContentResponse()
  async signOutOthers(
    @CurrentActor() actor: Actor,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.signOutOthers(
      readSessionToken(req, this.config) ?? '',
      actor,
    );
  }
}

@ApiTags('Auth')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  @AllowMfaSetup()
  @ApiOperation({
    summary: 'Người dùng hiện tại, GA, vai trò, quyền, phạm vi dữ liệu',
    description:
      '`mfa.setupRequired`: phải cài MFA trước khi dùng các API khác (USER-16).',
  })
  @ApiOkResponse({ type: MeDto })
  @ApiUnauthorizedResponse({ description: 'unauthenticated' })
  get(@CurrentActor() actor: Actor): Promise<MeDto> {
    return this.me.get(actor);
  }

  @Patch()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cập nhật họ tên và giao diện của mình' })
  @ApiNoContentResponse()
  async update(
    @CurrentActor() actor: Actor,
    @Body() dto: UpdateMeDto,
  ): Promise<void> {
    await this.me.update(actor, dto);
  }
}

@ApiTags('Auth')
@Public()
@Throttle({ default: { ttl: 60_000, limit: 10 } })
@Controller('invites')
export class InvitesController {
  constructor(
    private readonly auth: AuthService,
    private readonly me: MeService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Get(':token')
  @ApiOperation({ summary: 'Xem thông tin lời mời', description: 'Public' })
  @ApiOkResponse({ type: InviteInfoDto })
  @ApiNotFoundResponse({ description: 'invite_invalid' })
  getInvite(@Param('token') token: string): Promise<InviteInfoDto> {
    return this.auth.getInvite(token);
  }

  @Post('accept')
  @ApiOperation({
    summary: 'Kích hoạt tài khoản',
    description:
      'Public. Đặt mật khẩu và tự động đăng nhập. Link chỉ dùng được một lần.',
  })
  @ApiCreatedResponse({ type: MeDto })
  @ApiNotFoundResponse({ description: 'invite_invalid' })
  async accept(
    @Body() dto: AcceptInviteDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    const { actor, token } = await this.auth.acceptInvite(dto);
    setSessionCookie(res, token, this.auth.sessionTtlMs, this.config);
    return this.me.get(actor);
  }
}
