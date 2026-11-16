import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentActor,
  RequirePermissions,
  SESSION_COOKIE,
} from '../../common/auth.decorators.js';
import { Permission } from '../../common/rbac.js';
import type { Actor } from '../../common/rbac.js';
import { ActivityService } from './activity.service.js';
import { LastSeenQueryDto } from './presence.dto.js';
import { PresenceService } from './presence.service.js';

/** Realtime slice C1: who is online, and how many people use the CRM each day. */
@ApiTags('Presence')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('presence')
export class PresenceController {
  constructor(
    private readonly presence: PresenceService,
    private readonly activity: ActivityService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Ai trong GA đang trực tuyến',
    description:
      'Id người dùng đang trực tuyến (có thao tác trong 5 phút) và vắng mặt (mở app nhưng không thao tác). Thay đổi sau đó đến qua sự kiện WebSocket `presence.changed`.',
  })
  now(@CurrentActor() actor: Actor) {
    return this.presence.forActor(actor);
  }

  @Get('last-seen')
  @ApiOperation({
    summary: 'Lần hoạt động cuối của đồng nghiệp trong GA',
    description: 'Thời điểm (ms) heartbeat hoặc ngắt kết nối cuối của từng người, tối đa 100 người mỗi lần (K5).',
  })
  lastSeen(@CurrentActor() actor: Actor, @Query() query: LastSeenQueryDto) {
    return this.presence.lastSeen(actor, query.ids);
  }

  @Get('activity')
  @RequirePermissions(Permission.UsersManage)
  @ApiOperation({
    summary: 'Người dùng hoạt động (DAU, WAU, MAU)',
    description:
      'Số người dùng hoạt động hôm nay, 7 ngày, 30 ngày, và theo từng ngày trong 30 ngày (ngày Việt Nam).',
  })
  activeUsers(@CurrentActor() actor: Actor) {
    return this.activity.summary(actor);
  }
}
