import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import {
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { DataSource } from 'typeorm';
import { Public } from '../../common/auth.decorators.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(@InjectDataSource() private readonly source: DataSource) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Kiểm tra API và kết nối PostgreSQL' })
  @ApiServiceUnavailableResponse({
    description: 'Không kết nối được PostgreSQL',
  })
  async check(): Promise<{ status: string; postgres: string }> {
    try {
      await this.source.query('SELECT 1');
      return { status: 'ok', postgres: 'up' };
    } catch {
      throw new ServiceUnavailableException();
    }
  }
}
