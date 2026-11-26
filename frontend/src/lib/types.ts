// Highest first (decided 26-27/11/2026): Marketing was dropped (Admin does its work) and the GA head
// became the GA director (GAD), whose agent code is optional
export const TENANT_ROLES = ['GAD', 'ADMIN', 'BM', 'UM', 'FC'] as const
export const AGENT_ROLES: readonly string[] = ['FC', 'UM', 'BM']
export const CONFIGURABLE_ROLES = ['ADMIN', 'BM', 'UM', 'FC'] as const

export type Role = (typeof TENANT_ROLES)[number] | 'PLATFORM_ADMIN'
export type UserStatus = 'INVITED' | 'ACTIVE' | 'DISABLED' | 'ARCHIVED'
export type Grants = Record<(typeof CONFIGURABLE_ROLES)[number], string[]>

export const AGENT_RANKS = ['SUM', 'BM', 'UM', 'SA', 'FC'] as const
export const AGENT_STATUSES = ['Đang hoạt động', 'Ngưng hoạt động'] as const
export type AgentRank = (typeof AGENT_RANKS)[number]
export type AgentStatus = (typeof AGENT_STATUSES)[number]

export interface AgentNode {
  agentCode: string
  name: string
  rank: AgentRank
  managerCode: string | null
  ancestors: string[]
  depth: number
  status: AgentStatus
  userId: string | null
}

export interface AgentDetail extends Omit<AgentNode, 'userId'> {
  managerName: string | null
  managerFixed: boolean
  gender: string | null
  startDate: string | null
  endDate: string | null
  officeCode: string | null
  /** AGT-6: absent unless the viewer is GAD or ADMIN. */
  dob?: string | null
  phone?: string | null
}

/** OPT-1: a GA's lead catalogue. Interest and care status codes are no longer a fixed list. */
/** OPT-1, then the GA's own lists of section 5.2 (open question D: they start empty). */
export const LEAD_OPTION_KINDS = ['interest', 'care_status', 'source', 'phone_source', 'lost_reason'] as const
export type LeadOptionKind = (typeof LEAD_OPTION_KINDS)[number]
export interface LeadOption {
  id: string
  kind: LeadOptionKind
  code: string
  label: string
  isOpportunity: boolean
  isFinal: boolean
  active: boolean
  sortOrder: number
  builtIn: boolean
}
export const LEAD_STAGES = ['NEW', 'CONTACTED', 'APPOINTMENT', 'MET', 'PROPOSAL', 'SUBMITTED', 'ISSUED', 'LOST'] as const
export type LeadStage = (typeof LEAD_STAGES)[number]
/** LEAD-19: where a lead can be moved by hand. */
export const LEAD_WORK_STAGES: readonly LeadStage[] = ['CONTACTED', 'APPOINTMENT', 'MET', 'PROPOSAL', 'SUBMITTED', 'LOST']

export interface LeadRow {
  id: string
  fullName: string
  phone: string
  source: string
  phoneSource: string | null
  leadDate: string
  stage: LeadStage
  interest: string | null
  careStatus: string | null
  assignedAgentCode: string | null
  agentName: string | null
  campaignId: string | null
  campaignName: string | null
  assignedAt: string | null
  firstContactAt: string | null
  lastContactAt: string | null
  nextActionAt: string | null
  consentMarketing: boolean
  origin: string
  isNew: boolean
  newComment: boolean
  overdue: boolean
  /** Decided 26/11/2026: the viewer sees this lead only because they support it; its phone is masked. */
  supporting: boolean
}

export interface LeadCounts {
  all: number
  mine: number
  unassigned: number
  overdue: number
  isNew: number
  newComment: number
}

export interface LeadTask {
  id: string
  title: string
  dueAt: string
  status: 'OPEN' | 'DONE' | 'CANCELLED'
  source: string
  agentCode: string | null
  doneAt: string | null
  doneBy: string | null
}

/** A province or a commune after 1/7/2025 (decided 26/11/2026). */
export interface Place {
  code: string
  name: string
  fullName: string
}

export interface LeadSupporter {
  userId: string
  name: string
  agentCode: string | null
  addedAt: string
  addedByName: string | null
}

