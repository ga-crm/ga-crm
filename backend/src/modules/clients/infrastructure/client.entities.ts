import { Column, Entity, PrimaryColumn } from 'typeorm';
import { bigintNumber } from '../../../core/db/transformers.js';
import type { Relation } from '../client-insights.js';
import { LINK_SOURCES, PRODUCT_ROLES } from '../client.constants.js';
import type { LinkSource } from '../client.constants.js';

export { LINK_SOURCES };

const id = () => PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' });
const text = () => Column({ type: 'text', nullable: true });
const time = () => Column({ type: 'timestamptz', nullable: true });
const int = () => Column({ type: 'integer', nullable: true });
const flag = () => Column({ type: 'boolean', nullable: true });
const money = () =>
  Column({ type: 'bigint', nullable: true, transformer: bigintNumber });
const day = () => Column({ type: 'date', nullable: true });

/** CUS-4: why an agent sees (and maybe owns) a client. Stored as JSON, so dates are ISO text. */
export interface AgentLink {
  agentCode: string;
  source: LinkSource;
  createdAt: Date | string;
}

/** CUS-12: an agent's share of a policy. Ended links stay for history (IMP-17). */
export interface PolicyAgent {
  agentCode: string;
  splitPercent?: number;
  isServicing: boolean;
  startedAt: Date | string;
  endedAt?: Date | string;
  lastImportId?: string;
  lastSeenAt?: Date | string;
}

/** CUS-11 */
export interface PolicyClient {
  clientCode: string;
  role: 'PO' | 'LI' | 'BEN';
  source: 'POLICY' | 'PRODUCT';
  endedAt?: Date | string;
  lastImportId?: string;
}

/** PRD-1 to PRD-6: one programme for one insured person. */
export interface PolicyProduct {
  productCode: string;
  /** "" = the main insured, or a person known only by name (PRD-3). */
  insuredCode: string;
  productName?: string;
  productRole: string;
  sumAssuredVnd?: number;
  annualPremiumVnd?: number;
  plan?: string;
  startDate?: string;
  status?: string;
  // PRD-5: kept by the GA; no file writes or clears them
  insuredName?: string;
  insuredDob?: string;
  insuredGender?: string;
  termYears?: number;
  programCode?: string;
  lastImportId?: string;
}

/** Section 18.5. DATA-1: `clientCode` is a 10-digit string that keeps its leading zeros. */
@Entity('clients')
export class Client {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'text' }) clientCode: string;
  @Column({ type: 'text' }) name: string;
  @Column({ type: 'text' }) nameNorm: string;
  /** CUS-3 */
  @text() phone: string | null;
  // CUS-2: the fields Success sends
  @text() tier: string | null;
  @int() activePolicies: number | null;
  @int() lapsedPolicies: number | null;
  @text() dob: string | null;
  @text() gender: string | null;
  @text() maritalStatus: string | null;
  @int() loyaltyPoints: number | null;
  @flag() usesDconnect: boolean | null;
  @time() dconnectLastLoginAt: Date | null;
  /** PDP-1 */
  @flag() idUpdated: boolean | null;
  @flag() ekycRegistered: boolean | null;
  @time() ekycRegisteredAt: Date | null;
  /** `dd/mm` */
  @text() birthDayMonth: string | null;
  @int() birthMonth: number | null;
  @text() ageBand: string | null;
  @Column({ type: 'jsonb', default: () => `'[]'` }) agentLinks: AgentLink[];
  @Column({ type: 'text', array: true, default: () => `'{}'` })
  visibleAgentCodes: string[];
  @Column({ type: 'text', array: true, default: () => `'{}'` })
  ownerAgentCodes: string[];
  @Column({ type: 'text' }) origin: 'IMPORT' | 'MANUAL';
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @Column({ type: 'uuid', nullable: true }) lastImportId: string | null;
  @time() lastSeenAt: Date | null;
  @Column({ type: 'timestamptz' }) createdAt: Date;
  @Column({ type: 'timestamptz' }) updatedAt: Date;
}

