import {
  Campaign,
  CampaignMember,
  Comment,
  Interaction,
  Lead,
  LeadHistory,
  LeadOption,
  SavedFilter,
  Task,
} from '../../modules/leads/infrastructure/lead.entities.js';
import {
  Notification,
  NoticeKey,
} from '../../modules/notifications/infrastructure/notification.entities.js';
import {
  Application,
  Client,
  FamilyLink,
  InsuranceProgram,
  Policy,
  RecordChange,
} from '../../modules/clients/infrastructure/client.entities.js';
import {
  Import,
  ImportError,
  ImportRow,
  SuccessActivity,
} from '../../modules/imports/infrastructure/import.entities.js';
import { Agent } from '../../modules/agents/infrastructure/agent.entity.js';
import {
  AuditChain,
  AuditEvent,
} from '../../modules/audit/infrastructure/audit-event.entity.js';
import {
  Invitation,
  LoginAttempt,
  PasswordReset,
  Session,
} from '../../modules/auth/infrastructure/auth.entities.js';
import { TenantSettings } from '../../modules/tenants/infrastructure/tenant-settings.entity.js';
import { Tenant } from '../../modules/tenants/infrastructure/tenant.entity.js';
import { User } from '../../modules/users/infrastructure/user.entity.js';
import { IdempotencyKey } from '../persistence/idempotency-key.entity.js';
import { OutboxMessage } from '../persistence/outbox-message.entity.js';

/** Every entity, listed rather than globbed. A module adds its own here when it moves over. */
export const ENTITIES = [
  Tenant,
  TenantSettings,
  User,
  Session,
  Invitation,
  PasswordReset,
  LoginAttempt,
  Agent,
  AuditEvent,
  AuditChain,
  Campaign,
  CampaignMember,
  LeadOption,
  Lead,
  LeadHistory,
  Interaction,
  Comment,
  Task,
  SavedFilter,
  Notification,
  NoticeKey,
  Client,
  Policy,
  Application,
  FamilyLink,
  InsuranceProgram,
  RecordChange,
  Import,
  ImportError,
  ImportRow,
  SuccessActivity,
  OutboxMessage,
  IdempotencyKey,
];