export interface LeadDetail {
  lead: Omit<LeadRow, 'agentName' | 'campaignName' | 'assignedAt'> & {
    email: string | null
    gender: string | null
    dob: string | null
    province: string | null
    productInterest: string | null
    /** TENANT-5: the catalogue product the lead is interested in, and its name there. */
    productCode: string | null
    productName: string | null
    extraInfo: string | null
    /** Decided 26/11/2026: the province and commune after 1/7/2025, with their names, and the street address. */
    provinceCode: string | null
    provinceName: string | null
    wardCode: string | null
    wardName: string | null
    addressLine: string | null
    /** A GA's file: follow-ups after 10, 15 and 20 days, the handling note and the CDYT columns. */
    followUp10d: string | null
    followUp15d: string | null
    followUp20d: string | null
    handlingNote: string | null
    cdytStats: string | null
    cdytProfile: string | null
    lostReason: string | null
    applicationNo: string | null
    policyNo: string | null
    updatedAt: string
  }
  assignee: { agentCode: string; name: string | null } | null
  campaign: { id: string; name: string } | null
  interactions: { id: string; type: string; note: string; outcome: string | null; occurredAt: string; initial: boolean; createdBy: string | null; source: string; editedAt: string | null }[]
  comments: ThreadComment[]
  tasks: LeadTask[]
  history: { id: string; field: string; oldValue: string | null; newValue: string | null; note?: string | null; imported: boolean; changedBy: string; changedAt: string }[]
  userNames: Record<string, string>
  agentNames: Record<string, string>
  /** LEAD-28: oldest first; `to` is null for the current holder. */
  handovers: { agentCode: string; name: string | null; from: string; to: string | null; days: number; contacts: number }[]
  /** LEAD-32: the client this lead became. */
  /** clientId is null for someone who does not see client pages (CUS-5, PDP-4) */
  link: { clientId: string | null; clientName: string | null; linkedAt: string | null } | null
  canLink: boolean
  /** Decided 26/11/2026: "Người hỗ trợ": who helps with the lead, whether the viewer is one, and whether they may change the list. */
  supporters: LeadSupporter[]
  supporting: boolean
  canSupport: boolean
  /** Notes and tasks: whoever works the lead, and its supporters. */
  canContribute: boolean
  canWork: boolean
  canManage: boolean
  /** LEAD-21, or a line manager for a lead of their line (open question 4). */
  canAssign: boolean
  interestLocked: boolean
}

/** LEAD-32: one client a lead may be linked to, with why it was suggested. */
export interface LinkSuggestion {
  clientId: string
  name: string
  gender: string | null
  ageBand: string | null
  score: number
  reasons: ('NAME' | 'PHONE' | 'GENDER' | 'AGE' | 'APPLICATION')[]
  policies: { policyNo: string; status: string | null }[]
  applications: { applicationNo: string; status: string; createdDate: string }[]
}

export interface ImportSheet {
  name: string
  status: 'READY' | 'BLOCKED' | 'LATER' | 'IGNORED'
  reason?: string
  fields: string[]
  present: number[]
  missingRequired: string[]
  banned: string[]
  found: number
  inserted: number
  updated: number
  rejected: number
  skipped: number
  warnings: number
  managersCreated: number
}

export interface ImportPlan {
  id: string
  status: string
  sheets: ImportSheet[]
}

export interface ImportSummary extends ImportPlan {
  kind: string
  fileName: string
  snapshotDate: string
  userId: string
  userName: string | null
  createdAt: string
  committedAt: string | null
  /** Open question I: how far a batched write got; null for files written in one go. */
  progress: ImportProgress | null
}

export interface ImportProgress {
  done: number
  total: number
  failedBatches: number
  failedRows: number
}

export interface ImportDetail extends ImportSummary {
  errorsTotal: number
  warningsTotal: number
  skippedTotal: number
  canCommit: boolean
}

export interface ImportProblem {
  id: string
  sheet: string
  row: number
  column: string | null
  code: string
  recordKey: string | null
  messageVi: string
  severity: 'error' | 'warning' | 'skipped'
}

export interface Appearance {
  theme: 'light' | 'dark' | 'midnight' | 'soft' | 'contrast' | 'system'
  accent: string
}

