import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Permission } from '../../common/rbac.js';
import type { Actor } from '../../common/rbac.js';
import { AgentsService } from '../agents/agents.service.js';

/**
 * Record-level visibility (the CRM "sharing model"): which agents' records a person may see.
 * Every list asks here, so the rule lives in one place (LEAD-6, SCOPE-1..3).
 */
@Injectable()
export class AccessService {
  constructor(private readonly agents: AgentsService) {}

  /**
   * LEAD-6: null when the person sees every lead of the GA (leads.manage), otherwise the agent codes
   * whose leads they see: their own and their downline, computed on the server (SCOPE-2).
   */
  async leadAgentCodes(
    actor: Actor,
    db?: EntityManager,
  ): Promise<string[] | null> {
    if (actor.permissions.includes(Permission.LeadsManage)) return null;
    return this.agents.scopeCodes(actor, db);
  }
}
