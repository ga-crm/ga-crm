import { Module } from '@nestjs/common';
import { ProductsModule } from '../products/products.module.js';
import { AccessModule } from '../access/access.module.js';
import { AgentsModule } from '../agents/agents.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { LeadOptionsController } from './lead-options.controller.js';
import { LeadOptionsService } from './lead-options.service.js';
import { LeadRemovalService } from './lead-removal.service.js';
import { LeadsController } from './leads.controller.js';
import { LeadSupportersService } from './lead-supporters.service.js';
import { LeadsService } from './leads.service.js';
import { SavedFiltersService } from './saved-filters.service.js';

@Module({
  imports: [
    AccessModule,
    AgentsModule,
    TenantsModule,
    NotificationsModule,
    ProductsModule,
  ],
  controllers: [LeadsController, LeadOptionsController],
  providers: [
    LeadsService,
    LeadOptionsService,
    LeadRemovalService,
    LeadSupportersService,
    SavedFiltersService,
  ],
  exports: [LeadsService, LeadOptionsService, LeadRemovalService],
})
export class LeadsModule {}