export interface Me {
  user: { id: string; email: string; name: string; agentCode?: string }
  tenant: { id: string; gaCode: string; name: string } | null
  roles: Role[]
  permissions: string[]
  reach: 'TENANT' | 'DOWNLINE' | 'OWN' | 'NONE'
  appearance: Appearance
  /** Section 5.2: the parts of the GA settings every screen may need. */
  settings: { leadRules?: { contactDeadlineHours: number; contactedInTimeHours: number } }
  /** USER-16 */
  mfa?: { enabled: boolean; required: boolean; setupRequired: boolean }
}

/** Section 5.2: the GA settings screen (GAD only). */
export interface GaSettings {
  version: number
  gaCode: string
  gaName: string
  profile: { displayName: string; address: string }
  leadRules: { contactDeadlineHours: number; contactedInTimeHours: number; managersMayReassign: boolean; consentForTelesales: boolean }
  notifications: { quietHours: { from: string; to: string } }
  security: { mfaForAll: boolean }
  plan: { name: string; users: number; limits: TenantLimits }
}

/** USER-16: the Platform Admin's switches for every GA. */
export interface PlatformSettings {
  mfaEnforced: boolean
}

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
}

export interface User {
  id: string
  email: string
  name: string
  roles: Role[]
  agentCode?: string
  /** USER-7: null means the code is not on the agent tree yet. */
  agentName?: string | null
  status: UserStatus
  lastLoginAt?: string
  /** USER-9 */
  archivedAt?: string
  archiveReason?: string
  /** USER-16 */
  mfaEnabled?: boolean
  createdAt: string
}

export interface Tenant {
  id: string
  gaCode: string
  name: string
  status: 'active' | 'suspended'
  plan: string
  limits: TenantLimits
  users: number
  lastActivityAt: string | null
  aiTokensThisMonth: number
}

/** Section 5.2: null = no limit. */
export interface TenantLimits {
  maxUsers: number | null
  aiTokensPerMonth: number | null
  storageMb: number | null
}

export interface AuditItem {
  id: string
  action: string
  entity: string
  actor: { kind: 'user'; name: string; email: string } | { kind: 'platform' | 'deleted' | 'system' }
  target: { kind: 'user'; name: string; email: string } | { kind: 'deleted' } | null
  ip?: string
  at: string
}

/** CUS-14: one row of the client list, with its signal labels (SIG-1). */
export type ClientRow = {
  id: string
  name: string
  phone: string | null
  tier: string | null
  ageBand: string | null
  gender: string | null
  /** The policies the client is on, with their roles there. */
  policies: { policyNo: string; roles: PolicyRole[] }[]
  activePolicies: number
  nextDue: string | null
  agents: { agentCode: string; name: string | null }[]
  manual: boolean
} & Record<ListSignal, boolean>

/** SIG-1: the signal tabs of the client list. */
export const LIST_SIGNALS = ['due', 'debt', 'maturity', 'birthday', 'lapsed'] as const
export type ListSignal = (typeof LIST_SIGNALS)[number]
export type ClientCounts = { all: number } & Record<ListSignal, number>

/** COV-2 */
export const COVERAGE_GROUPS = ['LIFE', 'HEALTH', 'CI', 'ACCIDENT', 'MATERNITY', 'OTHER'] as const
export type CoverageGroup = (typeof COVERAGE_GROUPS)[number]
/** FAM-2 */
export const RELATIONS = ['SPOUSE', 'CHILD', 'PARENT', 'SIBLING', 'OTHER'] as const
export type Relation = (typeof RELATIONS)[number]

/** FAM-7: one person in the family tab. */
export interface FamilyMember {
  key: string
  linkId: string | null
  relation: Relation | null
  name: string
  /** The person's client id, when they are a client. */
  clientId: string | null
  isClient: boolean
  canOpen: boolean
  gender: string | null
  dob: string | null
  birth: { day: number | null; month: number | null; year: number | null } | null
  note: string | null
  leadId: string | null
  sharedPolicies: { policyNo: string; roles: PolicyRole[] }[]
}

/** COV-5 */
export interface CoverageRow {
  key: string
  name: string
  clientId: string | null
  groups: Partial<Record<CoverageGroup, number>>
  hasDetail: boolean
  gaps: CoverageGroup[]
}

