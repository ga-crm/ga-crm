import { Global, Module } from '@nestjs/common';
import { ActivityService } from './activity.service.js';
import { PresenceController } from './presence.controller.js';
import { PresenceService } from './presence.service.js';

/** Global, because the REST session guard counts each request towards daily active users. */
@Global()
@Module({
  controllers: [PresenceController],
  providers: [PresenceService, ActivityService],
  exports: [PresenceService, ActivityService],
})
export class PresenceModule {}
