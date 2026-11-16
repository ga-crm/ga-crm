import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { AccessService } from './access.service.js';

@Module({
  imports: [AgentsModule],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