/** Section 10.11 */
export interface ClientSignal {
  code: 'PREMIUM_DUE' | 'UNPAID' | 'APL' | 'MATURITY' | 'NOT_ACTIVE' | 'LAPSED' | 'BIRTHDAY' | 'GAP' | 'FAMILY_UNCOVERED' | 'NO_DCONNECT'
  values: Record<string, string | number>
}

/** IMP-21 + section 18.5: one field of the client or of a policy, changed by a file or by hand. */
export interface ClientChange {
  id: string
  entity: 'client' | 'policy' | 'policy_product'
  /** The client id, the policy number, or "policyNo/productCode/insuredClientId". */
  entityKey: string
  field: string
  oldValue: string | null
  newValue: string | null
  importId: string | null
  fileName: string | null
  changedBy: string
  changedAt: string
}

export interface ClientNote {
  id: string
  type: string
  note: string
  outcome: string | null
  occurredAt: string
  createdBy: string
}

/** CUS-11: a person's role on a policy. */
export type PolicyRole = 'PO' | 'LI' | 'BEN'

export interface ClientPolicy {
  policyNo: string
  /** Null for a policy known only by its number. */
  status: string | null
  active: boolean
  roles: PolicyRole[]
  /** Everyone on the policy; clientId is null when the viewer may not open that person, self marks the client on screen. */
  people: { clientId: string | null; name: string; roles: PolicyRole[]; self: boolean }[]
  holderClientId: string | null
  holderName: string | null
  insuredClientId: string | null
  insuredName: string | null
  effectiveDate: string | null
  maturityDate: string | null
  premiumFrequency: string | null
  premiumDueDate: string | null
  plannedPremiumVnd: number | null
  basePremiumVnd: number | null
  unpaidPremiumVnd: number | null
  aplDebtVnd: number | null
  hasBeneficiary: boolean | null
  /** The address itself comes only from the audited reveal (decided 25/11/2026). */
  hasContactAddress: boolean
  /** The main product line's sum assured; the page falls back to `sumAssuredVnd`. */
  mainSumAssuredVnd: number | null
  sumAssuredVnd: number | null
  graceEndDate: string | null
  assignmentType: string | null
  assignmentDate: string | null
  advancePremiumVnd: number | null
  totalPaidPremiumVnd: number | null
  basicPremiumVnd: number | null
  topUpPremiumVnd: number | null
  servicingAgentCode: string | null
  agents: { agentCode: string; name: string | null; splitPercent: number | null; isServicing: boolean }[]
  products: {
    productCode: string
    productName: string | null
    /** TENANT-5: the catalogue's name when the code is in it; the product page exists then. */
    catalogueName: string | null
    productRole: string
    insuredClientId: string | null
    insuredName: string | null
    sumAssuredVnd: number | null
    annualPremiumVnd: number | null
    plan: string | null
    startDate: string | null
    status: string | null
    termYears: number | null
    /** COV-3 */
    group: CoverageGroup
  }[]
  manual: boolean
  /** POL-7: entered by hand, untouched by imports, at most 7 days old, and this person may edit the client. */
  canDelete: boolean
}

/** Decided 26/11/2026: what a GA records about caring for a client. */
export const CARE_RECORD_KINDS = ['CLAIM', 'SEMINAR', 'HEALTH_CHECK', 'GIFT', 'VISIT', 'SIGNING_CASH', 'SIGNING_GIFT'] as const
export type CareRecordKind = (typeof CARE_RECORD_KINDS)[number]

export interface CareRecord {
  id: string
  kind: CareRecordKind
  occurredOn: string
  /** What: the event's or the gift's name. */
  title: string | null
  /** Where: the hospital of a claim, the venue of an event. */
  place: string | null
  amountVnd: number | null
  policyNo: string | null
  note: string | null
}

export const REFERRAL_RELATIONS = ['FAMILY', 'FRIEND', 'COLLEAGUE', 'NEIGHBOR', 'OTHER'] as const
export type ReferralRelation = (typeof REFERRAL_RELATIONS)[number]
export const REFERRAL_RESULTS = ['PENDING', 'SUCCESS', 'FAILED'] as const
export type ReferralResult = (typeof REFERRAL_RESULTS)[number]

export interface ClientReferral {
  id: string
  personName: string
  relation: ReferralRelation
  referredOn: string
  result: ReferralResult
  /** The premium of the policy a successful referral brought. */
  premiumVnd: number | null
  note: string | null
}

