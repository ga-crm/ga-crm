import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Grants } from '../../../common/rbac.js';

/** Section 5.2: how a GA presents itself. Empty means "use the name the platform gave the GA". */
export interface TenantProfile {
  displayName?: string;
  address?: string;
}

/** Section 5.2 + 18.2, defaults included. */
export interface LeadRules {
  /** LEAD-29: hours an assigned agent has for the first contact. */
  contactDeadlineHours: number;
  /** LEAD-30: the "contacted in time" threshold of the reports. */
  contactedInTimeHours: number;
  /** OPEN (requirement/26 #4): stored, not acted on yet. */
  managersMayReassign: boolean;
  /** LEAD-26: applies with telesales campaigns. */
  consentForTelesales: boolean;
  /**
   * Decided 27/11/2026: days without contact after which an assigned lead goes back to the GA's
   * pool. The GA director changes it.
   */
  abandonDays: number;
}

export const DEFAULT_LEAD_RULES: LeadRules = {
  contactDeadlineHours: 48,
  contactedInTimeHours: 24,
  managersMayReassign: false,
  consentForTelesales: true,
  abandonDays: 30,
};

export const DEFAULT_NOTIFICATIONS = {
  quietHours: { from: '21:00', to: '07:30' },
  digest: true,
};

/** One row per tenant (section 18.2). */
@Entity('tenant_settings')
export class TenantSettings {
  @PrimaryColumn({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'jsonb' })
  grants: Grants;

  @Column({ type: 'jsonb' })
  leadRules: Partial<LeadRules>;

  @Column({ type: 'jsonb', default: () => `'{}'` })
  profile: TenantProfile;

  @Column({ type: 'jsonb' })
  notifications: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => `'{"mfaForAll": false}'` })
  security: { mfaForAll?: boolean };

  /** Section 5.2: optimistic concurrency for the settings form. */
  @Column({ type: 'integer', default: 0 })
  version: number;

  @Column({ type: 'integer', default: 1 })
  permissionsVersion: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
