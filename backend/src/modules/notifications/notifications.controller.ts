import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiNoContentResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentActor, SESSION_COOKIE } from '../../common/auth.decorators.js';
import type { Actor } from '../../common/rbac.js';
import {
  ListNotificationsQueryDto,
  MarkReadDto,
  NotificationPrefsDto,
} from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

/** Section 17.12: the in-app notifications of the signed-in person (NTF-1, NTF-3). */
@ApiTags('Notifications')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'Thông báo của tôi, mới nhất trước',
    description: 'Trả thêm `unread` (số chưa đọc).',
  })
  list(
    @CurrentActor() actor: Actor,
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notifications.list(actor, query);
  }

  @Get('unread')
  @ApiOperation({ summary: 'Số thông báo chưa đọc (cho chuông)' })
  unread(@CurrentActor() actor: Actor) {
    return this.notifications.unreadCount(actor);
  }

  @Post('read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đánh dấu đã đọc: `{ids}` hoặc `{all: true}`' })
  @ApiNoContentResponse()
  async read(
    @CurrentActor() actor: Actor,
    @Body() dto: MarkReadDto,
  ): Promise<void> {
    await this.notifications.markRead(actor, dto);
  }

  @Get('prefs')
  @ApiOperation({
    summary: 'Tùy chọn nhận thông báo theo từng sự kiện (NTF-3)',
  })
  prefs(@CurrentActor() actor: Actor) {
    return this.notifications.prefs(actor);
  }

  @Put('prefs')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bật / tắt thông báo theo sự kiện (NTF-3)' })
  @ApiNoContentResponse()
  async setPrefs(
    @CurrentActor() actor: Actor,
    @Body() dto: NotificationPrefsDto,
  ): Promise<void> {
    await this.notifications.setPrefs(actor, dto.items);
  }
}
