import { Module } from '@nestjs/common';
import { PermissionsController } from './permissions.controller.js';
import { SettingsController } from './settings.controller.js';
import { TenantsService } from './tenants.service.js';

@Module({
  controllers: [SettingsController, PermissionsController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
