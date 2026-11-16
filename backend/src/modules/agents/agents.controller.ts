import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentActor,
  RequirePermissions,
  SESSION_COOKIE,
} from '../../common/auth.decorators.js';
import { Permission } from '../../common/rbac.js';
import type { Actor } from '../../common/rbac.js';
import {
  CreateAgentDto,
  ListAgentsQueryDto,
  SetManagerDto,
  UpdateAgentDto,
} from './agents.dto.js';
import { AgentsService } from './agents.service.js';

/** Section 17.6. Reads are limited to the actor's branch by the service (AGT-6). */
@ApiTags('Agents')
@ApiCookieAuth(SESSION_COOKIE)
@ApiForbiddenResponse({ description: 'forbidden' })
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh bạ đại lý',
    description: '`agents.view_all` xem toàn GA; người khác xem tuyến dưới.',
  })
  list(@CurrentActor() actor: Actor, @Query() query: ListAgentsQueryDto) {
    return this.agents.list(actor, query);
  }

  @Get('tree')
  @ApiOperation({ summary: 'Toàn bộ cây đại lý trong phạm vi được xem' })
  tree(@CurrentActor() actor: Actor) {
    return this.agents.tree(actor);
  }

  @Get(':code')
  @ApiOperation({
    summary: 'Chi tiết đại lý',
    description: 'Ngày sinh và điện thoại chỉ trả về cho Chủ GA và Admin.',
  })
  get(@CurrentActor() actor: Actor, @Param('code') code: string) {
    return this.agents.get(actor, code);
  }

  @Post()
  @RequirePermissions(Permission.AgentsEditTree)
  @ApiOperation({
    summary: 'Thêm đại lý (nhập tay)',
    description:
      'Quyền: `agents.edit_tree`. Lỗi: `agent_exists`, `manager_not_found`.',
  })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateAgentDto) {
    return this.agents.create(actor, dto);
  }

  @Patch(':code')
  @RequirePermissions(Permission.AgentsEditTree)
  @ApiOperation({
    summary: 'Sửa thông tin đại lý',
    description: 'Quyền: `agents.edit_tree`.',
  })
  update(
    @CurrentActor() actor: Actor,
    @Param('code') code: string,
    @Body() dto: UpdateAgentDto,
  ) {
    return this.agents.update(actor, code, dto);
  }

  @Patch(':code/manager')
  @RequirePermissions(Permission.AgentsEditTree)
  @ApiOperation({
    summary: 'Đổi quản lý (AGT-5)',
    description:
      'Quyền: `agents.edit_tree`. Lỗi: `manager_not_found`, `manager_cycle`.',
  })
  setManager(
    @CurrentActor() actor: Actor,
    @Param('code') code: string,
    @Body() dto: SetManagerDto,
  ) {
    return this.agents.setManager(actor, code, dto.managerCode ?? null);
  }
}
