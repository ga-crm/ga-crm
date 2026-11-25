import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AllExceptionsFilter } from './common/errors.js';
import { type Env, validateEnv } from './config/env.validation.js';
import { DbModule } from './core/db/db.module.js';
import { RedisModule } from './core/redis/redis.module.js';
import { StorageModule } from './core/storage/storage.module.js';
import { HealthController } from './core/health/health.controller.js';
import { AgentsModule } from './modules/agents/agents.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import {
  AuthorizationGuard,
  CsrfOriginGuard,
  HttpThrottlerGuard,
  SessionAuthGuard,
  UserRateLimitGuard,
} from './modules/auth/auth.guards.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CampaignsModule } from './modules/campaigns/campaigns.module.js';
import { WorkModule } from './modules/work/work.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { ClientsModule } from './modules/clients/clients.module.js';
import { ImportsModule } from './modules/imports/imports.module.js';
import { LeadsModule } from './modules/leads/leads.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { PlatformModule } from './modules/platform/platform.module.js';
import { PresenceModule } from './modules/presence/presence.module.js';
import { GeoModule } from './modules/geo/geo.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import {
  RealtimeGatewayModule,
  RealtimeModule,
} from './modules/realtime/realtime.module.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';
import { UsersModule } from './modules/users/users.module.js';

@Module({
  imports: [
    // process.env is filled by config/load-env.side-effect.ts before this runs
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    DbModule,
    RedisModule,
    StorageModule,
    RealtimeModule,
    PresenceModule,
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        // Per IP, in memory until Redis arrives (phase 3). Higher than the per-user limit of
        // section 17.1 (UserRateLimitGuard) because a whole GA office can share one IP.
        throttlers: [{ name: 'default', ttl: 60_000, limit: 3000 }],
        skipIf: () => config.get('NODE_ENV', { infer: true }) === 'test',
      }),
    }),
    AuditModule,
    TenantsModule,
    UsersModule,
    AuthModule,
    PlatformModule,
    ProductsModule,
    GeoModule,
    AgentsModule,
    NotificationsModule,
    LeadsModule,
    ClientsModule,
    ImportsModule,
    CampaignsModule,
    WorkModule,
    ReportsModule,
    AiModule,
    ChatModule,
    RealtimeGatewayModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters. Every route is protected unless marked @Public().
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    { provide: APP_GUARD, useClass: CsrfOriginGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: UserRateLimitGuard },
    { provide: APP_GUARD, useClass: AuthorizationGuard },
  ],
})
export class AppModule {}
