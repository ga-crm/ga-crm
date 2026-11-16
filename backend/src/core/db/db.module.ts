import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { Env } from '../../config/env.validation.js';
import { ActorDb } from '../tenancy/actor-db.js';
import { PlatformDb } from '../tenancy/platform-db.js';
import { TenantDb } from '../tenancy/tenant-db.js';
import {
  dataSourceOptions,
  PLATFORM_CONNECTION,
} from './data-source-options.js';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        dataSourceOptions(config.get('DATABASE_URL', { infer: true }), {
          poolSize: config.get('DATABASE_POOL_SIZE', { infer: true }),
        }),
    }),
    TypeOrmModule.forRootAsync({
      name: PLATFORM_CONNECTION,
      inject: [ConfigService],
      // Small: sign-in, session lookup and the console only
      useFactory: (config: ConfigService<Env, true>) =>
        dataSourceOptions(
          config.get('DATABASE_PLATFORM_URL', { infer: true }),
          {
            poolSize: 4,
            applicationName: 'ga-crm-platform',
          },
        ),
    }),
  ],
  providers: [TenantDb, PlatformDb, ActorDb],
  exports: [TenantDb, PlatformDb, ActorDb],
})
export class DbModule {}
