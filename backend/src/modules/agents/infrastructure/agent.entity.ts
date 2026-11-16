import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/** AGT-1 */
export const AGENT_RANKS = ['SUM', 'BM', 'UM', 'SA', 'FC'] as const;
export type AgentRank = (typeof AGENT_RANKS)[number];

export const AGENT_STATUSES = ['Đang hoạt động', 'Ngưng hoạt động'] as const;
export type AgentStatus = (typeof AGENT_STATUSES)[number];

/** Section 18.3. Calendar dates are `YYYY-MM-DD` strings (DATA-2); the code keeps leading zeros (DATA-1). */
@Entity('agents')
export class Agent {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ type: 'text' })
  agentCode: string;

  @Column({ type: 'text' })
  name: string;

  /** DATA-5 */
  @Column({ type: 'text' })
  nameNorm: string;

  @Column({ type: 'text' })
  rank: AgentRank;

  @Column({ type: 'text', nullable: true })
  managerCode: string | null;

  /** AGT-3: root to direct manager. */
  @Column({ type: 'text', array: true, default: () => `'{}'` })
  ancestors: string[];

  @Column({ type: 'integer', default: 0 })
  depth: number;

  @Column({ type: 'text' })
  status: AgentStatus;

  @Column({ type: 'text', nullable: true })
  gender: string | null;

  @Column({ type: 'date', nullable: true })
  dob: string | null;

  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @Column({ type: 'date', nullable: true })
  startDate: string | null;

  @Column({ type: 'date', nullable: true })
  endDate: string | null;

  @Column({ type: 'text', nullable: true })
  officeCode: string | null;

  /** AGT-5 */
  @Column({ type: 'boolean', default: false })
  managerFixed: boolean;

  @Column({ type: 'uuid', nullable: true })
  updatedByImportId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
