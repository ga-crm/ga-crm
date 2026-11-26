import { Column, Entity, PrimaryColumn } from 'typeorm';
import type {
  LeadCareStatus,
  LeadInterest,
  LeadOrigin,
  LeadStage,
} from '../lead-rules.js';

/** CMP-1 + section 18.9 */
export const CAMPAIGN_TYPES = [
  'ADS',
  'SEMINAR',
  'TELESALES',
  'REFERRAL',
  'SOCIAL_ZALO',
  'EVENT',
  'OTHER',
] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];
export const CAMPAIGN_STATUSES = ['PLANNED', 'ACTIVE', 'ENDED'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** CMP-4: optional fields a public form may ask for, beyond name, phone and consent. */
export const FORM_FIELDS = ['email', 'province', 'need'] as const;
export type FormField = (typeof FORM_FIELDS)[number];

export interface PublicForm {
  slug: string;
  enabled: boolean;
  fields: FormField[];
  consentText: string;
  privacyNotice: string;
  updatedAt: Date;
}

const id = () => PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' });
const text = () => Column({ type: 'text', nullable: true });
const time = () => Column({ type: 'timestamptz', nullable: true });
const ref = () => Column({ type: 'uuid', nullable: true });

/** Section 18.4 (CMP-1, CMP-2). Here rather than in campaigns, since leads point to it. */
@Entity('campaigns')
export class Campaign {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'text' }) name: string;
  @Column({ type: 'text', default: 'OTHER' }) type: CampaignType;
  @Column({ type: 'text', default: 'ACTIVE' }) status: CampaignStatus;
  @text() channel: string | null;
  @Column({ type: 'date', nullable: true }) startDate: string | null;
  @Column({ type: 'date', nullable: true }) endDate: string | null;
  @Column({ type: 'bigint', nullable: true }) budgetVnd: string | null;
  @ref() ownerUserId: string | null;
  @text() notes: string | null;
  @time() eventAt: Date | null;
  @text() location: string | null;
  @Column({ type: 'jsonb', nullable: true }) publicForm: PublicForm | null;
  @Column({ type: 'timestamptz', default: () => 'now()' }) createdAt: Date;
  @Column({ type: 'timestamptz', default: () => 'now()' }) updatedAt: Date;
}

/** CMP-2 */
export const MEMBER_STATUSES = [
  'INVITED',
  'REGISTERED',
  'ATTENDED',
  'NO_SHOW',
] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

@Entity('campaign_members')
export class CampaignMember {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'uuid' }) campaignId: string;
  @Column({ type: 'uuid' }) leadId: string;
  @Column({ type: 'text' }) status: MemberStatus;
  @ref() updatedBy: string | null;
  @Column({ type: 'timestamptz', default: () => 'now()' }) updatedAt: Date;
}

