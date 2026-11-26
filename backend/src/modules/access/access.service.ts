import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Permission, Role } from '../../common/rbac.js';
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
   * LEAD-6, changed 27/11/2026: null when the person sees every lead of the GA (the GA director, or
   * leads.manage, Admin by default, who sees them without the phone). Everyone else sees only their
   * own leads: a line manager no longer sees the leads of their line (reports still count them).
   * Computed on the server (SCOPE-2).
   */
  // eslint-disable-next-line @typescript-eslint/require-await
  async leadAgentCodes(
    actor: Actor,
    _db?: EntityManager,
  ): Promise<string[] | null> {
    if (
      actor.roles.includes(Role.GAD) ||
      actor.permissions.includes(Permission.LeadsManage)
    )
      return null;
    return actor.agentCode ? [actor.agentCode] : [];
  }
}
