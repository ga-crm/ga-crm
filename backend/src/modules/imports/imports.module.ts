import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { ImportsController } from './imports.controller.js';
import { ImportsService } from './imports.service.js';

/** Chapter 12: Success files, lead files and the agent tree, through one flow. */
@Module({
  imports: [AgentsModule, LeadsModule, ClientsModule],
  controllers: [ImportsController],
  providers: [ImportsService],
})
export class ImportsModule {}