/** CUS-15: the client page. */
export interface ClientDetail {
  client: {
    id: string
    name: string
    phone: string | null
    tier: string | null
    activePolicies: number | null
    lapsedPolicies: number | null
    dob: string | null
    gender: string | null
    maritalStatus: string | null
    loyaltyPoints: number | null
    usesDconnect: boolean | null
    dconnectLastLoginAt: string | null
    idUpdated: boolean | null
    ekycRegistered: boolean | null
    ekycRegisteredAt: string | null
    birthDayMonth: string | null
    ageBand: string | null
    manual: boolean
    agents: { agentCode: string; name: string | null }[]
  }
  policies: ClientPolicy[]
  applications: {
    applicationNo: string
    policyNo: string | null
    agentCode: string
    agentName: string | null
    createdDate: string
    receivedDate: string | null
    issuedDate: string | null
    status: string
    productCode: string | null
    /** The catalogue's name for productCode. */
    productName: string | null
    apeVnd: number | null
  }[]
  clientNames: Record<string, string>
  canEdit: boolean
  /** Decided 26/11/2026: care entered by hand, newest first, and what the client received on signing. */
  careRecords: CareRecord[]
  signingSummary: { cashVnd: number; gifts: number; giftValueVnd: number }
  /** The people this client referred, and how many became policies. */
  referrals: ClientReferral[]
  referralSummary: { total: number; success: number; pending: number; failed: number; premiumVnd: number }
  family: FamilyMember[]
  coverage: CoverageRow[]
  signals: ClientSignal[]
  notes: ClientNote[]
  /** CMT-5 */
  comments: ThreadComment[]
  /** LEAD-34: the lead the client came from. */
  linkedLead: {
    id: string
    fullName: string
    stage: string
    source: string
    campaignName: string | null
    assignedAgentCode: string | null
    agentName: string | null
    linkedAt: string | null
    canOpen: boolean
  } | null
  /** CUS-15 "Lịch sử", newest first, at most 200. */
  history: ClientChange[]
  userNames: Record<string, string>
}

/** CUS-2 */
export const CLIENT_TIERS = ['Thân thiết', 'Bạc', 'Vàng', 'Kim Cương'] as const

/** PRD-6 */
export const PRODUCT_ROLES = ['Chính', 'Bổ trợ'] as const
/** MAN-2 */
export const GENDERS = ['Nam', 'Nữ'] as const
export const MARITAL_STATUSES = ['Độc thân', 'Đã kết hôn', 'Ly hôn'] as const
export const AGE_BANDS = ['<18', '18-29', '30-39', '40-49', '50-59', '60+'] as const
export const PREMIUM_FREQUENCIES = ['Năm', 'Nửa năm', 'Quý', 'Tháng'] as const

/** TENANT-5: a product of the shared catalogue, as everyone in a GA sees it. */
export interface ProductView {
  productCode: string
  productName: string
  productRole: string
  /** The benefit group text, e.g. "Sức khỏe". */
  category: string | null
  minEntryAge: number | null
  maxEntryAge: number | null
  maxCoverAge: number | null
  gender: string | null
  waitingPeriod: string | null
  keyBenefits: string | null
  active: boolean
}

export const RULE_STATUSES = ['DRAFT', 'APPROVED'] as const
export type RuleStatus = (typeof RULE_STATUSES)[number]

/** TENANT-5: the Platform Admin sees every column. */
export interface Product extends ProductView {
  fitRule: string | null
  triggerEvent: string | null
  ruleStatus: RuleStatus
  nameNorm: string
  createdAt: string
  updatedAt: string
  updatedBy: string | null
}

/** One row of the 11_Products file, also what the add / edit form sends. Blank means null. */
export interface ProductRow {
  productCode: string
  productName: string
  productRole: string
  category: string | null
  minEntryAge: number | null
  maxEntryAge: number | null
  maxCoverAge: number | null
  gender: string | null
  waitingPeriod: string | null
  keyBenefits: string | null
  fitRule: string | null
  triggerEvent: string | null
  ruleStatus?: RuleStatus
}

