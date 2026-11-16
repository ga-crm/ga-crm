import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Permission } from '../../common/rbac.js';
import type { Actor, Scope } from '../../common/rbac.js';
import {
  CurrentActor,
  RequirePermissions,
  SESSION_COOKIE,
} from '../../common/auth.decorators.js';
import { ListAuditQueryDto } from './audit.dto.js';
import { AuditService } from './audit.service.js';

@ApiTags('Audit')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions(Permission.AuditView)
  @ApiOperation({
    summary: 'Nhật ký kiểm toán của GA',
    description: 'Quyền: `audit.view`',
  })
  @ApiForbiddenResponse({ description: 'forbidden' })
  async list(@CurrentActor() actor: Actor, @Query() query: ListAuditQueryDto) {
    const scope: Scope = { tenantId: actor.tenantId! };
    const { items, total } = await this.audit.list(scope, query);
    return {
      items: items.map(
        ({ hash: _hash, prevHash: _prevHash, ...event }) => event,
      ),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}
