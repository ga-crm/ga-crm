import type { INestApplication } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module.js';
import { DEFAULT_GRANTS } from '../src/common/rbac.js';
import { configureApp } from '../src/configure-app.js';
import { PlatformDb } from '../src/core/tenancy/platform-db.js';
import { scopeOf } from '../src/core/tenancy/scope.js';
import { TenantDb } from '../src/core/tenancy/tenant-db.js';
import {
  AuditAction,
  AuditEvent,
} from '../src/modules/audit/infrastructure/audit-event.entity.js';
import { TenantSettings } from '../src/modules/tenants/infrastructure/tenant-settings.entity.js';
import { Tenant } from '../src/modules/tenants/infrastructure/tenant.entity.js';
import {
  User,
  UserStatus,
} from '../src/modules/users/infrastructure/user.entity.js';
import { OutboxMessage } from '../src/core/persistence/outbox-message.entity.js';
import { enqueue } from '../src/core/persistence/outbox.js';
import { resetTestDatabase } from './support/database.js';

/** PostgreSQL error codes */
const INSUFFICIENT_PRIVILEGE = '42501';
const UNIQUE_VIOLATION = '23505';
const CHECK_VIOLATION = '23514';
const codeOf = (error: unknown) =>
  (error as { driverError?: { code?: string } }).driverError?.code;