/** A policy in the viewer's scope that carries a product, with that product's lines. */
export interface ProductPolicy {
  policyNo: string
  status: string | null
  active: boolean
  effectiveDate: string | null
  people: { clientId: string | null; name: string; roles: PolicyRole[] }[]
  lines: { insuredName: string | null; sumAssuredVnd: number | null; annualPremiumVnd: number | null }[]
}

/** `policies` is null for Admin, who has no client book (CUS-5). */
export interface ProductDetail {
  product: ProductView
  policies: ProductPolicy[] | null
}

/** CMP-1 */
export const CAMPAIGN_TYPES = ['ADS', 'SEMINAR', 'TELESALES', 'REFERRAL', 'SOCIAL_ZALO', 'EVENT', 'OTHER'] as const
export type CampaignType = (typeof CAMPAIGN_TYPES)[number]
export const CAMPAIGN_STATUSES = ['PLANNED', 'ACTIVE', 'ENDED'] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]
/** CMP-2 */
export const MEMBER_STATUSES = ['INVITED', 'REGISTERED', 'ATTENDED', 'NO_SHOW'] as const
export type MemberStatus = (typeof MEMBER_STATUSES)[number]

/** CMP-1. Budget is null for someone who neither manages campaigns nor sees every lead. */
export interface Campaign {
  id: string
  name: string
  type: CampaignType
  status: CampaignStatus
  channel: string | null
  startDate: string | null
  endDate: string | null
  budgetVnd: number | null
  ownerUserId: string | null
  ownerName: string | null
  notes: string | null
  eventAt: string | null
  location: string | null
}

export interface CampaignRow extends Campaign {
  leads: number
  won: number
  costPerLeadVnd: number | null
}

/** CMP-3 + CMP-2 */
export interface CampaignDetail {
  campaign: Campaign
  stats: {
    leads: number
    byStage: Record<string, number>
    byInterest: Record<string, number>
    byCareStatus: Record<string, number>
    linkedClients: number
    issued: number
    issuedApeVnd: number
    perLeadVnd: number | null
    perIssuedVnd: number | null
  }
  members: { leadId: string; fullName: string; assignedAgentCode: string | null; stage: string; status: MemberStatus; updatedAt: string; canUpdate: boolean }[]
  canManage: boolean
  /** CMP-4: only for campaigns.manage */
  publicForm: PublicFormSettings | null
}

export type PublicFormField = 'email' | 'province' | 'need'

export interface PublicFormSettings {
  slug: string
  enabled: boolean
  fields: PublicFormField[]
  consentText: string
  privacyNotice: string
  updatedAt: string
}

/** Section 17.9 GET /public/forms/{slug} */
export interface PublicFormDefinition {
  gaName: string
  campaignName: string
  fields: PublicFormField[]
  consentText: string
  privacyNotice: string
  turnstileSiteKey: string | null
}

/** Slice 6a: the reports on screen so far. */
export const REPORTS = ['conversion', 'activities', 'funnel', 'pipeline', 'care', 'handovers'] as const
/** R3: what the funnel rows are. */
export const FUNNEL_GROUPS = ['source', 'campaign', 'phoneSource'] as const
export type FunnelGroup = (typeof FUNNEL_GROUPS)[number]
/** R5: the stages still in the pipeline. */
export const PIPELINE_STAGES = ['NEW', 'CONTACTED', 'APPOINTMENT', 'MET', 'PROPOSAL', 'SUBMITTED'] as const
export type ReportName = (typeof REPORTS)[number]

/** RPT-1: one row of a report in the agent-tree layout. Values add up within groups. */
export interface ReportRow {
  key: string
  /** `item`: a row not laid out by agent, such as a source in the funnel (R3). */
  kind: 'group' | 'agent' | 'unassigned' | 'item'
  agentCode: string | null
  name: string | null
  groupKind: 'BRANCH' | 'DEPARTMENT' | 'TEAM' | null
  depth: number
  parentKey: string | null
  values: Record<string, number>
}

export interface ReportData {
  /** Absent for the pipeline, which is a snapshot (R5). */
  from?: string
  to?: string
  rows: ReportRow[]
  total: Record<string, number>
  /** R1 only: a column per interest of the GA's catalogue (OPT-11). */
  interests?: { code: string; label: string; isOpportunity: boolean }[]
  /** R2 only (26/11/2026): the latest Success activity day and when a file last brought activities. */
  successAsOf?: { lastActivityDate: string | null; lastImportedAt: string | null }
}

