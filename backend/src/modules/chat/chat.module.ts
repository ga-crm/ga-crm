import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';
import { ChatFilesService } from './chat-files.service.js';
import { ChatNoticesService } from './chat-notices.service.js';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';

/** Realtime slices C2 and C3. RealtimeModule is global; the gateway asks ChatService about typing. */
@Module({
  imports: [NotificationsModule, TenantsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatFilesService, ChatNoticesService],
  exports: [ChatService],
})
export class ChatModule {}
