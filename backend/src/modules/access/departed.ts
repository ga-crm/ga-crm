import { AGENT_STATUSES } from '../agents/infrastructure/agent.entity.js';

/** AGT-7: an agent who stopped working ("Ngưng hoạt động"). */
export const STOPPED_AGENT_STATUS = AGENT_STATUSES[1];

/** Care statuses after which a lead needs nobody (the same as "open leads" in LEAD-23). */
export const CLOSED_CARE = `('WON', 'DROPPED', 'NOT_INTERESTED')`;

/**
 * Open question 12e (decided 14/11/2026), with AGT-7 and LEAD-9: the agent codes whose holder has
 * left the GA. A disabled or archived account had the code and no active or invited one holds it now,
 * or the agent stopped working. `tenant` and `stopped` are the query's placeholders for the tenant
 * id and STOPPED_AGENT_STATUS ("$1", ":tenantId"...).
 */
export function departedCodesSql(tenant: string, stopped: string): string {
  return `(SELECT u.agent_code FROM users u
            WHERE u.tenant_id = ${tenant} AND u.agent_code IS NOT NULL AND u.status IN ('DISABLED', 'ARCHIVED')
              AND NOT EXISTS (SELECT 1 FROM users a WHERE a.tenant_id = ${tenant} AND a.agent_code = u.agent_code
                                AND a.status IN ('ACTIVE', 'INVITED'))
           UNION
           SELECT g.agent_code FROM agents g WHERE g.tenant_id = ${tenant} AND g.status = ${stopped})`;
}