/** R2 (26/11/2026): one activity behind a number, and whether it counts. */
export interface ActivityDetail {
  day: string
  at: string
  type: string
  source: 'CRM' | 'SUCCESS'
  agentCode: string
  agentName: string | null
  counted: boolean
  /** Why it does not count: the same person that day, or a Success draft / rejected row. */
  excluded: 'duplicate' | 'status' | null
  /** The contact's id in the CRM, or the activity's id on Success. */
  ref: string
  status: string | null
  leadId: string | null
  clientId: string | null
  person: string | null
  text: string | null
  location: string | null
}

export interface ActivityDetails {
  from: string
  to: string
  total: number
  counted: number
  items: ActivityDetail[]
  truncated: boolean
}

/** TASK-1: a task of a lead, of a client, or of the person alone. */
export interface TaskItem {
  id: string
  kind: 'lead' | 'client' | 'personal'
  title: string
  dueAt: string
  status: 'OPEN' | 'DONE' | 'CANCELLED'
  source: string
  signal: string | null
  lead: { id: string; fullName: string } | null
  client: { id: string; name: string } | null
  agentCode: string | null
  agentName: string | null
  doneAt: string | null
  canEdit: boolean
}

/** TASK-5 + section 16.2 */
export interface TodayData {
  today: string
  tasks: { overdue: TaskItem[]; today: TaskItem[] }
  leads: LeadCounts
  care: {
    premiumDue: { clientId: string; name: string; policyNo: string; date: string; amountVnd: number }[]
    birthdays: { clientId: string; name: string; date: string; isToday: boolean }[]
  }
  isManager: boolean
  manages: boolean
  newLeadsToday: number | null
  uploads: { agentCode: string; name: string; lastUploadAt: string | null; stale: boolean }[] | null
}

/** TASK-6 */
export interface CalendarData {
  tasks: TaskItem[]
  appointments: { leadId: string; fullName: string; at: string }[]
}

/** Chapter 15: one in-app notification. `subject` is the lead, client, task or user it names. */
export interface NotificationItem {
  id: string
  type: string
  data: Record<string, string | number>
  subject: string | null
  link: string
  read: boolean
  createdAt: string
}

export interface NotificationPage extends Page<NotificationItem> {
  unread: number
}

/** NTF-3 */
export interface NotificationPref {
  type: string
  inApp: boolean
}

/** CMT-1 + CMT-5: one comment on a lead or a client, with the users it mentions. */
export interface ThreadComment {
  id: string
  body: string
  authorUserId: string
  mentions: string[]
  createdAt: string
}

/** CMT-5: someone who may be mentioned. */
export interface MentionCandidate {
  id: string
  name: string
  agentCode: string | null
}

/** Section 14.3-14.4: a provider and one of its models. */
export interface AiModelRef {
  provider: string
  model: string
}

export type AiTier = 'FAST' | 'BALANCED' | 'DEEP'

/** Section 17.13 GET /ai/admin/settings */
export interface AiSettings {
  enabled: boolean
  tiers: Record<AiTier, AiModelRef>
  router: AiModelRef
  monthlyTokenLimit: number
  /** Section 5.2: the plan's cap; null = none */
  planTokenLimit: number | null
  usedThisMonth: number
  updatedAt: string | null
  providers: {
    provider: string
    label: string
    ready: boolean
    keySource: 'GA' | 'PLATFORM' | null
    last4: string | null
    keyUpdatedAt: string | null
    keyUnreadable: boolean
    suggested: Record<AiTier, string>
  }[]
}

/** LEAD-40: a lead in the bin. */
export interface DeletedLead {
  id: string
  fullName: string
  phone: string | null
  assignedAgentCode: string | null
  stage: LeadStage
  deletedAt: string
  deletedBy: string | null
  reason: string | null
  mergedInto: string | null
  restorableUntil: string
}

/** Section 16 kanban + LEAD-19 */
export interface LeadBoard {
  columns: { stage: LeadStage; total: number; items: (LeadRow & { canWork: boolean })[] }[]
}

/** LEAD-38 */
export interface SavedFilter {
  id: string
  name: string
  query: Record<string, string>
}