/** Section 18.4. Unset fields are null. */
@Entity('leads')
export class Lead {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @text() externalId: string | null;
  @Column({ type: 'text' }) fullName: string;
  @Column({ type: 'text' }) nameNorm: string;
  /** DATA-4: `0xxxxxxxxx`. LEAD-1: one lead per phone in a tenant. */
  @Column({ type: 'text' }) phone: string;
  @text() email: string | null;
  @text() gender: string | null;
  @text() dob: string | null;
  @Column({ type: 'integer', nullable: true }) age: number | null;
  @text() province: string | null;
  @text() region: string | null;
  /** Decided 26/11/2026: the province and commune after 1/7/2025, and the street address. */
  @text() provinceCode: string | null;
  @text() wardCode: string | null;
  @text() addressLine: string | null;
  @Column({ type: 'text' }) source: string;
  @text() phoneSource: string | null;
  @ref() campaignId: string | null;
  /** LEAD-5: never changes after creation. */
  @Column({ type: 'date' }) leadDate: string;
  @text() registeredAt: string | null;
  @text() productInterest: string | null;
  /** TENANT-5: the catalogue product the lead is interested in (decided 25/11/2026). */
  @text() productCode: string | null;
  @text() productSecondary: string | null;
  /** bigint comes back as a string; the API sends a number. */
  @Column({ type: 'bigint', nullable: true }) valueVnd: string | null;
  @text() refLink: string | null;
  @text() extraInfo: string | null;
  @Column({ type: 'text' }) stage: LeadStage;
  @text() interest: LeadInterest | null;
  @text() careStatus: LeadCareStatus | null;
  @text() lostReason: string | null;
  /** PDP-2: kept as written and never sent to AI. */
  @text() progressNote: string | null;
  @text() messageStatus: string | null;
  /** A GA's file: what was done 10, 15 and 20 days later, and how it was handled (25/11/2026). */
  @Column({ type: 'text', nullable: true, name: 'follow_up_10d' })
  followUp10d: string | null;
  @Column({ type: 'text', nullable: true, name: 'follow_up_15d' })
  followUp15d: string | null;
  @Column({ type: 'text', nullable: true, name: 'follow_up_20d' })
  followUp20d: string | null;
  @text() handlingNote: string | null;
  @text() cdytStats: string | null;
  @text() cdytProfile: string | null;
  @Column({ type: 'text' }) origin: LeadOrigin;
  @text() assignedAgentCode: string | null;
  @ref() assignedBy: string | null;
  @time() assignedAt: Date | null;
  @time() assigneeSeenAt: Date | null;
  @time() assigneeViewedAt: Date | null;
  @time() lastCommentAt: Date | null;
  @ref() lastCommentBy: string | null;
  @time() firstContactAt: Date | null;
  @time() lastContactAt: Date | null;
  @time() nextActionAt: Date | null;
  @Column({ type: 'boolean' }) consentMarketing: boolean;
  @time() consentAt: Date | null;
  @text() consentSource: string | null;
  @text() consentIpHash: string | null;
  @text() applicationNo: string | null;
  @text() policyNo: string | null;
  /** LEAD-32 */
  @Column({ type: 'uuid', nullable: true }) clientId: string | null;
  @text() linkStatus: 'NONE' | 'CONFIRMED' | null;
  @ref() linkedBy: string | null;
  @time() linkedAt: Date | null;
  @ref() createdBy: string | null;
  @Column({ type: 'timestamptz' }) createdAt: Date;
  /** Set by the code: the last change to the lead's data (IMP-26), never a comment or a view. */
  @Column({ type: 'timestamptz' }) updatedAt: Date;
  @ref() lastImportId: string | null;
  /** LEAD-40 */
  @time() deletedAt: Date | null;
  @ref() deletedBy: string | null;
  @text() deleteReason: string | null;
  @text() deletedPhone: string | null;
  /** LEAD-41 */
  @ref() mergedInto: string | null;
  /** PDP-6 */
  @time() erasedAt: Date | null;
}

/**
 * Decided 26/11/2026: a user asked to help with a lead besides its assignee. A supporter sees the
 * lead with its phone masked (PDP-3) and may comment, never change it.
 */
@Entity('lead_supporters')
export class LeadSupporter {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'uuid' }) leadId: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'uuid' }) addedBy: string;
  @Column({ type: 'timestamptz', default: () => 'now()' }) createdAt: Date;
}

/** LEAD-20 */
@Entity('lead_history')
export class LeadHistory {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'uuid' }) leadId: string;
  @Column({ type: 'text' }) field: string;
  @text() oldValue: string | null;
  @text() newValue: string | null;
  @text() note: string | null;
  @ref() importId: string | null;
  @Column({ type: 'uuid' }) changedBy: string;
  @Column({ type: 'timestamptz' }) changedAt: Date;
}

/** NOTE-2; SEMINAR is written when a lead attends a seminar (CMP-2). */
export const INTERACTION_TYPES = [
  'NOTE',
  'CALL',
  'ZALO',
  'MEETING',
  'SEMINAR',
] as const;
export const CONTACT_TYPES = ['CALL', 'ZALO', 'MEETING'] as const;

