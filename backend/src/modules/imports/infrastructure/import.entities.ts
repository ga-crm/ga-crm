import { Column, Entity, PrimaryColumn } from 'typeorm';

/** IMP-2 */
export enum ImportStatus {
  Parsing = 'PARSING',
  Validated = 'VALIDATED',
  /** Open question I: a large file being written batch by batch in the background. */
  Committing = 'COMMITTING',
  Committed = 'COMMITTED',
  Failed = 'FAILED',
}

/** Open question I: batches written so far, and the rows of batches that could not be saved. */
export interface ImportProgress {
  done: number;
  total: number;
  failedBatches: number;
  failedRows: number;
}

export const IMPORT_KINDS = ['SUCCESS', 'LEADS'] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export type SheetStatus = 'READY' | 'BLOCKED' | 'LATER' | 'IGNORED';

/** One sheet of a file: its plan, then its counts. */
export interface ImportSheet {
  name: string;
  status: SheetStatus;
  reason?: string;
  /** The template fields sent for this sheet, and the file column each one was read from. */
  fields: string[];
  present: number[];
  missingRequired: string[];
  banned: string[];
  found: number;
  inserted: number;
  updated: number;
  rejected: number;
  skipped: number;
  warnings: number;
  managersCreated: number;
}

const id = () => PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' });
const text = () => Column({ type: 'text', nullable: true });

/** Section 18.6. No original file is kept until object storage exists. */
@Entity('imports')
export class Import {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'uuid' }) userId: string;
  @text() agentCode: string | null;
  @Column({ type: 'text' }) kind: ImportKind;
  @Column({ type: 'text' }) fileName: string;
  @Column({ type: 'date' }) snapshotDate: string;
  @Column({ type: 'text' }) status: ImportStatus;
  @Column({ type: 'jsonb', default: () => `'[]'` }) sheets: ImportSheet[];
  /** IMP-24 */
  @Column({ type: 'jsonb', default: () => `'[]'` }) agentMapping: {
    value: string;
    agentCode: string | null;
  }[];
  @Column({ type: 'timestamptz', nullable: true }) committedAt: Date | null;
  /** Open question I: how far a batched write got; null for files written in one go. */
  @Column({ type: 'jsonb', nullable: true }) progress: ImportProgress | null;
  @Column({ type: 'timestamptz', default: () => 'now()' }) createdAt: Date;
  @Column({ type: 'timestamptz', default: () => 'now()' }) updatedAt: Date;
}

/** IMP-10. Row 1 means the problem is with the sheet or its header. */
@Entity('import_errors')
export class ImportError {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'uuid' }) importId: string;
  @Column({ type: 'text' }) sheet: string;
  @Column({ type: 'integer' }) row: number;
  @text() column: string | null;
  @Column({ type: 'text' }) code: string;
  @text() recordKey: string | null;
  @Column({ type: 'text' }) messageVi: string;
  @Column({ type: 'text' }) severity: 'error' | 'warning' | 'skipped';
  @Column({ type: 'boolean', default: false }) crossRow: boolean;
}

/** Section 18.6: staging. */
@Entity('import_rows')
export class ImportRow {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'uuid' }) importId: string;
  @Column({ type: 'text' }) sheet: string;
  @Column({ type: 'integer' }) rowNo: number;
  @Column({ type: 'text' }) key: string;
  @Column({ type: 'jsonb' }) data: Record<string, unknown>;
  @Column({ type: 'timestamptz', default: () => 'now()' }) createdAt: Date;
}

/** IMP-31 + section 18.9 (SuccessActivityType), in the order of `activity_type_id` 1-7. */
export const SUCCESS_ACTIVITY_TYPES = [
  'CHECKIN',
  'CALL',
  'SOCIAL_POST',
  'MEETING',
  'COACHING',
  'OTHER',
  'PROPOSAL',
] as const;
export type SuccessActivityType = (typeof SUCCESS_ACTIVITY_TYPES)[number];

/** IMP-31 */
export const SUCCESS_ACTIVITY_STATUSES = [
  'draft',
  'submitted',
  'approved',
  'returned',
  'rejected',
  'locked',
] as const;

/** Section 18.5 + 19.6: one row of 07_Activities, keyed by the Success activity id. */
@Entity('success_activities')
export class SuccessActivity {
  @id() id: string;
  @Column({ type: 'uuid' }) tenantId: string;
  @Column({ type: 'text' }) activityId: string;
  @Column({ type: 'text' }) agentCode: string;
  @text() leaderCode: string | null;
  @text() officeCode: string | null;
  @text() programCode: string | null;
  @Column({ type: 'integer', nullable: true }) programMonth: number | null;
  @Column({ type: 'text' }) activityType: SuccessActivityType;
  @text() subActivityTitle: string | null;
  @text() recordMode: string | null;
  @Column({ type: 'timestamptz' }) startedAt: Date;
  @Column({ type: 'timestamptz', nullable: true }) endedAt: Date | null;
  @Column({ type: 'integer', nullable: true }) durationSeconds: number | null;
  @Column({ type: 'text' }) status: string;
  @text() customerId: string | null;
  @text() customerName: string | null;
  @text() customerPhone: string | null;
  @text() activityMethod: string | null;
  @text() callType: string | null;
  @text() callOutcome: string | null;
  @text() callPhoneHash: string | null;
  @text() contentNote: string | null;
  @text() locationName: string | null;
  /** IMP-32 */
  @Column({ type: 'date' }) activityDate: string;
  @text() phoneKey: string | null;
  @Column({ type: 'uuid', nullable: true }) lastImportId: string | null;
  @Column({ type: 'timestamptz', nullable: true }) lastSeenAt: Date | null;
}
