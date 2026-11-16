import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  CurrentActor,
  RequirePermissions,
  SESSION_COOKIE,
} from '../../common/auth.decorators.js';
import { IdPipe } from '../../common/pagination.js';
import { Permission } from '../../common/rbac.js';
import type { Actor, Scope } from '../../common/rbac.js';
import {
  AdminSetPasswordDto,
  ArchiveUserDto,
  InvitedUserDto,
  InviteUrlDto,
  InviteUserDto,
  ListUsersQueryDto,
  ResetUrlDto,
  toUserDto,
  UpdateUserDto,
  UserDto,
  UsersPageDto,
} from './users.dto.js';
import { UsersService } from './users.service.js';

const scopeOf = (actor: Actor): Scope => ({ tenantId: actor.tenantId! });

@ApiTags('Users')
@ApiCookieAuth(SESSION_COOKIE)
@ApiForbiddenResponse({ description: 'forbidden' })
@RequirePermissions(Permission.UsersManage)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOperation({
    summary: 'Danh sách người dùng của GA',
    description: 'Quyền: `users.manage`',
  })
  @ApiOkResponse({ type: UsersPageDto })
  async list(
    @CurrentActor() actor: Actor,
    @Query() query: ListUsersQueryDto,
  ): Promise<UsersPageDto> {
    const { items, total } = await this.users.list(scopeOf(actor), query);
    const agentNames = await this.users.agentNames(
      scopeOf(actor),
      items.flatMap((user) => user.agentCode ?? []),
    );
    return {
      items: items.map((user) => ({
        ...toUserDto(user),
        ...(user.agentCode && {
          agentName: agentNames.get(user.agentCode) ?? null,
        }),
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Chi tiết người dùng',
    description: 'Quyền: `users.manage`',
  })
  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse({ description: 'not_found (kể cả khi thuộc GA khác)' })
  async get(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
  ): Promise<UserDto> {
    return toUserDto(await this.users.getById(scopeOf(actor), id));
  }

  @Post('invite')
  @ApiOperation({
    summary: 'Mời người dùng',
    description: 'Quyền: `users.manage`. Chỉ Chủ GA mới được mời Chủ GA.',
  })
  @ApiCreatedResponse({ type: InvitedUserDto })
  @ApiConflictResponse({ description: 'email_taken, agent_code_taken' })
  async invite(
    @CurrentActor() actor: Actor,
    @Body() dto: InviteUserDto,
  ): Promise<InvitedUserDto> {
    const { user, inviteUrl } = await this.users.invite(
      scopeOf(actor),
      actor,
      dto,
    );
    return { user: toUserDto(user), inviteUrl };
  }

  @Post(':id/invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gửi lại lời mời (tạo link mới)',
    description: 'Quyền: `users.manage`',
  })
  @ApiOkResponse({ type: InviteUrlDto })
  @ApiConflictResponse({ description: 'not_invited' })
  async resendInvite(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
  ): Promise<InviteUrlDto> {
    return {
      inviteUrl: await this.users.resendInvite(scopeOf(actor), actor, id),
    };
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Sửa họ tên, email, vai trò, mã đại lý',
    description:
      'Quyền: `users.manage`. Đổi email không làm mất mật khẩu (USER-6). Khóa, lưu trữ, kích hoạt lại dùng các route riêng.',
  })
  @ApiOkResponse({ type: UserDto })
  @ApiConflictResponse({
    description: 'email_taken, agent_code_taken, last_ga_head',
  })
  async update(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserDto> {
    return toUserDto(await this.users.update(scopeOf(actor), actor, id, dto));
  }

  @Post(':id/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Khóa người dùng',
    description:
      'Quyền: `users.manage`. Xóa mọi phiên và mật khẩu ngay (USER-10); dữ liệu và lịch sử giữ nguyên. Chỉ Chủ GA khóa được Chủ GA.',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({
    description: 'invite_pending, cannot_disable_self, last_ga_head',
  })
  async disable(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
  ): Promise<void> {
    await this.users.disable(scopeOf(actor), actor, id);
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Lưu trữ người dùng đã nghỉ',
    description:
      'Quyền: `users.manage`. Như khóa, và giải phóng mã đại lý cho người dùng mới (USER-13). Người đã lưu trữ ẩn khỏi danh sách mặc định.',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({
    description: 'invite_pending, cannot_disable_self, last_ga_head',
  })
  async archive(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: ArchiveUserDto,
  ): Promise<void> {
    await this.users.archive(scopeOf(actor), actor, id, dto.reason);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kích hoạt lại người dùng đã khóa hoặc lưu trữ',
    description:
      'Quyền: `users.manage`. Người dùng về trạng thái chờ kích hoạt kèm lời mời mới, vì mật khẩu cũ đã bị xóa (USER-11).',
  })
  @ApiOkResponse({ type: InviteUrlDto })
  @ApiConflictResponse({
    description: 'agent_code_taken, not_invited, invite_pending',
  })
  async reactivate(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
  ): Promise<InviteUrlDto> {
    return {
      inviteUrl: await this.users.reactivate(scopeOf(actor), actor, id),
    };
  }

  @Post(':id/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Quản trị viên đổi mật khẩu cho người dùng',
    description:
      'Quyền: `users.manage`. Người dùng bị đăng xuất khỏi mọi thiết bị. Chỉ Chủ GA mới thao tác được trên tài khoản Chủ GA.',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({
    description: 'cannot_reset_self, invite_pending, user_disabled',
  })
  async setPassword(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: AdminSetPasswordDto,
  ): Promise<void> {
    await this.users.setPassword(scopeOf(actor), actor, id, dto.password);
  }

  @Post(':id/password-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tạo link đặt lại mật khẩu',
    description:
      'Quyền: `users.manage`. Link dùng một lần, hiệu lực 1 giờ. Mật khẩu cũ vẫn dùng được đến khi link được sử dụng.',
  })
  @ApiOkResponse({ type: ResetUrlDto })
  @ApiConflictResponse({
    description: 'cannot_reset_self, invite_pending, user_disabled',
  })
  async createPasswordReset(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
  ): Promise<ResetUrlDto> {
    return {
      resetUrl: await this.users.createPasswordReset(scopeOf(actor), actor, id),
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Thu hồi lời mời',
    description:
      'Quyền: `users.manage`. Cách xóa duy nhất: chỉ với người dùng chờ kích hoạt chưa từng đăng nhập và chưa có dữ liệu (USER-14).',
  })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'not_invited, user_has_history' })
  async revokeInvite(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
  ): Promise<void> {
    await this.users.revokeInvite(scopeOf(actor), actor, id);
  }
}
