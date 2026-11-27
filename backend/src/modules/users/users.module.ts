import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [TenantsModule, NotificationsModule, AgentsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
