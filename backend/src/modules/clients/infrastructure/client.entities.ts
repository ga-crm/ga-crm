import { Column, Entity, PrimaryColumn } from 'typeorm';
import { bigintNumber } from '../../../core/db/transformers.js';
import type { Relation } from '../client-insights.js';
import { LINK_SOURCES, PRODUCT_ROLES } from '../client.constants.js';
import type {
  CareRecordKind,
  LinkSource,
  ReferralRelation,
  ReferralResult,
} from '../client.constants.js';

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

/** CUS-11: a person on the policy, by client id. */
export interface PolicyClient {
  clientId: string;
  role: 'PO' | 'LI' | 'BEN';
  source: 'POLICY' | 'PRODUCT';
  endedAt?: Date | string;
  lastImportId?: string;
}

/** PRD-1 to PRD-6: one programme for one insured person. */
export interface PolicyProduct {
  productCode: string;
  /** PRD-3: absent = the main insured, or a person known only by name. */
  insuredClientId?: string;
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

/**
 * Section 18.5. A client is identified by its id (decided 25/11/2026). `successCode` is the
 * insurer's 10-digit client code (DATA-1), kept only so a Success import finds the same person
 * again; no API response or screen carries it.
 */
@Entity('clients')
export class Client {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @text() successCode: string | null;
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

/**
 * Section 18.5. DATA-1: `policyNo` is a 9-digit string; it is what people type and search
 * ("Mã hợp đồng"). A policy added by hand may hold only its number (decided 25/11/2026).
 */
@Entity('policies')
export class Policy {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'text' }) policyNo: string;
  @Column({ type: 'uuid', nullable: true }) holderClientId: string | null;
  @Column({ type: 'uuid', nullable: true }) insuredClientId: string | null;
  @text() servicingAgentCode: string | null;
  @text() holderName: string | null;
  @text() holderNameNorm: string | null;
  @text() insuredName: string | null;
  @text() insuredNameNorm: string | null;
  /** CUS-10 */
  @text() status: string | null;
  @day() effectiveDate: string | null;
  @day() maturityDate: string | null;
  @text() premiumFrequency: string | null;
  @day() premiumDueDate: string | null;
  @money() plannedPremiumVnd: number | null;
  @money() basePremiumVnd: number | null;
  @money() unpaidPremiumVnd: number | null;
  @money() aplDebtVnd: number | null;
  @flag() hasBeneficiary: boolean | null;
  /** Personal data: returned only by the audited reveal (decided 25/11/2026). */
  @text() contactAddress: string | null;
  /** Used only when the policy has no main product line with a sum assured. */
  @money() sumAssuredVnd: number | null;
  @day() graceEndDate: string | null;
  /** DLVN's assignment of the servicing agent (Success only). */
  @text() assignmentType: string | null;
  @day() assignmentDate: string | null;
  @money() advancePremiumVnd: number | null;
  @money() totalPaidPremiumVnd: number | null;
  @money() basicPremiumVnd: number | null;
  @money() topUpPremiumVnd: number | null;
  @Column({ type: 'jsonb', default: () => `'[]'` }) agents: PolicyAgent[];
  /** SCOPE-5 */
  @Column({ type: 'text', array: true, default: () => `'{}'` })
  currentAgentCodes: string[];
  @Column({ type: 'jsonb', default: () => `'[]'` }) clients: PolicyClient[];
  /** Kept by a trigger from `clients`; never written by the code. */
  @Column({ type: 'uuid', array: true, insert: false, update: false })
  clientIds: string[];
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
  @Column({ type: 'uuid', nullable: true }) clientId: string | null;
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
  @Column({ type: 'uuid' }) clientId: string;
  @Column({ type: 'uuid', nullable: true }) relatedClientId: string | null;
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

/** Decided 26/11/2026: one dated care event of a client, entered by hand. */
@Entity('client_care_records')
export class ClientCareRecord {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'uuid' }) clientId: string;
  @Column({ type: 'text' }) kind: CareRecordKind;
  @Column({ type: 'date' }) occurredOn: string;
  /** What: the event's or the gift's name. */
  @text() title: string | null;
  /** Where: the hospital of a claim, the venue of an event. */
  @text() place: string | null;
  @money() amountVnd: number | null;
  @text() policyNo: string | null;
  @text() note: string | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'timestamptz', default: () => 'now()' }) createdAt: Date;
  @Column({ type: 'timestamptz', default: () => 'now()' }) updatedAt: Date;
}

/** Decided 26/11/2026: one person a client referred, and what came of it. */
@Entity('client_referrals')
export class ClientReferral {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'uuid' }) clientId: string;
  @Column({ type: 'text' }) personName: string;
  @Column({ type: 'text' }) relation: ReferralRelation;
  @Column({ type: 'date' }) referredOn: string;
  @Column({ type: 'text' }) result: ReferralResult;
  /** The premium of the policy a successful referral brought. */
  @money() premiumVnd: number | null;
  @text() note: string | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'timestamptz', default: () => 'now()' }) createdAt: Date;
  @Column({ type: 'timestamptz', default: () => 'now()' }) updatedAt: Date;
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
