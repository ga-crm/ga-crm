import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentActor,
  RequirePermissions,
  SESSION_COOKIE,
} from '../../common/auth.decorators.js';
import { Permission } from '../../common/rbac.js';
import type { Actor } from '../../common/rbac.js';
import { AI_PROVIDER_IDS } from './ai-providers.js';
import { AiSettingsService } from './ai-settings.service.js';
import { SaveAiKeyDto, UpdateAiSettingsDto } from './ai.dto.js';

const PROVIDER = { name: 'provider', enum: AI_PROVIDER_IDS };

/** Section 17.13: "Mô hình và hạn mức" of the AI screen (AI-11 to AI-17), ai.manage only. */
@ApiTags('AI admin')
@ApiCookieAuth(SESSION_COOKIE)
@RequirePermissions(Permission.AiManage)
@Controller('ai/admin')
export class AiAdminController {
  constructor(private readonly ai: AiSettingsService) {}

  @Get('settings')
  @ApiOperation({
    summary: 'Cài đặt AI của GA',
    description:
      'Bật / tắt, mô hình theo tầng, router, hạn mức token, trạng thái khóa từng nhà cung cấp (không bao giờ trả khóa).',
  })
  settings(@CurrentActor() actor: Actor) {
    return this.ai.view(actor);
  }

  @Put('settings')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Lưu cài đặt AI', description: 'Có audit.' })
  @ApiNoContentResponse()
  async update(
    @CurrentActor() actor: Actor,
    @Body() dto: UpdateAiSettingsDto,
  ): Promise<void> {
    await this.ai.update(actor, dto);
  }

  @Put('keys/:provider')
  @ApiOperation({
    summary: 'Lưu khóa API của GA cho một nhà cung cấp (AI-15)',
    description: 'Lưu mã hóa; chỉ trả 4 ký tự cuối. Audit không chứa khóa.',
  })
  @ApiParam(PROVIDER)
  saveKey(
    @CurrentActor() actor: Actor,
    @Param('provider') provider: string,
    @Body() dto: SaveAiKeyDto,
  ) {
    return this.ai.saveKey(actor, provider, dto.apiKey);
  }

  @Delete('keys/:provider')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xóa khóa API của GA (dùng lại khóa nền tảng nếu có)',
  })
  @ApiParam(PROVIDER)
  @ApiNoContentResponse()
  async deleteKey(
    @CurrentActor() actor: Actor,
    @Param('provider') provider: string,
  ): Promise<void> {
    await this.ai.deleteKey(actor, provider);
  }

  @Get('keys/:provider/models')
  @ApiOperation({
    summary: 'Mô hình chat của nhà cung cấp, đọc trực tiếp (AI-17)',
    description:
      'Lỗi: `ai_provider_missing`, `ai_key_invalid`, `ai_rate_limited`, `ai_provider_error`.',
  })
  @ApiParam(PROVIDER)
  models(@CurrentActor() actor: Actor, @Param('provider') provider: string) {
    return this.ai.models(actor, provider);
  }

  @Post('keys/:provider/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kiểm tra khóa bằng một request tối thiểu (AI-16)',
    description:
      'Lỗi: `ai_key_invalid`, `ai_model_unavailable`, `ai_rate_limited`, `ai_provider_error`.',
  })
  @ApiParam(PROVIDER)
  test(@CurrentActor() actor: Actor, @Param('provider') provider: string) {
    return this.ai.test(actor, provider);
  }
}
