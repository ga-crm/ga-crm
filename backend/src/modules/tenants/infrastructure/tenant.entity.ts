import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum TenantStatus {
  Active = 'active',
  Suspended = 'suspended',
}

/** Section 5.2: users (not archived), AI tokens a month, storage in MB. null = no limit. */
export interface TenantLimits {
  maxUsers: number | null;
  aiTokensPerMonth: number | null;
  storageMb: number | null;
}

export const NO_LIMITS: TenantLimits = {
  maxUsers: null,
  aiTokensPerMonth: null,
  storageMb: null,
};

export const limitsOf = (tenant: TenantLimits): TenantLimits => ({
  maxUsers: tenant.maxUsers,
  aiTokensPerMonth: tenant.aiTokensPerMonth,
  storageMb: tenant.storageMb,
});

/** TENANT-1 */
@Entity('tenants')
export class Tenant {
  @PrimaryColumn({ type: 'uuid', default: () => 'uuidv7()' })
  id: string;

  @Column({ type: 'text' })
  gaCode: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', default: TenantStatus.Active })
  status: TenantStatus;

  @Column({ type: 'text', default: 'standard' })
  plan: string;

  @Column({ type: 'integer', nullable: true })
  maxUsers: number | null;

  @Column({ type: 'integer', nullable: true })
  aiTokensPerMonth: number | null;

  @Column({ type: 'integer', nullable: true })
  storageMb: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
