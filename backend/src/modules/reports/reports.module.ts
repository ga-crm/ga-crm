import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { ClientsModule } from '../clients/clients.module.js';
import { LeadsModule } from '../leads/leads.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/** Chapter 13 (RPT), read only. */
@Module({
  imports: [
    AgentsModule,
    LeadsModule,
    TenantsModule,
    // R7 counts clients with the client list's own signal rules
    ClientsModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
