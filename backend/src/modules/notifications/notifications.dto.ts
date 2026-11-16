import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsUUID,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination.js';
import { NOTIFICATION_TYPES } from './notification-rules.js';
import type { NotificationType } from './notification-rules.js';

const flag = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === '1';

/** Section 17.12 GET /notifications */
export class ListNotificationsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Chỉ thông báo chưa đọc' })
  @IsOptional()
  @Transform(flag)
  @IsBoolean()
  unreadOnly?: boolean;
}

/** Section 17.12 POST /notifications/read: `{ids}` or `{all: true}`. */
export class MarkReadDto {
  @ApiPropertyOptional({ type: [String], maxItems: 200 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsUUID(undefined, { each: true })
  ids?: string[];

  @ApiPropertyOptional({ description: 'Đánh dấu mọi thông báo là đã đọc' })
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

/** NTF-3: one event and channel turned on or off. */
export class NotificationPrefDto {
  @ApiProperty({ enum: NOTIFICATION_TYPES })
  @IsIn(NOTIFICATION_TYPES)
  type: NotificationType;

  @ApiProperty()
  @IsBoolean()
  inApp: boolean;
}

export class NotificationPrefsDto {
  @ApiProperty({ type: [NotificationPrefDto] })
  @IsArray()
  @ArrayMaxSize(NOTIFICATION_TYPES.length)
  @ValidateNested({ each: true })
  @Type(() => NotificationPrefDto)
  items: NotificationPrefDto[];
}
