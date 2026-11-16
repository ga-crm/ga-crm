import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** DATA-7: default 25, maximum 50. */
export class PageQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 25, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  pageSize: number = 25;
}

/** Escapes user input for LIKE / ILIKE patterns (the default escape character is a backslash). */
export const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, '\\$&');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isId = (value: unknown): value is string =>
  typeof value === 'string' && UUID.test(value);

/** Record ids are UUIDs; anything else is a bad request rather than a database error. */
@Injectable()
export class IdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isId(value)) throw new BadRequestException();
    return value.toLowerCase();
  }
}
