import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ClientCareService } from './client-care.service.js';
import { ClientEditorService } from './client-editor.service.js';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';
import { LeadLinkService } from './lead-link.service.js';
import { LeadLinksController } from './lead-links.controller.js';
import { ProgramsController } from './programs.controller.js';
import { ProgramsService } from './programs.service.js';

/** Chapter 10: clients, policies, family, care and the lead-to-client link. */
@Module({
  imports: [AgentsModule, LeadsModule, NotificationsModule],
  controllers: [ClientsController, ProgramsController, LeadLinksController],
  providers: [
    ClientsService,
    ClientEditorService,
    ClientCareService,
    LeadLinkService,
    ProgramsService,
  ],
  exports: [ClientsService, ClientEditorService, LeadLinkService],
})
export class ClientsModule {}
