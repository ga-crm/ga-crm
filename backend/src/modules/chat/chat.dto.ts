import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination.js';
import { MAX_FILES } from './chat-files.js';
import { BODY_MAX, GROUP_MAX } from './chat-rules.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class OpenDirectDto {
  @ApiProperty({ description: 'Người muốn nhắn (cùng GA, đang hoạt động)' })
  @IsUUID()
  userId: string;
}

export class CreateGroupDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;

  @ApiProperty({ type: [String], description: 'Thành viên, chưa gồm người tạo' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(GROUP_MAX - 1)
  @IsUUID(undefined, { each: true })
  memberIds: string[];
}

export class RenameGroupDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title: string;
}

export class AddMembersDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(GROUP_MAX - 1)
  @IsUUID(undefined, { each: true })
  userIds: string[];
}

export class SetRoleDto {
  @ApiProperty({ enum: ['ADMIN', 'MEMBER'] })
  @IsIn(['ADMIN', 'MEMBER'])
  role: 'ADMIN' | 'MEMBER';
}

export class SendMessageDto {
  @ApiProperty({ description: 'Do trình duyệt tạo; gửi lại cùng giá trị thì vẫn là một tin' })
  @IsUUID()
  clientMsgId: string;

  @ApiPropertyOptional({ maxLength: BODY_MAX, description: 'Có thể trống khi tin chỉ gồm file' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(BODY_MAX)
  body?: string;

  @ApiPropertyOptional({ type: [String], description: 'File đã tải lên cuộc trò chuyện này (POST .../files), tối đa 5' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_FILES)
  @IsUUID(undefined, { each: true })
  fileIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Người được @nhắc tên (chỉ trong nhóm)' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID(undefined, { each: true })
  mentions?: string[];
}

export class EditMessageDto {
  @ApiProperty({ maxLength: BODY_MAX })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(BODY_MAX)
  body: string;
}

export class MarkReadDto {
  @ApiProperty({ description: 'Đã đọc tới tin số này' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  seq: number;
}

export class ChatPrefsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  muted?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;
}

export class MessagesQueryDto {
  @ApiPropertyOptional({ description: 'Các tin trước tin số này (cuộn lên)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  before?: number;

  @ApiPropertyOptional({ description: 'Các tin sau tin số này (lấy bù khi kết nối lại)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  after?: number;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;
}

export class SearchQueryDto {
  @ApiProperty({ minLength: 2, description: 'Từ cần tìm; không phân biệt dấu và hoa thường' })
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q: string;
}

export class PeopleQueryDto {
  @ApiPropertyOptional({ description: 'Tên hoặc email' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class ReviewQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Tên nhóm hoặc tên thành viên' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  q?: string;
}
