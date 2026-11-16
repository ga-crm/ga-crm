import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import multer from 'multer';
import { ApiException, ErrorCode } from '../../common/errors.js';
import {
  CurrentActor,
  RequireRoles,
  SESSION_COOKIE,
} from '../../common/auth.decorators.js';
import { IdPipe } from '../../common/pagination.js';
import { Role } from '../../common/rbac.js';
import type { Actor } from '../../common/rbac.js';
import {
  AddMembersDto,
  ChatPrefsDto,
  CreateGroupDto,
  EditMessageDto,
  MarkReadDto,
  MessagesQueryDto,
  OpenDirectDto,
  PeopleQueryDto,
  RenameGroupDto,
  ReviewQueryDto,
  SearchQueryDto,
  SendMessageDto,
  SetRoleDto,
} from './chat.dto.js';
import { contentDisposition, MAX_FILE_BYTES, MAX_FILES } from './chat-files.js';
import { ChatFilesService } from './chat-files.service.js';
import type { UploadedFile } from './chat-files.service.js';
import { ChatService } from './chat.service.js';

/** K8: files stay in memory (10 MB at most each) until checked and sent to object storage. */
const receiveFiles = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES, fields: 0, parts: MAX_FILES },
}).array('files', MAX_FILES);

const UPLOAD_ERRORS: Record<string, [number, ErrorCode]> = {
  LIMIT_FILE_SIZE: [HttpStatus.PAYLOAD_TOO_LARGE, ErrorCode.ChatFileTooLarge],
  LIMIT_FILE_COUNT: [HttpStatus.BAD_REQUEST, ErrorCode.ChatTooManyFiles],
  LIMIT_PART_COUNT: [HttpStatus.BAD_REQUEST, ErrorCode.ChatTooManyFiles],
};

function readUpload(req: Request, res: Response): Promise<UploadedFile[]> {
  return new Promise((resolve, reject) => {
    receiveFiles(req, res, (error: unknown) => {
      if (!error) return resolve((req.files as UploadedFile[] | undefined) ?? []);
      const [status, code] = (error instanceof multer.MulterError && UPLOAD_ERRORS[error.code]) || [
        HttpStatus.BAD_REQUEST,
        ErrorCode.InvalidInput,
      ];
      reject(new ApiException(status, code));
    });
  });
}

