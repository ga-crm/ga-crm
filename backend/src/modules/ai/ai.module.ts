import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module.js';
import { AiAdminController } from './ai-admin.controller.js';
import { AiProviderClient } from './ai-provider.client.js';
import { AiSettingsService } from './ai-settings.service.js';

/** Chapter 14 (AI). Slice 7a: settings, provider keys and models. */
@Module({
  imports: [TenantsModule],
  controllers: [AiAdminController],
  providers: [AiSettingsService, AiProviderClient],
  exports: [AiSettingsService],
})
export class AiModule {}
