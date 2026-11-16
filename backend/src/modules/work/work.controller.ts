import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentActor,
  Public,
  SESSION_COOKIE,
} from '../../common/auth.decorators.js';
import type { Actor } from '../../common/rbac.js';
import { ClientCodePipe } from '../clients/client-code.pipe.js';
import {
  CalendarQueryDto,
  CreateClientTaskDto,
  CreateTaskDto,
  ListTasksQueryDto,
  EditTaskDto,
} from './work.dto.js';
import { WorkService } from './work.service.js';

/** Section 17.14: tasks, "Hôm nay" and the calendar (TASK-1 to TASK-6). */
@ApiTags('Tasks')
@ApiCookieAuth(SESSION_COOKIE)
@Controller()
export class WorkController {
  constructor(private readonly work: WorkService) {}

  @Get('tasks')
  @ApiOperation({
    summary: 'Việc cần làm của tôi (hoặc của tuyến với team=1)',
    description:
      'Việc của lead, của khách hàng và việc cá nhân; mặc định đang mở, theo hạn.',
  })
  list(@CurrentActor() actor: Actor, @Query() query: ListTasksQueryDto) {
    return this.work.list(actor, query);
  }

  @Post('tasks')
  @ApiOperation({
    summary: 'Thêm việc cá nhân, hoặc việc của khách hàng (clientCode)',
    description: 'TASK-1. Việc của khách hàng: người sở hữu khách (CUS-6).',
  })
  @ApiCreatedResponse({ description: '{ id }' })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateTaskDto) {
    return this.work.create(actor, dto);
  }

  @Patch('tasks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Sửa, hoàn thành, mở lại, hủy việc',
    description:
      'TASK-2. Theo quyền của lead (LEAD-7), khách hàng (CUS-6) hoặc người tạo việc cá nhân.',
  })
  @ApiParam({ name: 'id' })
  @ApiNoContentResponse()
  async update(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: EditTaskDto,
  ): Promise<void> {
    await this.work.update(actor, id, dto);
  }

  @Post('clients/:code/tasks')
  @ApiTags('Clients')
  @ApiOperation({
    summary: 'Thêm việc cho khách hàng, có thể từ một cơ hội chăm sóc',
    description: 'Mục 17.8 + SIG-2: `signal` ghi nguồn SIGNAL.',
  })
  @ApiParam({ name: 'code', example: '0000000001' })
  @ApiCreatedResponse({ description: '{ id }' })
  createForClient(
    @CurrentActor() actor: Actor,
    @Param('code', ClientCodePipe) code: string,
    @Body() dto: CreateClientTaskDto,
  ) {
    return this.work.createForClient(actor, code, dto);
  }

  @Get('today')
  @ApiOperation({ summary: 'Hôm nay', description: 'TASK-5 + mục 16.2.' })
  today(@CurrentActor() actor: Actor) {
    return this.work.today(actor);
  }

  @Get('calendar')
  @ApiOperation({
    summary: 'Lịch: việc và cuộc hẹn trong khoảng ngày',
    description: 'TASK-6. Tối đa 62 ngày.',
  })
  calendar(@CurrentActor() actor: Actor, @Query() query: CalendarQueryDto) {
    return this.work.calendar(actor, query);
  }

  @Post('calendar/token')
  @ApiOperation({
    summary: 'Tạo link lịch ICS riêng (link cũ hết hiệu lực)',
    description: 'TASK-6. Link chỉ hiện một lần.',
  })
  @ApiCreatedResponse({ description: '{ url }' })
  calendarToken(@CurrentActor() actor: Actor) {
    return this.work.newCalendarToken(actor);
  }

  @Public()
  @Get('calendar.ics')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({
    summary: 'Feed ICS chỉ đọc',
    description: 'TASK-6. Xác thực bằng token trong link; không dùng cookie.',
  })
  ics(@Query('token') token?: string) {
    return this.work.ics(token);
  }
}
