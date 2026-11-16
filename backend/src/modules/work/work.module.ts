import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { RemindersService } from './reminders.service.js';
import { WorkController } from './work.controller.js';
import { WorkService } from './work.service.js';

/** Section 9.3 (TASK): tasks outside a lead, "Hôm nay", the calendar and the reminder rounds. */
@Module({
  imports: [
    AgentsModule,
    LeadsModule,
    ClientsModule,
    NotificationsModule,
    TenantsModule,
  ],
  controllers: [WorkController],
  providers: [WorkService, RemindersService],
  exports: [RemindersService],
})
export class WorkModule {}
