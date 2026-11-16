import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentActor,
  RequireRoles,
  SESSION_COOKIE,
} from '../../common/auth.decorators.js';
import { Role } from '../../common/rbac.js';
import type { Actor } from '../../common/rbac.js';
import { UpdateSettingsDto } from './settings.dto.js';
import { TenantsService } from './tenants.service.js';

/** Section 5.2 and 17.4: the GA settings. Everyone gets the parts they need through `/me`. */
@ApiTags('Settings')
@ApiCookieAuth(SESSION_COOKIE)
@ApiForbiddenResponse({ description: 'forbidden: chỉ Chủ GA' })
@RequireRoles(Role.GaHead)
@Controller('settings')
export class SettingsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @ApiOperation({
    summary: 'Cài đặt GA',
    description:
      'Chỉ Chủ GA. Gồm `version` để gửi lại khi lưu, và gói dịch vụ (chỉ xem).',
  })
  get(@CurrentActor() actor: Actor) {
    return this.tenants.settingsView({ tenantId: actor.tenantId! });
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Lưu cài đặt GA',
    description:
      'Chỉ Chủ GA. Chỉ phần được gửi thay đổi. Có kiểm toán `SETTINGS_CHANGE`.',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'stale_settings: đã có người lưu trước' })
  async update(
    @CurrentActor() actor: Actor,
    @Body() dto: UpdateSettingsDto,
  ): Promise<void> {
    await this.tenants.updateSettings(
      { tenantId: actor.tenantId! },
      actor.id,
      dto,
    );
  }
}