/** TEN-1..TEN-7 enforced by the database itself, below any service code. */
describe('Tenancy in PostgreSQL (integration)', () => {
  let app: INestApplication;
  let tenantDb: TenantDb;
  let platformDb: PlatformDb;
  let ga1: Tenant;
  let ga2: Tenant;
  let ga2User: User;

  const tenant = (gaCode: string) =>
    platformDb.run('platform-console', async (db) => {
      const row = await db
        .getRepository(Tenant)
        .save({ gaCode, name: `GA ${gaCode}` });
      await db.getRepository(TenantSettings).insert({
        tenantId: row.id,
        grants: DEFAULT_GRANTS,
        leadRules: {},
        notifications: {},
      });
      return row;
    });

  beforeAll(async () => {
    await resetTestDatabase();
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app);
    await app.init();
    tenantDb = app.get(TenantDb);
    platformDb = app.get(PlatformDb);

    ga1 = await tenant('GA1');
    ga2 = await tenant('GA2');
    await tenantDb.run(scopeOf(ga1.id), (db) =>
      db.getRepository(User).insert({
        tenantId: ga1.id,
        email: 'fc@ga1.test',
        name: 'FC một',
        roles: ['FC'],
        agentCode: '000123',
      }),
    );
    ga2User = await tenantDb.run(scopeOf(ga2.id), (db) =>
      db.getRepository(User).save({
        tenantId: ga2.id,
        email: 'fc@ga2.test',
        name: 'FC hai',
        roles: ['FC'],
        agentCode: '000123',
      }),
    );
    await platformDb.run('platform-console', (db) =>
      db.getRepository(User).insert({
        tenantId: null,
        email: 'platform@test',
        name: 'Platform',
        roles: ['PLATFORM_ADMIN'],
      }),
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  it('health reports PostgreSQL up', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200, { status: 'ok', postgres: 'up' });
  });

  it("TEN-7: GA-1 sees only its own users; GA-2's user does not exist for it", async () => {
    const seen = await tenantDb.run(scopeOf(ga1.id), (db) =>
      db.getRepository(User).find({ order: { email: 'ASC' } }),
    );
    expect(seen.map((user) => user.email)).toEqual(['fc@ga1.test']);
    // DATA-1: the leading zeros survive
    expect(seen[0].agentCode).toBe('000123');
    const other = await tenantDb.run(scopeOf(ga1.id), (db) =>
      db.getRepository(User).findOneBy({ id: ga2User.id }),
    );
    expect(other).toBeNull();
  });

  it("TEN-7: GA-1 cannot read GA-2's tenant row or settings", async () => {
    const [tenants, settings] = await tenantDb.run(scopeOf(ga1.id), (db) =>
      Promise.all([
        db.getRepository(Tenant).find(),
        db.getRepository(TenantSettings).find(),
      ]),
    );
    expect(tenants.map((row) => row.gaCode)).toEqual(['GA1']);
    expect(settings.map((row) => row.tenantId)).toEqual([ga1.id]);
  });

  it('TEN-3: GA-1 can neither change nor create rows of GA-2', async () => {
    const changed = await tenantDb.run(scopeOf(ga1.id), (db) =>
      db.getRepository(User).update({ id: ga2User.id }, { name: 'Đổi trộm' }),
    );
    expect(changed.affected).toBe(0);
    const planted = tenantDb.run(scopeOf(ga1.id), (db) =>
      db.getRepository(User).insert({
        tenantId: ga2.id,
        email: 'planted@ga2.test',
        name: 'Cài vào',
        roles: ['FC'],
      }),
    );
    await expect(planted).rejects.toSatisfy(
      (error) => codeOf(error) === INSUFFICIENT_PRIVILEGE,
    );
  });

  it('TEN-1: a query that never pinned a tenant fails instead of returning rows', async () => {
    const raw = app.get<DataSource>(getDataSourceToken());
    await expect(raw.getRepository(User).find()).rejects.toThrow();
    // Not even after the pooled connection served a pinned transaction before
    await tenantDb.run(scopeOf(ga1.id), (db) => db.getRepository(User).count());
    await expect(raw.getRepository(User).find()).rejects.toThrow();
  });

  it('TEN-6: Platform Admins are invisible to the tenant role and visible to the platform role', async () => {
    const asTenant = await tenantDb.run(scopeOf(ga1.id), (db) =>
      db.getRepository(User).findOneBy({ email: 'platform@test' }),
    );
    expect(asTenant).toBeNull();
    const asPlatform = await platformDb.run('sign-in', (db) =>
      db.getRepository(User).findOneBy({ email: 'platform@test' }),
    );
    expect(asPlatform?.roles).toEqual(['PLATFORM_ADMIN']);
  });

  it('ROLE-3: only a Platform Admin has no tenant', async () => {
    const orphan = platformDb.run('platform-console', (db) =>
      db.getRepository(User).insert({
        tenantId: null,
        email: 'orphan@test',
        name: 'Không GA',
        roles: ['FC'],
      }),
    );
    await expect(orphan).rejects.toSatisfy(
      (error) => codeOf(error) === CHECK_VIOLATION,
    );
  });

  it('USER-2 + ROLE-2 + USER-13: emails are unique; an agent code is unique among users who are not archived', async () => {
    const insert = (email: string) =>
      tenantDb.run(scopeOf(ga1.id), (db) =>
        db.getRepository(User).insert({
          tenantId: ga1.id,
          email,
          name: 'Trùng',
          roles: ['FC'],
          agentCode: '000123',
        }),
      );
    await expect(insert('fc@ga2.test')).rejects.toSatisfy(
      (error) => codeOf(error) === UNIQUE_VIOLATION,
    );
    await expect(insert('second@ga1.test')).rejects.toSatisfy(
      (error) => codeOf(error) === UNIQUE_VIOLATION,
    );
    await tenantDb.run(scopeOf(ga1.id), (db) =>
      db
        .getRepository(User)
        .update(
          { email: 'fc@ga1.test' },
          { status: UserStatus.Archived, archivedAt: new Date() },
        ),
    );
    await insert('second@ga1.test');
  });

  it('Section 22.4: the API roles can add audit events but never change or delete them', async () => {
    await tenantDb.run(scopeOf(ga1.id), (db) =>
      db.getRepository(AuditEvent).insert({
        tenantId: ga1.id,
        action: AuditAction.Create,
        hash: 'test',
        entity: 'user',
        entityId: 'x',
      }),
    );
    for (const change of [
      (db: import('typeorm').EntityManager) =>
        db
          .getRepository(AuditEvent)
          .update({ entity: 'user' }, { action: AuditAction.Delete }),
      (db: import('typeorm').EntityManager) =>
        db.getRepository(AuditEvent).delete({ entity: 'user' }),
    ])
      await expect(tenantDb.run(scopeOf(ga1.id), change)).rejects.toSatisfy(
        (error) => codeOf(error) === INSUFFICIENT_PRIVILEGE,
      );
    const [ga1Events, ga2Events] = await Promise.all(
      [ga1, ga2].map((ga) =>
        tenantDb.run(scopeOf(ga.id), (db) =>
          db.getRepository(AuditEvent).count(),
        ),
      ),
    );
    expect([ga1Events, ga2Events]).toEqual([1, 0]);
  });

  it('Outbox: the API writes messages but cannot read them; the relay can', async () => {
    await tenantDb.run(scopeOf(ga1.id), (db) =>
      enqueue(db, {
        tenantId: ga1.id,
        topic: 'user.created',
        payload: { userId: 'x' },
      }),
    );
    // Not for another tenant either
    await expect(
      tenantDb.run(scopeOf(ga1.id), (db) =>
        enqueue(db, { tenantId: ga2.id, topic: 'user.created', payload: {} }),
      ),
    ).rejects.toSatisfy((error) => codeOf(error) === INSUFFICIENT_PRIVILEGE);
    await expect(
      tenantDb.run(scopeOf(ga1.id), (db) =>
        db.getRepository(OutboxMessage).find(),
      ),
    ).rejects.toSatisfy((error) => codeOf(error) === INSUFFICIENT_PRIVILEGE);
    const pending = await platformDb.run('outbox-relay', (db) =>
      db.getRepository(OutboxMessage).countBy({ topic: 'user.created' }),
    );
    expect(pending).toBe(1);
  });
});
