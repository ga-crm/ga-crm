import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../../common/auth.decorators.js';
import { SubmitFormDto } from './public-form.dto.js';
import { PublicFormService } from './public-form.service.js';

/** Section 17.9: the public lead form (CMP-4). No session; the slug is the key. */
@ApiTags('Public forms')
@Public()
@Controller('public/forms')
export class PublicFormsController {
  constructor(private readonly forms: PublicFormService) {}

  @Get(':slug')
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @ApiOperation({
    summary: 'Định nghĩa form công khai',
    description:
      'Tên GA, chiến dịch, trường, nội dung đồng ý, khóa site Turnstile. Lỗi: `form_unavailable`.',
  })
  definition(@Param('slug') slug: string) {
    return this.forms.definition(slug);
  }

  @Post(':slug')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary: 'Gửi đăng ký',
    description:
      'Turnstile; 5 lần/phút theo IP, 3 lần/ngày theo số điện thoại. Luôn trả `{ok: true}` dù số đã có hay chưa. Lỗi: `captcha_failed`, `invalid_phone`, `rate_limited`, `form_unavailable`.',
  })
  @ApiCreatedResponse({ description: '{ ok: true }' })
  submit(
    @Param('slug') slug: string,
    @Body() dto: SubmitFormDto,
    @Req() req: Request,
  ) {
    return this.forms.submit(slug, dto, req.ip ?? '');
  }
}
