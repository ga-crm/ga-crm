import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AssignmentsController } from './assignments.controller.js';
import { AssignmentsService } from './assignments.service.js';

/** Decided 27/11/2026: the GA director approves the assignments others ask for. */
@Module({
  imports: [LeadsModule, ClientsModule, AgentsModule, NotificationsModule],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
})
export class AssignmentsModule {}
