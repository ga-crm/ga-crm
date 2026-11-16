import { normalizeName } from '../../common/normalize.js';
import { DERIVED_SOURCES, SEE_ONLY_SOURCES } from './client.constants.js';
import type { LinkSource } from './client.constants.js';
import type {
  AgentLink,
  PolicyClient,
} from './infrastructure/client.entities.js';

/**
 * CUS-4: a client's agent links. Links that come from policies and applications are worked out
 * again from them; links that were stored (client sheet, manual, lead) are kept as they are.
 */
export function deriveLinks(input: {
  clientCode: string;
  stored: readonly AgentLink[];
  policies: readonly {
    currentAgentCodes: readonly string[];
    clients: readonly PolicyClient[];
  }[];
  applications: readonly { agentCode: string }[];
  /** CUS-4: the agent a lead linked to this client is assigned to sees and owns it (LEAD-32). */
  leads?: readonly { assignedAgentCode?: string | null }[];
  now: Date;
}): {
  agentLinks: AgentLink[];
  visibleAgentCodes: string[];
  ownerAgentCodes: string[];
} {
  const wanted: { agentCode: string; source: LinkSource }[] = input.stored
    .filter((link) => !DERIVED_SOURCES.includes(link.source))
    .map(({ agentCode, source }) => ({ agentCode, source }));
  for (const policy of input.policies) {
    const roles = policy.clients.filter(
      (link) => link.clientCode === input.clientCode && !link.endedAt,
    );
    const sources: LinkSource[] = [];
    if (roles.some((link) => link.role === 'PO')) sources.push('POLICY_HOLDER');
    if (roles.some((link) => link.role === 'LI'))
      sources.push('POLICY_INSURED');
    for (const agentCode of policy.currentAgentCodes) {
      for (const source of sources) wanted.push({ agentCode, source });
    }
  }
  for (const application of input.applications) {
    wanted.push({ agentCode: application.agentCode, source: 'APPLICATION' });
  }
  for (const lead of input.leads ?? []) {
    if (lead.assignedAgentCode)
      wanted.push({ agentCode: lead.assignedAgentCode, source: 'LEAD_LINK' });
  }

  const agentLinks: AgentLink[] = [];
  for (const { agentCode, source } of wanted) {
    if (
      agentLinks.some(
        (link) => link.agentCode === agentCode && link.source === source,
      )
    )
      continue;
    const kept = input.stored.find(
      (link) => link.agentCode === agentCode && link.source === source,
    );
    agentLinks.push({
      agentCode,
      source,
      createdAt: kept?.createdAt ?? input.now,
    });
  }
  const unique = (codes: string[]) => [...new Set(codes)];
  return {
    agentLinks,
    visibleAgentCodes: unique(agentLinks.map((link) => link.agentCode)),
    // CUS-6: every link but the see-only one makes the client the agent's own
    ownerAgentCodes: unique(
      agentLinks
        .filter((link) => !SEE_ONLY_SOURCES.includes(link.source))
        .map((link) => link.agentCode),
    ),
  };
}

/** COV-1 + CUS-10: Success writes the status as text; "Đang hiệu lực" is the active one. */
export const isActiveStatus = (status?: string | null): boolean =>
  !!status && normalizeName(status) === 'DANG HIEU LUC';
