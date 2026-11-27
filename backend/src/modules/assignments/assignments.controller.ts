import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentActor, SESSION_COOKIE } from '../../common/auth.decorators.js';
import type { Actor } from '../../common/rbac.js';
import { AssignmentsService } from './assignments.service.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class ListAssignmentRequestsDto {
  @ApiPropertyOptional({
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
  })
  @IsOptional()
  @IsIn(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'])
  status?: string;
}

export class RejectAssignmentDto {
  @ApiPropertyOptional({ example: 'Để chị Hà tiếp tục chăm sóc' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** Decided 27/11/2026: assignments waiting for the GA director. */
@ApiTags('Assignment requests')
@ApiCookieAuth(SESSION_COOKIE)
@ApiForbiddenResponse({ description: 'forbidden' })
@Controller('assignment-requests')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Yêu cầu phân công',
    description:
      'Giám đốc GA thấy mọi yêu cầu của GA; người khác thấy yêu cầu của mình. Không trả số điện thoại khách.',
  })
  list(
    @CurrentActor() actor: Actor,
    @Query() query: ListAssignmentRequestsDto,
  ) {
    return this.assignments.list(actor, query.status);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Duyệt yêu cầu phân công',
    description: 'Chỉ Giám đốc GA. Phân công có hiệu lực như Giám đốc tự giao.',
  })
  @ApiConflictResponse({ description: 'request_decided' })
  approve(@CurrentActor() actor: Actor, @Param('id') id: string) {
    return this.assignments.approve(actor, id);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Từ chối yêu cầu phân công', description: 'Chỉ Giám đốc GA.' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'request_decided' })
  async reject(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
    @Body() dto: RejectAssignmentDto,
  ): Promise<void> {
    await this.assignments.reject(actor, id, dto.note);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Rút yêu cầu phân công', description: 'Người gửi rút yêu cầu còn chờ duyệt.' })
  @ApiNoContentResponse()
  @ApiConflictResponse({ description: 'request_decided' })
  async cancel(
    @CurrentActor() actor: Actor,
    @Param('id') id: string,
  ): Promise<void> {
    await this.assignments.cancel(actor, id);
  }
}