/** Realtime slices C2 and C3: chat inside a GA. New messages reach browsers as `chat.message` events. */
@ApiTags('Chat')
@ApiCookieAuth(SESSION_COOKIE)
@Controller('chat')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly files: ChatFilesService,
  ) {}

  @Get('people')
  @ApiOperation({ summary: 'Người trong GA để bắt đầu trò chuyện' })
  people(@CurrentActor() actor: Actor, @Query() query: PeopleQueryDto) {
    return this.chat.people(actor, query.q);
  }

  @Get('search')
  @ApiOperation({ summary: 'Tìm trong tin nhắn của tôi (không phân biệt dấu), 30 tin mới nhất' })
  search(@CurrentActor() actor: Actor, @Query() query: SearchQueryDto) {
    return this.chat.search(actor, query.q);
  }

  @Post('conversations/:id/files')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @ApiOperation({
    summary: 'Tải file lên để gửi kèm tin (ảnh, PDF, Word, Excel, PowerPoint; tối đa 10 MB, 5 file)',
    description: 'Trả về id của từng file; gửi tin với `fileIds`. File không được gửi trong 1 ngày sẽ bị xóa.',
  })
  async upload(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.files.upload(actor, id, await readUpload(req, res));
  }

  @Get('files/:fileId')
  @ApiOperation({ summary: 'Xem hoặc tải một file trong chat (`download=1` để tải về)' })
  async file(
    @CurrentActor() actor: Actor,
    @Param('fileId', IdPipe) fileId: string,
    @Query('download') download: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, body } = await this.files.open(actor, fileId);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Length', String(file.size));
    res.setHeader('Content-Disposition', contentDisposition(file.name, file.kind === 'IMAGE' && download !== '1'));
    // Never run as a page, whatever is inside; the browser may keep it for the session
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return new StreamableFile(body);
  }

  @Get('conversations')
  @ApiOperation({ summary: 'Các cuộc trò chuyện của tôi, kèm tin cuối và số chưa đọc' })
  list(@CurrentActor() actor: Actor) {
    return this.chat.list(actor);
  }

  @Get('unread')
  @ApiOperation({ summary: 'Tổng tin chưa đọc (bỏ cuộc trò chuyện đã tắt thông báo)' })
  unread(@CurrentActor() actor: Actor) {
    return this.chat.unreadTotal(actor);
  }

  @Post('direct')
  @ApiOperation({ summary: 'Mở chat 1:1 (tạo nếu chưa có)' })
  openDirect(@CurrentActor() actor: Actor, @Body() dto: OpenDirectDto) {
    return this.chat.openDirect(actor, dto.userId);
  }

  @Post('groups')
  @ApiOperation({ summary: 'Tạo nhóm; người tạo là chủ nhóm' })
  createGroup(@CurrentActor() actor: Actor, @Body() dto: CreateGroupDto) {
    return this.chat.createGroup(actor, dto);
  }

  @Get('conversations/:id')
  @ApiOperation({ summary: 'Một cuộc trò chuyện và thành viên' })
  get(@CurrentActor() actor: Actor, @Param('id', IdPipe) id: string) {
    return this.chat.get(actor, id);
  }

  @Patch('conversations/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đổi tên nhóm (chủ nhóm, phó nhóm)' })
  rename(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: RenameGroupDto,
  ) {
    return this.chat.rename(actor, id, dto.title);
  }

  @Put('conversations/:id/prefs')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Tắt thông báo, ghim (chỉ cho tôi)' })
  prefs(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: ChatPrefsDto,
  ) {
    return this.chat.setPrefs(actor, id, dto);
  }

  @Post('conversations/:id/members')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Thêm thành viên (chủ nhóm, phó nhóm)' })
  addMembers(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: AddMembersDto,
  ) {
    return this.chat.addMembers(actor, id, dto.userIds);
  }

  @Delete('conversations/:id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xóa thành viên, hoặc rời nhóm khi là chính mình' })
  removeMember(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Param('userId', IdPipe) userId: string,
  ) {
    return this.chat.removeMember(actor, id, userId);
  }

  @Put('conversations/:id/members/:userId/role')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đặt hoặc bỏ phó nhóm (chủ nhóm)' })
  setRole(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Param('userId', IdPipe) userId: string,
    @Body() dto: SetRoleDto,
  ) {
    return this.chat.setRole(actor, id, userId, dto.role);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Tin nhắn, cũ trước; `before` để cuộn lên, `after` để lấy bù' })
  messages(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Query() query: MessagesQueryDto,
  ) {
    return this.chat.messages(actor, id, query);
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Gửi tin' })
  send(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chat.send(actor, id, dto);
  }

  @Patch('conversations/:id/messages/:seq')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sửa tin của mình trong 15 phút' })
  edit(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Param('seq', ParseIntPipe) seq: number,
    @Body() dto: EditMessageDto,
  ) {
    return this.chat.edit(actor, id, seq, dto.body);
  }

  @Delete('conversations/:id/messages/:seq')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Thu hồi tin của mình (xóa nội dung)' })
  recall(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Param('seq', ParseIntPipe) seq: number,
  ) {
    return this.chat.recall(actor, id, seq);
  }

  @Post('conversations/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Đánh dấu đã đọc tới tin số `seq`' })
  read(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Body() dto: MarkReadDto,
  ) {
    return this.chat.markRead(actor, id, dto.seq);
  }

  @Get('review')
  @RequireRoles(Role.GaHead)
  @ApiOperation({
    summary: 'Chủ GA: mọi cuộc trò chuyện của GA',
    description: 'Chỉ tên nhóm và thành viên. Đọc nội dung qua route bên dưới, có ghi audit.',
  })
  reviewList(@CurrentActor() actor: Actor, @Query() query: ReviewQueryDto) {
    return this.chat.reviewList(actor, query);
  }

  @Get('review/:id/messages')
  @RequireRoles(Role.GaHead)
  @ApiOperation({ summary: 'Chủ GA đọc một cuộc trò chuyện (ghi audit CHAT_READ)' })
  reviewMessages(
    @CurrentActor() actor: Actor,
    @Param('id', IdPipe) id: string,
    @Query() query: MessagesQueryDto,
  ) {
    return this.chat.reviewMessages(actor, id, query);
  }
}
