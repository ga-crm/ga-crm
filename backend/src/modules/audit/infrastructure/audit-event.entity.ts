import { Column, Entity, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

/** AUD-2 */
export enum AuditAction {
  Login = 'LOGIN',
  Logout = 'LOGOUT',
  LoginFailed = 'LOGIN_FAILED',
  Create = 'CREATE',
  Update = 'UPDATE',
  Delete = 'DELETE',
  /** AUD-2, USER-15 */
  Archive = 'ARCHIVE',
  /** CUS-9 */
  ViewClient = 'VIEW_CLIENT',
  CrossTenantRead = 'CROSS_TENANT_READ',
  PermissionChange = 'PERMISSION_CHANGE',
  Import = 'IMPORT',
  /** RPT-6 */
  Export = 'EXPORT',
  Assign = 'ASSIGN',
  /** Section 5.2 */
  SettingsChange = 'SETTINGS_CHANGE',
  /** AUD-2 + LEAD-32 */
  Link = 'LINK',
  Unlink = 'UNLINK',
  /** K3: the GA head read someone else's conversation */
  ChatRead = 'CHAT_READ',
}

/**
 * AUD-1..AUD-5. Insert-only for the API roles (section 22.4). Each event carries the hash of the
 * previous one of its tenant; open question H may move the hashing to a worker.
 */
@Entity('audit_events')
export class AuditEvent {
  @PrimaryGeneratedColumn('identity', {
    type: 'bigint',
    generatedIdentity: 'ALWAYS',
  })
  id: string;

  /** null = a platform event */
  @Column({ type: 'uuid', nullable: true })
  tenantId: string | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'text' })
  action: AuditAction;

  @Column({ type: 'text' })
  entity: string;

  @Column({ type: 'text', nullable: true })
  entityId: string | null;

  /** AUD-4: never holds secrets. */
  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  ip: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  at: Date;

  @Column({ type: 'text', nullable: true })
  prevHash: string | null;

  @Column({ type: 'text' })
  hash: string;
}

/** Head of a tenant's hash chain; the row stays locked until the transaction ends. */
@Entity('audit_chains')
export class AuditChain {
  @PrimaryColumn({ type: 'text' })
  id: string;

  @Column({ type: 'text', nullable: true })
  lastHash: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  touchedAt: Date;
}
