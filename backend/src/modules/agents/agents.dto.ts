import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PageQueryDto } from '../../common/pagination.js';
import { IsBirthDate, IsCalendarDate } from '../../common/validators.js';
import {
  AGENT_RANKS,
  AGENT_STATUSES,
  type AgentRank,
  type AgentStatus,
} from './infrastructure/agent.entity.js';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
const isSet = (_: unknown, value: unknown) => value !== undefined;

export class ListAgentsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ description: 'Tìm theo họ tên hoặc mã đại lý' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiPropertyOptional({ enum: AGENT_RANKS })
  @IsOptional()
  @IsIn(AGENT_RANKS)
  rank?: AgentRank;

  @ApiPropertyOptional({ enum: AGENT_STATUSES })
  @IsOptional()
  @IsIn(AGENT_STATUSES)
  status?: AgentStatus;
}

class AgentOptionalFieldsDto {
  @ApiPropertyOptional({ nullable: true, example: 'Nữ' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  gender?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '1990-01-15' })
  @IsOptional()
  @IsBirthDate()
  dob?: string | null;

  @ApiPropertyOptional({ nullable: true, example: '0900000001' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsCalendarDate()
  endDate?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  officeCode?: string | null;
}

export class CreateAgentDto extends AgentOptionalFieldsDto {
  @ApiProperty({ example: '9000001', description: 'Chỉ gồm chữ số' })
  @Transform(trim)
  @Matches(/^\d{1,20}$/)
  agentCode: string;

  @ApiProperty({ example: 'Nguyễn Thị A' })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @ApiProperty({ enum: AGENT_RANKS })
  @IsIn(AGENT_RANKS)
  rank: AgentRank;

  @ApiProperty({ enum: AGENT_STATUSES })
  @IsIn(AGENT_STATUSES)
  status: AgentStatus;

  @ApiProperty({ example: '2024-01-01' })
  @IsCalendarDate()
  startDate: string;

  @ApiPropertyOptional({ nullable: true, example: '9000000' })
  @IsOptional()
  @Matches(/^\d{1,20}$/)
  managerCode?: string | null;
}

export class UpdateAgentDto extends AgentOptionalFieldsDto {
  @ApiPropertyOptional()
  @ValidateIf(isSet)
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ enum: AGENT_RANKS })
  @ValidateIf(isSet)
  @IsIn(AGENT_RANKS)
  rank?: AgentRank;

  @ApiPropertyOptional({ enum: AGENT_STATUSES })
  @ValidateIf(isSet)
  @IsIn(AGENT_STATUSES)
  status?: AgentStatus;

  @ApiPropertyOptional()
  @ValidateIf(isSet)
  @IsCalendarDate()
  startDate?: string;
}

export class SetManagerDto {
  @ApiProperty({ nullable: true, example: '9000000', type: String })
  @IsOptional()
  @Matches(/^\d{1,20}$/)
  managerCode: string | null;
}
