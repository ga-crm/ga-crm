import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
} from '@nestjs/common';
import {
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
import { Permission, Role } from '../../common/rbac.js';
import type { Actor } from '../../common/rbac.js';
import { UpdatePermissionsDto } from './permissions.dto.js';
import { TenantsService } from './tenants.service.js';

@ApiTags('Permissions')
@ApiCookieAuth(SESSION_COOKIE)
@ApiForbiddenResponse({ description: 'forbidden: chỉ Chủ GA' })
@RequireRoles(Role.GAD)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  @ApiOperation({
    summary: 'Ma trận phân quyền của GA',
    description: 'Chỉ Chủ GA',
  })
  async get(@CurrentActor() actor: Actor) {
    const settings = await this.tenants.getSettings({
      tenantId: actor.tenantId!,
    });
    return { grants: settings.grants, catalog: Object.values(Permission) };
  }

  @Put()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Cập nhật ma trận phân quyền',
    description:
      'Chỉ Chủ GA. Có hiệu lực ở request kế tiếp, ghi kiểm toán PERMISSION_CHANGE.',
  })
  @ApiNoContentResponse()
  async update(
    @CurrentActor() actor: Actor,
    @Body() dto: UpdatePermissionsDto,
  ): Promise<void> {
    // Copy into a plain object: class instances do not serialise cleanly into a Mixed field
    await this.tenants.updateGrants({ tenantId: actor.tenantId! }, actor.id, {
      ...dto.grants,
    });
  }
}
