import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ChatModule } from '../chat/chat.module.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeService } from './realtime.service.js';

/**
 * Section 9: pushes events to browsers. Global, because any module may announce a committed
 * change, including AuthModule, which the gateway itself needs for the handshake.
 */
@Global()
@Module({
  providers: [RealtimeService],
  exports: [RealtimeService],
})
export class RealtimeModule {}

/** The Socket.IO gateway; separate so RealtimeModule depends on nothing but the database. PresenceModule is global. */
@Module({
  imports: [AuthModule, ChatModule],
  providers: [RealtimeGateway],
})
export class RealtimeGatewayModule {}
