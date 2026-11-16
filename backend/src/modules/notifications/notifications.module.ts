import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

/** Chapter 15 (NTF). Other modules call NotificationsService inside their own transactions. */
@Module({
  imports: [TenantsModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