/** GET /dev/accounts: an account the switcher for testing can sign in as. */
export interface DevAccount {
  id: string
  email: string
  name: string
  roles: string[]
  status: string
  agentCode: string | null
  tenantId: string | null
  gaCode: string | null
  gaName: string | null
  tenantStatus: string | null
}

/** Realtime slice C1: who in the GA is online now (user ids). */
export interface Presence {
  online: string[]
  idle: string[]
  /** K5: user id → epoch ms when their current online stretch began. */
  since: Record<string, number>
  /** User id → epoch ms last active, for people this tab saw go offline. */
  lastSeen?: Record<string, number>
}

/** GET /presence/activity: daily, weekly and monthly active users over Vietnam days. */
export interface ActivitySummary {
  live: boolean
  activeAccounts: number
  dau: number
  wau: number
  mau: number
  series: { day: string; active: number }[]
}

/** C2, C3: chat inside a GA. */
export type ChatKind = 'DIRECT' | 'GROUP'
export type ChatRole = 'OWNER' | 'ADMIN' | 'MEMBER'

export interface ChatMessage {
  conversationId: string
  seq: number
  id: string
  senderId: string | null
  senderName: string | null
  kind: 'TEXT' | 'SYSTEM'
  /** Null once recalled. */
  body: string | null
  data: Record<string, unknown>
  mentions: string[]
  editedAt: string | null
  deletedAt: string | null
  createdAt: string
}

export interface ChatMessagePage {
  items: ChatMessage[]
  hasMore: boolean
}

export interface ChatConversationItem {
  id: string
  kind: ChatKind
  title: string | null
  other: { id: string; name: string; active: boolean } | null
  memberCount: number
  role: ChatRole
  muted: boolean
  pinned: boolean
  lastSeq: number
  unread: number
  lastMessage: {
    seq: number
    kind: 'TEXT' | 'SYSTEM'
    body: string | null
    data: Record<string, unknown> | null
    senderId: string | null
    senderName: string | null
    deleted: boolean
    createdAt: string
  } | null
  updatedAt: string
}

export interface ChatMember {
  id: string
  name: string
  role: ChatRole
  lastReadSeq: number
  active: boolean
}

export interface ChatConversation {
  id: string
  kind: ChatKind
  title: string | null
  role: ChatRole
  lastSeq: number
  members: ChatMember[]
}

export interface ChatPerson {
  id: string
  name: string
  email: string
  agentCode: string | null
}

export interface ChatReviewItem {
  id: string
  kind: ChatKind
  title: string | null
  memberNames: string[]
  messages: number
  lastMessageAt: string | null
}

/** C4 (K8): a file sent in chat; its metadata travels in the message's `data.files`. */
export interface ChatFile {
  id: string
  name: string
  size: number
  contentType: string
  kind: 'IMAGE' | 'FILE'
}

export interface ChatSearchHit {
  conversationId: string
  conversationTitle: string | null
  kind: ChatKind
  seq: number
  body: string
  senderName: string | null
  createdAt: string
}

/** Open question 12e: work still in the name of people who have left. */
export interface DepartedWork {
  items: { agentCode: string; name: string | null; status: 'DISABLED' | 'ARCHIVED' | 'STOPPED'; openLeads: number; clients: number }[]
  openLeads: number
  clients: number
}

/** GET /reports/dashboard: the home charts, over the person's report scope (RPT-3). */
export type DashboardScope = 'TENANT' | 'LINE' | 'OWN'
export interface DashboardTotals {
  openLeads: number
  pipelineValueVnd: number
  newLeads: number
  contacted: number
  won: number
}
export type Dashboard =
  | { available: false }
  | {
      available: true
      scope: DashboardScope
      days: number
      from: string
      to: string
      totals: DashboardTotals
      /** The period just before, of the same length; open figures as at its end. */
      previous: DashboardTotals
      pipeline: { stage: string; count: number; valueVnd: number }[]
      /** `open` and `valueVnd` are as at the end of the day. */
      daily: { day: string; created: number; contacted: number; won: number; open: number; valueVnd: number }[]
      sources: { code: string | null; label: string | null; count: number; won: number }[]
      /** Null for a FC alone: nothing to compare. */
      agents: { agentCode: string | null; name: string | null; open: number; contacted: number }[] | null
    }
