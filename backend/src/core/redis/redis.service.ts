import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../config/env.validation.js';

/**
 * The Redis cache (docs/thiet-ke-he-thong.md section 7): presence and activity bitmaps today.
 * Losing it is allowed, so commands fail fast instead of queueing while it is down, and callers
 * treat a failure as "no data". Null when REDIS_URL is not set.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis | null;

  constructor(config: ConfigService<Env, true>) {
    const url = config.get('REDIS_URL', { infer: true });
    this.client = url
      ? new Redis(url, {
          connectionName: 'ga-crm-cache',
          enableOfflineQueue: false,
          maxRetriesPerRequest: 1,
          commandTimeout: 2_000,
        })
      : null;
    let down = false;
    this.client?.on('error', (error: Error) => {
      if (!down) this.logger.warn(`Redis cache unavailable: ${error.message}`);
      down = true;
    });
    this.client?.on('ready', () => {
      down = false;
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.quit().catch(() => undefined);
  }
}