/** Section 18.5. DATA-1: `policyNo` is a 9-digit string. */
@Entity('policies')
export class Policy {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'text' }) policyNo: string;
  @Column({ type: 'text' }) holderClientCode: string;
  @text() insuredClientCode: string | null;
  @text() servicingAgentCode: string | null;
  @Column({ type: 'text' }) holderName: string;
  @Column({ type: 'text' }) holderNameNorm: string;
  @Column({ type: 'text' }) insuredName: string;
  @Column({ type: 'text' }) insuredNameNorm: string;
  /** CUS-10 */
  @Column({ type: 'text' }) status: string;
  @Column({ type: 'date' }) effectiveDate: string;
  @Column({ type: 'date' }) maturityDate: string;
  @Column({ type: 'text' }) premiumFrequency: string;
  @day() premiumDueDate: string | null;
  @money() plannedPremiumVnd: number | null;
  @Column({ type: 'bigint', transformer: bigintNumber }) basePremiumVnd: number;
  @money() unpaidPremiumVnd: number | null;
  @money() aplDebtVnd: number | null;
  @flag() hasBeneficiary: boolean | null;
  @Column({ type: 'jsonb', default: () => `'[]'` }) agents: PolicyAgent[];
  /** SCOPE-5 */
  @Column({ type: 'text', array: true, default: () => `'{}'` })
  currentAgentCodes: string[];
  @Column({ type: 'jsonb', default: () => `'[]'` }) clients: PolicyClient[];
  /** Kept by a trigger from `clients`; never written by the code. */
  @Column({ type: 'text', array: true, insert: false, update: false })
  clientCodes: string[];
  @Column({ type: 'jsonb', default: () => `'[]'` }) products: PolicyProduct[];
  @Column({ type: 'text' }) origin: 'IMPORT' | 'MANUAL';
  @Column({ type: 'uuid', nullable: true }) createdBy: string | null;
  @Column({ type: 'uuid', nullable: true }) lastImportId: string | null;
  @time() lastSeenAt: Date | null;
  @Column({ type: 'timestamptz' }) createdAt: Date;
  @Column({ type: 'timestamptz' }) updatedAt: Date;
}

/** CUS-13, section 18.5 */
@Entity('applications')
export class Application {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'text' }) applicationNo: string;
  @text() policyNo: string | null;
  @Column({ type: 'text' }) agentCode: string;
  @text() clientCode: string | null;
  @Column({ type: 'text' }) holderName: string;
  @Column({ type: 'text' }) holderNameNorm: string;
  @Column({ type: 'date' }) createdDate: string;
  @day() receivedDate: string | null;
  @Column({ type: 'text' }) status: string;
  @day() issuedDate: string | null;
  @text() productCode: string | null;
  @money() apeVnd: number | null;
  @Column({ type: 'uuid', nullable: true }) lastImportId: string | null;
  @time() lastSeenAt: Date | null;
}

/** FAM-1 to FAM-4 */
@Entity('family_links')
export class FamilyLink {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'text' }) clientCode: string;
  @text() relatedClientCode: string | null;
  @text() fullName: string | null;
  /** FAM-4: each part of a birth date is optional. */
  @int() birthDay: number | null;
  @int() birthMonth: number | null;
  @int() birthYear: number | null;
  @text() gender: string | null;
  @Column({ type: 'text' }) relation: Relation;
  @text() note: string | null;
  /** FAM-6 */
  @Column({ type: 'uuid', nullable: true }) leadId: string | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'timestamptz', default: () => 'now()' }) createdAt: Date;
  @Column({ type: 'timestamptz', default: () => 'now()' }) updatedAt: Date;
}

/** PRG-1 */
@Entity('insurance_programs')
export class InsuranceProgram {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  /** PRG-4 */
  @Column({ type: 'text' }) code: string;
  @Column({ type: 'text' }) label: string;
  @Column({ type: 'text' }) productRole: (typeof PRODUCT_ROLES)[number];
  @text() productCode: string | null;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @Column({ type: 'integer' }) sortOrder: number;
  @Column({ type: 'timestamptz', default: () => 'now()' }) createdAt: Date;
}

/** IMP-21: one row per field an import or a person really changed. */
@Entity('record_changes')
export class RecordChange {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'text' }) entity: string;
  @Column({ type: 'text' }) entityKey: string;
  @Column({ type: 'text' }) field: string;
  @text() oldValue: string | null;
  @text() newValue: string | null;
  @Column({ type: 'uuid', nullable: true }) importId: string | null;
  @Column({ type: 'uuid' }) changedBy: string;
  @Column({ type: 'timestamptz' }) changedAt: Date;
}