/** NOTE-2 */
@Entity('interactions')
export class Interaction {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @text() agentCode: string | null;
  @ref() leadId: string | null;
  @Column({ type: 'uuid', nullable: true }) clientId: string | null;
  @Column({ type: 'text' }) type: string;
  @text() outcome: string | null;
  @Column({ type: 'text' }) note: string;
  @Column({ type: 'timestamptz' }) occurredAt: Date;
  @Column({ type: 'text', default: 'APP' }) source: string;
  @time() editedAt: Date | null;
  @Column({ type: 'boolean', default: false }) initial: boolean;
  @ref() createdBy: string | null;
  @Column({ type: 'timestamptz' }) createdAt: Date;
}

/** CMT */
@Entity('comments')
export class Comment {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @ref() leadId: string | null;
  @Column({ type: 'uuid', nullable: true }) clientId: string | null;
  @Column({ type: 'uuid' }) authorUserId: string;
  @Column({ type: 'text' }) body: string;
  /** CMT-5: the users the comment names with @. */
  @Column({ type: 'uuid', array: true, nullable: true }) mentions:
    string[] | null;
  @Column({ type: 'timestamptz' }) createdAt: Date;
}

export const TASK_STATUSES = ['OPEN', 'DONE', 'CANCELLED'] as const;
/** TASK-1; SIGNAL is a task made from a care opportunity (SIG-2). */
export const TASK_SOURCES = [
  'APP',
  'AUTO_ASSIGN',
  'NEXT_ACTION',
  'SIGNAL',
] as const;

/** TASK-1 */
@Entity('tasks')
export class Task {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @ref() leadId: string | null;
  @Column({ type: 'uuid', nullable: true }) clientId: string | null;
  @text() signal: string | null;
  @text() agentCode: string | null;
  @Column({ type: 'text' }) title: string;
  @Column({ type: 'timestamptz' }) dueAt: Date;
  @Column({ type: 'text' }) status: (typeof TASK_STATUSES)[number];
  @Column({ type: 'text' }) source: (typeof TASK_SOURCES)[number];
  @time() doneAt: Date | null;
  @ref() doneBy: string | null;
  @Column({ type: 'boolean', nullable: true }) suspendedByDelete:
    boolean | null;
  @Column({ type: 'uuid' }) createdBy: string;
  @Column({ type: 'timestamptz' }) createdAt: Date;
}

/** LEAD-38 */
@Entity('saved_filters')
export class SavedFilter {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'uuid' }) userId: string;
  @Column({ type: 'text', default: 'leads' }) screen: string;
  @Column({ type: 'text' }) name: string;
  @Column({ type: 'jsonb' }) query: Record<string, string>;
  @Column({ type: 'timestamptz' }) createdAt: Date;
}

/** OPT-1, and the GA's own lists of section 5.2 (region, phone source, lost reason). */
export const LEAD_OPTION_KINDS = [
  'interest',
  'care_status',
  'source',
  'region',
  'phone_source',
  'lost_reason',
] as const;

/**
 * Lists whose code is the label itself, because files and free text carry the words (OPT-3 for
 * sources). The section 5.2 lists start empty (open question D) and only suggest values: a lead may
 * still carry a region or reason the GA has not listed.
 */
export const TEXT_CODE_KINDS: readonly string[] = ['source', 'region', 'phone_source', 'lost_reason'];
export type LeadOptionKind = (typeof LEAD_OPTION_KINDS)[number];

/** OPT-1: one value of a GA's lead catalogue. */
@Entity('lead_options')
export class LeadOption {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'text' }) kind: LeadOptionKind;
  @Column({ type: 'text' }) code: string;
  @Column({ type: 'text' }) label: string;
  @Column({ type: 'text' }) labelNorm: string;
  @Column({ type: 'boolean', default: false }) isOpportunity: boolean;
  @Column({ type: 'boolean', default: false }) isFinal: boolean;
  @Column({ type: 'boolean', default: true }) active: boolean;
  @Column({ type: 'integer' }) sortOrder: number;
  @Column({ type: 'boolean', default: false }) builtIn: boolean;
  @Column({ type: 'timestamptz', default: () => 'now()' }) createdAt: Date;
}
