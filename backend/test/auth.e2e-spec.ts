import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { ownerDb } from './support/owner-db.js';
import { getDataSourceToken } from '@nestjs/typeorm';
import type { DataSource } from 'typeorm';
import { TenantDb } from '../src/core/tenancy/tenant-db.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';

describe('Auth, RBAC and tenancy (e2e)', () => {
  let app: INestApplication;

  const http = () => request(app.getHttpServer());

  /** A cookie-keeping client, like a browser. */
  const signIn = async (email: string, password = PASSWORD) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email, password })
      .expect(200);
    return agent;
  };
  const inviteToken = (url: string) => url.split('/invite/')[1];

  beforeAll(async () => {
    app = await startApp();

    await seedDemoData(app, PASSWORD);
  });

  afterAll(async () => {
    await stopApp(app);
  });

  describe('authentication', () => {
    it('section 17.1: routes are private unless marked public', async () => {
      await http().get(`${API}/health`).expect(200);
      const res = await http().get(`${API}/me`).expect(401);
      expect(res.body).toEqual({ error: 'unauthenticated' });
      await http().get(`${API}/users`).expect(401);
    });

    it('USER-16: wrong password and unknown email look identical and are audited', async () => {
      const wrong = await http()
        .post(`${API}/auth/sign-in/email`)
        .send({ email: demoEmail(1, 'fc'), password: 'wrong-password' })
        .expect(401);
      const unknown = await http()
        .post(`${API}/auth/sign-in/email`)
        .send({ email: 'nobody@test.local', password: 'wrong-password' })
        .expect(401);
      expect(wrong.body).toEqual({ error: 'invalid_credentials' });
      expect(unknown.body).toEqual(wrong.body);
      expect(
        await connection
          .collection('auditEvents')
          .countDocuments({ action: 'LOGIN_FAILED' }),
      ).toBeGreaterThanOrEqual(2);
    });

    it('rejects operator injection in sign-in with invalid_input and issues', async () => {
      const res = await http()
        .post(`${API}/auth/sign-in/email`)
        .send({ email: { $gt: '' }, password: { $gt: '' } })
        .expect(400);
      expect(res.body.error).toBe('invalid_input');
      expect(
        res.body.issues.map((issue: { path: string }) => issue.path),
      ).toContain('email');
    });

    it('USER-17: the session cookie is HTTP-only and only its hash is stored', async () => {
      const res = await http()
        .post(`${API}/auth/sign-in/email`)
        .send({ email: demoEmail(1, 'fc'), password: PASSWORD })
        .expect(200);
      const cookie = res.get('Set-Cookie')![0];
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Lax/);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);

      const token = decodeURIComponent(cookie.split(';')[0].split('=')[1]);
      expect(
        await connection
          .collection('sessions')
          .countDocuments({ tokenHash: token }),
      ).toBe(0);
    });

    it('section 17.2: /me returns tenant, roles, permissions and reach', async () => {
      const agent = await signIn(demoEmail(1, 'um'));
      const { body } = await agent.get(`${API}/me`).expect(200);
      expect(body.tenant.gaCode).toBe('GA-HN');
      expect(body.roles).toEqual(['UM', 'FC']);
      expect(body.reach).toBe('DOWNLINE');
      expect(body.user.agentCode).toBe('00100003');
      // Open question 4 (14/11/2026): line managers also reassign leads within their line
      expect(body.permissions).toEqual(['imports.upload', 'ai.use', 'leads.assign_line']);
    });

    it('sign-out ends the session', async () => {
      const agent = await signIn(demoEmail(1, 'fc'));
      await agent.post(`${API}/auth/sign-out`).expect(204);
      await agent.get(`${API}/me`).expect(401);
    });

    it('USER-18: mutating requests from a foreign origin are refused', async () => {
      await http()
        .post(`${API}/auth/sign-in/email`)
        .set('Origin', 'https://evil.example')
        .send({ email: demoEmail(1, 'fc'), password: PASSWORD })
        .expect(403);
    });
  });

  it('The account switcher is off unless DEV_ACCOUNT_SWITCHER=true: its routes answer 404', async () => {
    await request(app.getHttpServer()).get(`${API}/dev/accounts`).expect(404);
    await request(app.getHttpServer())
      .post(`${API}/dev/switch`)
      .send({ userId: '01960000-0000-7000-8000-000000000000' })
      .expect(404);
  });

  describe('TEN: tenant isolation', () => {
    it('TEN-7: a GA-1 user gets 404 for a GA-2 user id, on read and write', async () => {
      const head2 = await signIn(demoEmail(2, 'head'));
      const { body } = await head2
        .get(`${API}/users`)
        .query({ q: demoEmail(2, 'fc') })
        .expect(200);
      const ga2UserId = body.items[0].id;

      const head1 = await signIn(demoEmail(1, 'head'));
      expect(
        (await head1.get(`${API}/users/${ga2UserId}`).expect(404)).body,
      ).toEqual({ error: 'not_found' });
      await head1
        .patch(`${API}/users/${ga2UserId}`)
        .send({ name: 'Hacked' })
        .expect(404);
      await head1.delete(`${API}/users/${ga2UserId}`).expect(404);
    });

    it('TEN-5: an OR search never escapes the tenant filter', async () => {
      const head1 = await signIn(demoEmail(1, 'head'));
      const { body } = await head1
        .get(`${API}/users`)
        .query({ q: 'gacrm.local', pageSize: 50 })
        .expect(200);
      expect(body.total).toBeGreaterThan(0);
      for (const user of body.items) expect(user.email).toMatch(/@ga1\./);
    });

    it('USER-1: the tenant cannot be chosen through the request body', async () => {
      const head1 = await signIn(demoEmail(1, 'head'));
      await head1
        .post(`${API}/users/invite`)
        .send({
          email: 'x@test.local',
          name: 'X',
          roles: ['ADMIN'],
          tenantId: '665f1c2e8a1b2c3d4e5f6a7b',
        })
        .expect(400);
    });

    it('TEN-2: every table with tenant data is under forced row-level security and refuses unpinned queries', async () => {
      // Tables without a tenant_id, each for a reason
      const exempt = new Set([
        // Sign-in counters: no tenant is known yet; only crm_platform reaches them
        'login_attempts',
        // The reminder rounds' lease (TASK-7): one per job, for all GAs; only crm_platform
        'job_locks',
        // The Platform Admin's switches (USER-16): one row for every GA; only crm_platform
        'platform_settings',
        // TypeORM's own bookkeeping
        'migrations',
      ]);
      const { rows } = await ownerDb().query<{
        table: string;
        tenant: boolean;
        rls: boolean;
        forced: boolean;
      }>(
        `SELECT c.relname AS table, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced,
                EXISTS (SELECT 1 FROM information_schema.columns k
                         WHERE k.table_name = c.relname AND k.column_name = 'tenant_id') AS tenant
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r'`,
      );
      expect(rows.length).toBeGreaterThan(5);
      const raw = app.get<DataSource>(getDataSourceToken());
      for (const row of rows) {
        if (row.table === 'migrations') continue;
        expect(
          row.rls && row.forced,
          `${row.table} is not under forced RLS`,
        ).toBe(true);
        if (!row.tenant) {
          expect(
            exempt.has(row.table) ||
              ['tenants', 'audit_chains'].includes(row.table),
            `${row.table} has no tenant_id`,
          ).toBe(true);
          continue;
        }
        await expect(
          raw.query(`SELECT 1 FROM ${row.table} LIMIT 1`),
          `${row.table} accepted a query without a tenant`,
        ).rejects.toThrow();
      }
    });
  });

  describe('RBAC and users', () => {
    it('PERM-4: the API enforces permissions regardless of the UI', async () => {
      const fc = await signIn(demoEmail(1, 'fc'));
      expect((await fc.get(`${API}/users`).expect(403)).body).toEqual({
        error: 'forbidden',
      });
      await fc.get(`${API}/permissions`).expect(403);
      await fc.get(`${API}/audit`).expect(403);
      await fc.get(`${API}/platform/tenants`).expect(403);

      const admin = await signIn(demoEmail(1, 'admin'));
      await admin.get(`${API}/users`).expect(200);
      await admin.get(`${API}/permissions`).expect(403);
    });

    it('ROLE-4: a non GA_HEAD cannot create or edit a GA_HEAD', async () => {
      const admin = await signIn(demoEmail(1, 'admin'));
      await admin
        .post(`${API}/users/invite`)
        .send({ email: 'head2@test.local', name: 'H', roles: ['GA_HEAD'] })
        .expect(403);

      const { body } = await admin
        .get(`${API}/users`)
        .query({ role: 'GA_HEAD' })
        .expect(200);
      await admin
        .patch(`${API}/users/${body.items[0].id}`)
        .send({ name: 'Changed' })
        .expect(403);
    });

    it('ROLE-3: PLATFORM_ADMIN cannot be assigned from inside a GA', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      await head
        .post(`${API}/users/invite`)
        .send({ email: 'pa@test.local', name: 'P', roles: ['PLATFORM_ADMIN'] })
        .expect(400);
    });

    it('ROLE-2 / DATA-1: agent roles need a code, unique per tenant, leading zeros kept', async () => {
      const head1 = await signIn(demoEmail(1, 'head'));
      const missing = await head1
        .post(`${API}/users/invite`)
        .send({ email: 'a@test.local', name: 'A', roles: ['FC'] })
        .expect(400);
      expect(missing.body.error).toBe('agent_code_required');

      const taken = await head1
        .post(`${API}/users/invite`)
        .send({
          email: 'b@test.local',
          name: 'B',
          roles: ['FC'],
          agentCode: '00100004',
        })
        .expect(409);
      expect(taken.body.error).toBe('agent_code_taken');

      const invited = await head1
        .post(`${API}/users/invite`)
        .send({
          email: 'code.in.ga1@test.local',
          name: 'C',
          roles: ['FC'],
          agentCode: '00900099',
        })
        .expect(201);
      expect(invited.body.user.agentCode).toBe('00900099');

      // The same code is free in another tenant
      const head2 = await signIn(demoEmail(2, 'head'));
      await head2
        .post(`${API}/users/invite`)
        .send({
          email: 'code.in.ga2@test.local',
          name: 'D',
          roles: ['FC'],
          agentCode: '00900099',
        })
        .expect(201);
    });

    it('USER-2: email is unique across the whole system', async () => {
      const head2 = await signIn(demoEmail(2, 'head'));
      const res = await head2
        .post(`${API}/users/invite`)
        .send({
          email: demoEmail(1, 'fc').toUpperCase(),
          name: 'E',
          roles: ['ADMIN'],
        })
        .expect(409);
      expect(res.body.error).toBe('email_taken');
    });

    it('USER-12 / ROLE-5: self-disable and removing the last GA_HEAD are refused', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const me = (await head.get(`${API}/me`).expect(200)).body.user;

      for (const action of ['disable', 'archive']) {
        const self = await head
          .post(`${API}/users/${me.id}/${action}`)
          .expect(409);
        expect(self.body.error).toBe('cannot_disable_self');
      }

      const demote = await head
        .patch(`${API}/users/${me.id}`)
        .send({ roles: ['ADMIN'] })
        .expect(409);
      expect(demote.body.error).toBe('last_ga_head');
    });

    it('USER-10: disabling applies immediately and deletes all sessions', async () => {
      const head = await signIn(demoEmail(2, 'head'));
      const invited = await head
        .post(`${API}/users/invite`)
        .send({ email: 'to.disable@test.local', name: 'T', roles: ['ADMIN'] })
        .expect(201);
      const accepted = request.agent(app.getHttpServer());
      await accepted
        .post(`${API}/invites/accept`)
        .send({
          token: inviteToken(invited.body.inviteUrl),
          password: PASSWORD,
        })
        .expect(201);
      await accepted.get(`${API}/me`).expect(200);

      await head
        .post(`${API}/users/${invited.body.user.id}/disable`)
        .expect(204);
      await accepted.get(`${API}/me`).expect(401);
      await http()
        .post(`${API}/auth/sign-in/email`)
        .send({ email: 'to.disable@test.local', password: PASSWORD })
        .expect(401);
    });

    it('USER-12: a pending user cannot be disabled; USER-14: revoke deletes it', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const invited = await head
        .post(`${API}/users/invite`)
        .send({ email: 'pending@test.local', name: 'P', roles: ['ADMIN'] })
        .expect(201);
      const id = invited.body.user.id;

      for (const action of ['disable', 'archive']) {
        expect(
          (await head.post(`${API}/users/${id}/${action}`).expect(409)).body
            .error,
        ).toBe('invite_pending');
      }
      await head.delete(`${API}/users/${id}`).expect(204);
      await head.get(`${API}/users/${id}`).expect(404);
      const revoked = await connection
        .collection('auditEvents')
        .findOne({ entity: 'user', entityId: id, action: 'DELETE' });
      expect(revoked?.meta).toMatchObject({
        email: 'pending@test.local',
        roles: ['ADMIN'],
        reason: 'invite_withdrawn',
      });
    });
  });

  describe('user lifecycle (section 6.3)', () => {
    const PASSWORD_B = 'lifecycle-password-456';

    // These tests prove that old passwords fail; the failures must not lock this IP for later tests
    afterEach(() => connection.collection('loginAttempts').deleteMany({}));

    /** Invites, accepts and returns the new user's id with a signed-in client. */
    const activated = async (
      email: string,
      body: Record<string, unknown> = {},
      ga = 1,
    ) => {
      const head = await signIn(demoEmail(ga, 'head'));
      const invited = await head
        .post(`${API}/users/invite`)
        .send({ email, name: 'Vòng đời', roles: ['MARKETING'], ...body })
        .expect(201);
      const device = request.agent(app.getHttpServer());
      await device
        .post(`${API}/invites/accept`)
        .send({
          token: inviteToken(invited.body.inviteUrl),
          password: PASSWORD_B,
        })
        .expect(201);
      return { head, id: invited.body.user.id as string, device };
    };
    const storedUser = (id: string) =>
      connection.collection('users').findOne({ _id: id });

    it('USER-6 + test 8: the email is normalised, unique, audited, and the password still works', async () => {
      const { head, id, device } = await activated('old.address@test.local');

      const taken = await head
        .patch(`${API}/users/${id}`)
        .send({ email: demoEmail(2, 'fc').toUpperCase() })
        .expect(409);
      expect(taken.body.error).toBe('email_taken');
      await head
        .patch(`${API}/users/${id}`)
        .send({ email: 'not-an-email' })
        .expect(400);

      const { body } = await head
        .patch(`${API}/users/${id}`)
        .send({ email: '  New.Address@Test.Local ' })
        .expect(200);
      expect(body.email).toBe('new.address@test.local');
      await device.get(`${API}/me`).expect(200);
      await signIn('new.address@test.local', PASSWORD_B);
      await http()
        .post(`${API}/auth/sign-in/email`)
        .send({ email: 'old.address@test.local', password: PASSWORD_B })
        .expect(401);

      const event = await connection
        .collection('auditEvents')
        .findOne({ entity: 'user', entityId: id, action: 'UPDATE' });
      expect(event?.meta.before.email).toBe('old.address@test.local');
      expect(event?.meta.after.email).toBe('new.address@test.local');
    });

    it('USER-10 + test 9: disabling wipes sessions and the password; data and history stay', async () => {
      const { head, id, device } = await activated('wiped@test.local');
      await head.post(`${API}/users/${id}/password-reset`).expect(200);

      await head.post(`${API}/users/${id}/disable`).expect(204);
      await device.get(`${API}/me`).expect(401);
      await http()
        .post(`${API}/auth/sign-in/email`)
        .send({ email: 'wiped@test.local', password: PASSWORD_B })
        .expect(401);

      const user = await storedUser(id);
      expect(user?.status).toBe('DISABLED');
      expect(user?.passwordHash).toBeUndefined();
      const userId = user!._id;
      expect(
        await connection.collection('sessions').countDocuments({ userId }),
      ).toBe(0);
      expect(
        await connection
          .collection('passwordResets')
          .countDocuments({ userId }),
      ).toBe(0);
      // USER-10: the history the user made stays theirs
      expect(
        await connection.collection('auditEvents').countDocuments({ userId }),
      ).toBeGreaterThan(0);

      // USER-15: before and after, and a second call changes nothing
      const events = await connection
        .collection('auditEvents')
        .find({ entity: 'user', entityId: id, 'meta.after.status': 'DISABLED' })
        .toArray();
      expect(events).toHaveLength(1);
      expect(events[0].meta.before.status).toBe('ACTIVE');
      await head.post(`${API}/users/${id}/disable`).expect(204);
      expect(
        await connection.collection('auditEvents').countDocuments({
          entity: 'user',
          entityId: id,
          'meta.after.status': 'DISABLED',
        }),
      ).toBe(1);
    });

    it('USER-9 + USER-7: an archived user cannot sign in and leaves the default list', async () => {
      const { head, id, device } = await activated('leaving@test.local');

      await head
        .post(`${API}/users/${id}/archive`)
        .send({ reason: 'Nghỉ việc' })
        .expect(204);
      await device.get(`${API}/me`).expect(401);
      await http()
        .post(`${API}/auth/sign-in/email`)
        .send({ email: 'leaving@test.local', password: PASSWORD_B })
        .expect(401);

      const all = (
        await head
          .get(`${API}/users`)
          .query({ pageSize: 50, q: 'leaving' })
          .expect(200)
      ).body;
      expect(all.total).toBe(0);
      const archived = (
        await head
          .get(`${API}/users`)
          .query({ status: 'ARCHIVED', q: 'leaving' })
          .expect(200)
      ).body;
      expect(archived.items).toHaveLength(1);
      expect(archived.items[0]).toMatchObject({
        status: 'ARCHIVED',
        archiveReason: 'Nghỉ việc',
      });
      expect(archived.items[0].archivedAt).toBeDefined();

      const event = await connection
        .collection('auditEvents')
        .findOne({ entity: 'user', entityId: id, action: 'ARCHIVE' });
      expect(event?.meta).toEqual({
        before: { status: 'ACTIVE' },
        after: { status: 'ARCHIVED' },
      });
      expect(JSON.stringify(event?.meta)).not.toContain('Nghỉ việc');

      // Password actions treat an archived user like a disabled one
      const reset = await head
        .post(`${API}/users/${id}/password-reset`)
        .expect(409);
      expect(reset.body.error).toBe('user_disabled');
    });

    it('USER-13 + test 7: archiving frees the agent code; reactivating needs it back', async () => {
      const code = '0099001';
      const { head, id } = await activated('code.holder@test.local', {
        roles: ['FC'],
        agentCode: code,
      });
      const clash = await head
        .post(`${API}/users/invite`)
        .send({
          email: 'code.next@test.local',
          name: 'N',
          roles: ['FC'],
          agentCode: code,
        })
        .expect(409);
      expect(clash.body.error).toBe('agent_code_taken');

      // A disabled user still holds the code
      await head.post(`${API}/users/${id}/disable`).expect(204);
      await head
        .post(`${API}/users/invite`)
        .send({
          email: 'code.next@test.local',
          name: 'N',
          roles: ['FC'],
          agentCode: code,
        })
        .expect(409);

      await head.post(`${API}/users/${id}/archive`).send({}).expect(204);
      await head
        .post(`${API}/users/invite`)
        .send({
          email: 'code.next@test.local',
          name: 'N',
          roles: ['FC'],
          agentCode: code,
        })
        .expect(201);

      const back = await head.post(`${API}/users/${id}/reactivate`).expect(409);
      expect(back.body.error).toBe('agent_code_taken');
      expect((await storedUser(id))?.status).toBe('ARCHIVED');
    });

    it('USER-11: reactivating returns the user to INVITED with a new invite and a new password', async () => {
      const { head, id } = await activated('coming.back@test.local');
      await head.post(`${API}/users/${id}/archive`).send({}).expect(204);

      const { body } = await head
        .post(`${API}/users/${id}/reactivate`)
        .expect(200);
      const user = await storedUser(id);
      expect(user?.status).toBe('INVITED');
      expect(user?.archivedAt).toBeUndefined();
      await http()
        .post(`${API}/auth/sign-in/email`)
        .send({ email: 'coming.back@test.local', password: PASSWORD_B })
        .expect(401);

      const NEW_PASSWORD = 'came-back-password-789';
      await http()
        .post(`${API}/invites/accept`)
        .send({ token: inviteToken(body.inviteUrl), password: NEW_PASSWORD })
        .expect(201);
      await signIn('coming.back@test.local', NEW_PASSWORD);

      // Only a user that is out of use comes back
      const active = await head
        .post(`${API}/users/${id}/reactivate`)
        .expect(409);
      expect(active.body.error).toBe('not_invited');
    });

    it('USER-14 + test 10: a user with history is never deleted, only archived', async () => {
      const { head, id } = await activated('has.history@test.local');
      await head.post(`${API}/users/${id}/disable`).expect(204);
      await head.post(`${API}/users/${id}/reactivate`).expect(200);

      // INVITED again, but they signed in before
      const refused = await head.delete(`${API}/users/${id}`).expect(409);
      expect(refused.body.error).toBe('user_has_history');
      await head.post(`${API}/users/${id}/archive`).send({}).expect(204);
      expect((await storedUser(id))?.status).toBe('ARCHIVED');
    });

    it('USER-12 + ROLE-4 + ROLE-5: GA_HEAD accounts and the last active GA_HEAD are protected', async () => {
      const ownHead = await signIn(demoEmail(2, 'head'));
      const me = (await ownHead.get(`${API}/me`).expect(200)).body.user;
      const admin = await signIn(demoEmail(2, 'admin'));
      for (const action of ['disable', 'archive', 'reactivate']) {
        await admin.post(`${API}/users/${me.id}/${action}`).expect(403);
      }

      // A GA_HEAD may archive another GA_HEAD while one active GA_HEAD remains
      const second = await activated(
        'second.head@test.local',
        { roles: ['GA_HEAD'] },
        2,
      );
      await ownHead
        .post(`${API}/users/${second.id}/archive`)
        .send({})
        .expect(204);
      expect(
        await connection.collection('users').countDocuments({
          tenantId: (await storedUser(me.id))!.tenantId,
          roles: 'GA_HEAD',
          status: 'ACTIVE',
        }),
      ).toBe(1);
    });

    it('TEN-7: GA-1 gets 404 for every lifecycle action on a GA-2 user', async () => {
      const head1 = await signIn(demoEmail(1, 'head'));
      const head2 = await signIn(demoEmail(2, 'head'));
      const target = (
        await head2
          .get(`${API}/users`)
          .query({ q: demoEmail(2, 'marketing') })
          .expect(200)
      ).body.items[0];
      for (const action of ['disable', 'archive', 'reactivate']) {
        await head1.post(`${API}/users/${target.id}/${action}`).expect(404);
      }
      await head1
        .patch(`${API}/users/${target.id}`)
        .send({ email: 'stolen@test.local' })
        .expect(404);
      expect((await storedUser(target.id))?.status).toBe('ACTIVE');
    });
  });

  describe('invitations', () => {
    it('USER-3 / USER-4: single use, activates and signs in; the old link dies on resend', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const invited = await head
        .post(`${API}/users/invite`)
        .send({ email: 'new.user@test.local', name: 'N', roles: ['MARKETING'] })
        .expect(201);
      const first = inviteToken(invited.body.inviteUrl);

      expect(
        await connection
          .collection('invitations')
          .countDocuments({ tokenHash: first }),
      ).toBe(0);

      const resent = await head
        .post(`${API}/users/${invited.body.user.id}/invite`)
        .expect(200);
      const second = inviteToken(resent.body.inviteUrl);
      expect(
        (await http().get(`${API}/invites/${first}`).expect(404)).body.error,
      ).toBe('invite_invalid');

      const info = await http().get(`${API}/invites/${second}`).expect(200);
      expect(info.body).toEqual({
        email: 'new.user@test.local',
        name: 'N',
        tenantName: 'Tổng đại lý khu vực Hà Nội',
      });

      await http()
        .post(`${API}/invites/accept`)
        .send({ token: second, password: 'short' })
        .expect(400);
      const agent = request.agent(app.getHttpServer());
      await agent
        .post(`${API}/invites/accept`)
        .send({ token: second, password: PASSWORD })
        .expect(201);
      await agent.get(`${API}/me`).expect(200);

      await http()
        .post(`${API}/invites/accept`)
        .send({ token: second, password: PASSWORD })
        .expect(404);
      expect(
        (
          await head
            .post(`${API}/users/${invited.body.user.id}/invite`)
            .expect(409)
        ).body.error,
      ).toBe('not_invited');
    });

    it('USER-3: an expired invite is rejected', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const invited = await head
        .post(`${API}/users/invite`)
        .send({ email: 'late@test.local', name: 'L', roles: ['ADMIN'] })
        .expect(201);
      await connection
        .collection('invitations')
        .updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      await http()
        .get(`${API}/invites/${inviteToken(invited.body.inviteUrl)}`)
        .expect(404);
    });
  });

  describe('permission matrix', () => {
    it('section 23.2 #11: edits apply on the next request, are audited, and stay per tenant', async () => {
      const head1 = await signIn(demoEmail(1, 'head'));
      const marketing1 = await signIn(demoEmail(1, 'marketing'));
      const marketing2 = await signIn(demoEmail(2, 'marketing'));
      await marketing1.get(`${API}/users`).expect(403);

      const { grants } = (await head1.get(`${API}/permissions`).expect(200))
        .body;
      await head1
        .put(`${API}/permissions`)
        .send({
          grants: {
            ...grants,
            MARKETING: [...grants.MARKETING, 'users.manage'],
          },
        })
        .expect(204);

      await marketing1.get(`${API}/users`).expect(200);
      await marketing2.get(`${API}/users`).expect(403);

      const audit = await head1
        .get(`${API}/audit`)
        .query({ action: 'PERMISSION_CHANGE' })
        .expect(200);
      expect(audit.body.items[0].meta.after.MARKETING).toContain(
        'users.manage',
      );

      await head1.put(`${API}/permissions`).send({ grants }).expect(204);
      await marketing1.get(`${API}/users`).expect(403);
    });

    it('rejects unknown permissions', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const { grants } = (await head.get(`${API}/permissions`)).body;
      await head
        .put(`${API}/permissions`)
        .send({ grants: { ...grants, FC: ['root.all'] } })
        .expect(400);
    });
  });

  describe('platform', () => {
    const platformAdmin = () =>
      signIn(
        process.env.PLATFORM_ADMIN_EMAIL!,
        process.env.PLATFORM_ADMIN_PASSWORD!,
      );

    it('TENANT-2: creates a GA with an invited head; ga_code_taken on duplicate', async () => {
      const admin = await platformAdmin();
      const dto = {
        gaCode: 'ga-new-1',
        name: 'GA mới',
        head: { email: 'head.new@test.local', name: 'Chủ mới' },
      };
      const { body } = await admin
        .post(`${API}/platform/tenants`)
        .send(dto)
        .expect(201);
      expect(body.tenant.gaCode).toBe('GA-NEW-1');
      expect(body.head.status).toBe('INVITED');
      expect(body.head.roles).toEqual(['GA_HEAD']);

      const again = await admin
        .post(`${API}/platform/tenants`)
        .send({ ...dto, head: { ...dto.head, email: 'other@test.local' } })
        .expect(409);
      expect(again.body.error).toBe('ga_code_taken');
      // The transaction rolled back, so the second head was not left behind
      expect(
        await connection
          .collection('users')
          .countDocuments({ email: 'other@test.local' }),
      ).toBe(0);

      const head = request.agent(app.getHttpServer());
      await head
        .post(`${API}/invites/accept`)
        .send({ token: inviteToken(body.inviteUrl), password: PASSWORD })
        .expect(201);
      expect(
        (await head.get(`${API}/me`).expect(200)).body.permissions,
      ).toContain('users.manage');
    });

    it('TEN-6: reading a tenant writes CROSS_TENANT_READ before returning data', async () => {
      const admin = await platformAdmin();
      const { body: tenants } = await admin
        .get(`${API}/platform/tenants`)
        .query({ q: 'GA-HN' })
        .expect(200);
      const id = tenants.items[0].id;
      expect(tenants.items[0].users).toBeGreaterThan(0);

      const { body } = await admin
        .get(`${API}/platform/tenants/${id}/users`)
        .expect(200);
      expect(body.total).toBeGreaterThan(0);

      const head = await signIn(demoEmail(1, 'head'));
      const audit = await head
        .get(`${API}/audit`)
        .query({ action: 'CROSS_TENANT_READ' })
        .expect(200);
      expect(audit.body.total).toBeGreaterThan(0);
      // DLVN staff appear by role only: nothing that identifies the person
      const [event] = audit.body.items;
      expect(event.actor).toEqual({ kind: 'platform' });
      expect(event).not.toHaveProperty('ip');
      expect(event).not.toHaveProperty('userAgent');
      expect(event).not.toHaveProperty('userId');
    });

    it('TENANT-3: suspension gives 401 on the next request and can be reversed', async () => {
      const admin = await platformAdmin();
      const { body: tenants } = await admin
        .get(`${API}/platform/tenants`)
        .query({ q: 'GA-HCM' })
        .expect(200);
      const id = tenants.items[0].id;
      const fc = await signIn(demoEmail(2, 'fc'));

      await admin
        .patch(`${API}/platform/tenants/${id}`)
        .send({ status: 'suspended' })
        .expect(204);
      await fc.get(`${API}/me`).expect(401);
      await http()
        .post(`${API}/auth/sign-in/email`)
        .send({ email: demoEmail(2, 'fc'), password: PASSWORD })
        .expect(401);

      await admin
        .patch(`${API}/platform/tenants/${id}`)
        .send({ status: 'active' })
        .expect(204);
      await fc.get(`${API}/me`).expect(200);
    });
  });

  describe('personal settings', () => {
    const invite = async (email: string) => {
      const head = await signIn(demoEmail(1, 'head'));
      const { body } = await head
        .post(`${API}/users/invite`)
        .send({ email, name: 'Settings', roles: ['ADMIN'] })
        .expect(201);
      const agent = request.agent(app.getHttpServer());
      await agent
        .post(`${API}/invites/accept`)
        .send({ token: inviteToken(body.inviteUrl), password: PASSWORD })
        .expect(201);
      return agent;
    };

    it('changing the password checks the current one and signs out other devices', async () => {
      const email = 'change.password@test.local';
      const newPassword = 'another-password-1';
      const device = await invite(email);
      const otherDevice = await signIn(email);
      const url = `${API}/auth/password/change`;

      const wrong = await device
        .post(url)
        .send({ currentPassword: 'wrong-password', newPassword })
        .expect(400);
      expect(wrong.body.error).toBe('invalid_current_password');

      const same = await device
        .post(url)
        .send({ currentPassword: PASSWORD, newPassword: PASSWORD })
        .expect(400);
      expect(same.body.error).toBe('password_unchanged');

      await device
        .post(url)
        .send({ currentPassword: PASSWORD, newPassword: 'short' })
        .expect(400);
      await otherDevice.get(`${API}/me`).expect(200);

      await device
        .post(url)
        .send({ currentPassword: PASSWORD, newPassword })
        .expect(204);

      await device.get(`${API}/me`).expect(200);
      await otherDevice.get(`${API}/me`).expect(401);
      await http()
        .post(`${API}/auth/sign-in/email`)
        .send({ email, password: PASSWORD })
        .expect(401);
      await signIn(email, newPassword);
    });

    it('changing the password requires a session', async () => {
      await http()
        .post(`${API}/auth/password/change`)
        .send({ currentPassword: PASSWORD, newPassword: 'another-password-1' })
        .expect(401);
    });

    it('appearance follows the account across devices and is validated', async () => {
      const email = 'appearance@test.local';
      const device = await invite(email);

      const before = await device.get(`${API}/me`).expect(200);
      expect(before.body.appearance).toEqual({
        theme: 'light',
        accent: '#0057d2',
      });

      const appearance = { theme: 'midnight', accent: '#0f766e' };
      await device.patch(`${API}/me`).send({ appearance }).expect(204);

      const otherDevice = await signIn(email);
      const after = await otherDevice.get(`${API}/me`).expect(200);
      expect(after.body.appearance).toEqual(appearance);

      // Another user keeps their own appearance
      const fc = await signIn(demoEmail(1, 'fc'));
      expect((await fc.get(`${API}/me`)).body.appearance.theme).toBe('light');

      for (const invalid of [
        { theme: 'neon', accent: '#0057d2' },
        { theme: 'dark', accent: 'red' },
        { theme: 'dark' },
        { theme: 'dark', accent: '#0057d2', radius: 0 },
      ]) {
        await device
          .patch(`${API}/me`)
          .send({ appearance: invalid })
          .expect(400);
      }
    });
  });

  describe('administrator password actions', () => {
    const OLD = PASSWORD;
    const NEW = 'set-by-admin-123';
    const signInStatus = (email: string, password: string) =>
      http().post(`${API}/auth/sign-in/email`).send({ email, password });
    const resetToken = (url: string) => url.split('/reset-password/')[1];

    /** An ACTIVE Marketing user in GA 1, signed in on its own device. */
    const activeUser = async (email: string) => {
      const head = await signIn(demoEmail(1, 'head'));
      const { body } = await head
        .post(`${API}/users/invite`)
        .send({ email, name: 'Managed', roles: ['MARKETING'] })
        .expect(201);
      const device = request.agent(app.getHttpServer());
      await device
        .post(`${API}/invites/accept`)
        .send({ token: inviteToken(body.inviteUrl), password: OLD })
        .expect(201);
      return { id: body.user.id as string, device };
    };

    it('an admin sets a password: the user is signed out and the old one stops working', async () => {
      const email = 'managed.set@test.local';
      const { id, device } = await activeUser(email);
      const admin = await signIn(demoEmail(1, 'admin'));

      await admin
        .post(`${API}/users/${id}/password`)
        .send({ password: 'short' })
        .expect(400);
      await admin
        .post(`${API}/users/${id}/password`)
        .send({ password: NEW })
        .expect(204);

      await device.get(`${API}/me`).expect(401);
      await signInStatus(email, OLD).expect(401);
      await signInStatus(email, NEW).expect(200);
    });

    it('PERM-4 / ROLE-4 / TEN-3: password actions follow the same access rules', async () => {
      const { id } = await activeUser('managed.access@test.local');
      const body = { password: NEW };

      const fc = await signIn(demoEmail(1, 'fc'));
      await fc.post(`${API}/users/${id}/password`).send(body).expect(403);
      await fc.post(`${API}/users/${id}/password-reset`).expect(403);

      // A plain admin cannot touch a GA_HEAD
      const admin = await signIn(demoEmail(1, 'admin'));
      const heads = await admin
        .get(`${API}/users`)
        .query({ role: 'GA_HEAD' })
        .expect(200);
      const headId = heads.body.items[0].id;
      await admin
        .post(`${API}/users/${headId}/password`)
        .send(body)
        .expect(403);
      await admin.post(`${API}/users/${headId}/password-reset`).expect(403);

      // Another GA's administrator sees nothing
      const otherGa = await signIn(demoEmail(2, 'admin'));
      await otherGa.post(`${API}/users/${id}/password`).send(body).expect(404);
      await otherGa.post(`${API}/users/${id}/password-reset`).expect(404);

      // Your own password needs the current-password check
      const self = (await admin.get(`${API}/me`)).body.user.id;
      const own = await admin
        .post(`${API}/users/${self}/password`)
        .send(body)
        .expect(409);
      expect(own.body.error).toBe('cannot_reset_self');
    });

    it('password actions apply only to active accounts', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const invited = await head
        .post(`${API}/users/invite`)
        .send({
          email: 'managed.pending@test.local',
          name: 'P',
          roles: ['ADMIN'],
        })
        .expect(201);
      const pending = await head
        .post(`${API}/users/${invited.body.user.id}/password-reset`)
        .expect(409);
      expect(pending.body.error).toBe('invite_pending');

      const { id } = await activeUser('managed.disabled@test.local');
      await head.post(`${API}/users/${id}/disable`).expect(204);
      const disabled = await head
        .post(`${API}/users/${id}/password`)
        .send({ password: NEW })
        .expect(409);
      expect(disabled.body.error).toBe('user_disabled');
    });

    it('USER-16: a reset link is single use and only its hash is stored', async () => {
      const email = 'managed.link@test.local';
      const { id, device } = await activeUser(email);
      const admin = await signIn(demoEmail(1, 'admin'));

      const first = await admin
        .post(`${API}/users/${id}/password-reset`)
        .expect(200);
      const firstToken = resetToken(first.body.resetUrl);
      expect(
        await connection
          .collection('passwordResets')
          .countDocuments({ tokenHash: firstToken }),
      ).toBe(0);

      // A new link replaces the previous one; the old password still works until a link is used
      const second = await admin
        .post(`${API}/users/${id}/password-reset`)
        .expect(200);
      const token = resetToken(second.body.resetUrl);
      await http().get(`${API}/auth/password/reset/${firstToken}`).expect(404);
      await device.get(`${API}/me`).expect(200);

      const info = await http()
        .get(`${API}/auth/password/reset/${token}`)
        .expect(200);
      expect(info.body).toEqual({ email });

      await http()
        .post(`${API}/auth/password/reset`)
        .send({ token, password: 'short' })
        .expect(400);
      await http()
        .post(`${API}/auth/password/reset`)
        .send({ token, password: NEW })
        .expect(204);

      await device.get(`${API}/me`).expect(401);
      await signInStatus(email, OLD).expect(401);
      await signInStatus(email, NEW).expect(200);

      const reused = await http()
        .post(`${API}/auth/password/reset`)
        .send({ token, password: 'another-password-9' })
        .expect(404);
      expect(reused.body.error).toBe('invite_invalid');
    });

    it('USER-16: an expired link or a disabled user is refused', async () => {
      const { id } = await activeUser('managed.expired@test.local');
      const head = await signIn(demoEmail(1, 'head'));
      const url = `${API}/users/${id}/password-reset`;

      const late = await head.post(url).expect(200);
      await connection
        .collection('passwordResets')
        .updateMany({}, { $set: { expiresAt: new Date(Date.now() - 1000) } });
      await http()
        .post(`${API}/auth/password/reset`)
        .send({ token: resetToken(late.body.resetUrl), password: NEW })
        .expect(404);

      const live = await head.post(url).expect(200);
      await head.post(`${API}/users/${id}/disable`).expect(204);
      await http()
        .post(`${API}/auth/password/reset`)
        .send({ token: resetToken(live.body.resetUrl), password: NEW })
        .expect(404);
    });

    it('a user who changes their own password invalidates a pending link', async () => {
      const { id, device } = await activeUser('managed.own@test.local');
      const head = await signIn(demoEmail(1, 'head'));
      const link = await head
        .post(`${API}/users/${id}/password-reset`)
        .expect(200);

      await device
        .post(`${API}/auth/password/change`)
        .send({ currentPassword: OLD, newPassword: NEW })
        .expect(204);
      await http()
        .get(`${API}/auth/password/reset/${resetToken(link.body.resetUrl)}`)
        .expect(404);
    });
  });

  describe('abuse protection', () => {
    const attempt = (email: string, password: string) =>
      http().post(`${API}/auth/sign-in/email`).send({ email, password });
    const clearMinuteWindows = () =>
      connection
        .collection('loginAttempts')
        .deleteMany({ _id: /^acct:/ as never });

    afterAll(() => connection.collection('loginAttempts').deleteMany({}));

    it('USER-16: failed attempts per account are limited; correct sign-ins are not', async () => {
      await clearMinuteWindows();
      const email = demoEmail(1, 'bm');
      for (let i = 0; i < 8; i++) await attempt(email, PASSWORD).expect(200);

      for (let i = 0; i < 5; i++)
        await attempt(email, 'wrong-password').expect(401);
      const limited = await attempt(email, 'wrong-password').expect(429);
      expect(limited.body).toEqual({ error: 'rate_limited' });
      expect(Number(limited.get('Retry-After'))).toBeGreaterThan(0);
      await clearMinuteWindows();
    });

    it('section 22.4: repeated failures lock an account, and unknown accounts look the same', async () => {
      const known = demoEmail(1, 'gad');
      const unknown = 'nobody.lock@test.local';
      for (const email of [known, unknown]) {
        for (let i = 0; i < 10; i++) {
          await attempt(email, 'wrong-password').expect(401);
          await clearMinuteWindows();
        }
        const locked = await attempt(email, 'wrong-password').expect(429);
        expect(locked.body).toEqual({ error: 'rate_limited' });
      }
      // Even the right password is refused during the lock
      await attempt(known, PASSWORD).expect(429);

      await connection
        .collection('loginAttempts')
        .updateMany(
          { _id: /^lock:/ as never },
          { $set: { lockedUntil: new Date(0) } },
        );
      await attempt(known, PASSWORD).expect(200);
      // A success clears the failure run
      for (let i = 0; i < 5; i++)
        await attempt(known, 'wrong-password').expect(401);
      await clearMinuteWindows();
      await attempt(known, PASSWORD).expect(200);
    });

    it('section 22.4: a lock binds to the IP, so an attacker cannot lock out the real user', async () => {
      const express = app.getHttpAdapter().getInstance() as {
        set(name: string, value: unknown): void;
      };
      const email = demoEmail(2, 'bm');
      const from = (ip: string, password: string) =>
        attempt(email, password).set('X-Forwarded-For', ip);

      // Not behind a proxy: a forged header must not change the client's IP
      for (let i = 0; i < 10; i++) {
        await from(`198.51.100.${i}`, 'wrong-password').expect(401);
        await clearMinuteWindows();
      }
      await from('198.51.100.200', PASSWORD).expect(429);
      await connection
        .collection('loginAttempts')
        .deleteMany({ _id: /^lock:/ as never });

      express.set('trust proxy', 1);
      try {
        for (let i = 0; i < 10; i++) {
          await from('203.0.113.9', 'wrong-password').expect(401);
          await clearMinuteWindows();
        }
        await from('203.0.113.9', PASSWORD).expect(429);
        await from('203.0.113.10', PASSWORD).expect(200);
      } finally {
        express.set('trust proxy', 0);
        await clearMinuteWindows();
      }
    });

    it('section 22.4: an IPv6 /64 counts as one client, so rotating addresses inside it does not reset the lock', async () => {
      const express = app.getHttpAdapter().getInstance() as {
        set(name: string, value: unknown): void;
      };
      const email = demoEmail(2, 'gad');
      const from = (ip: string, password: string) =>
        attempt(email, password).set('X-Forwarded-For', ip);
      express.set('trust proxy', 1);
      try {
        for (let i = 1; i <= 10; i++) {
          await from(`2001:db8:5:6::${i.toString(16)}`, 'wrong-password').expect(
            401,
          );
          await clearMinuteWindows();
        }
        await from('2001:db8:5:6:ffff::1', PASSWORD).expect(429);
        await from('2001:db8:5:7::1', PASSWORD).expect(200);
      } finally {
        express.set('trust proxy', 0);
        await connection
          .collection('loginAttempts')
          .deleteMany({ _id: /^(lock|acct):/ as never });
      }
    });

    it('ROLE-4: a link made before a role change no longer works', async () => {
      const head = await signIn(demoEmail(2, 'head'));
      const email = 'kept.link@test.local';
      const invited = await head
        .post(`${API}/users/invite`)
        .send({ email, name: 'Kept', roles: ['ADMIN'] })
        .expect(201);
      const id = invited.body.user.id as string;
      const kept = inviteToken(invited.body.inviteUrl);

      await head
        .patch(`${API}/users/${id}`)
        .send({ roles: ['GA_HEAD'] })
        .expect(200);
      await http()
        .post(`${API}/invites/accept`)
        .send({ token: kept, password: PASSWORD })
        .expect(404);

      const resent = await head.post(`${API}/users/${id}/invite`).expect(200);
      await http()
        .post(`${API}/invites/accept`)
        .send({ token: inviteToken(resent.body.inviteUrl), password: PASSWORD })
        .expect(201);

      const reset = await head
        .post(`${API}/users/${id}/password-reset`)
        .expect(200);
      await head
        .patch(`${API}/users/${id}`)
        .send({ roles: ['ADMIN'] })
        .expect(200);
      await http()
        .post(`${API}/auth/password/reset`)
        .send({
          token: reset.body.resetUrl.split('/reset-password/')[1],
          password: PASSWORD,
        })
        .expect(404);
    });

    it('users.manage cannot widen its own access', async () => {
      const email = demoEmail(2, 'admin');
      const admin = await signIn(email);
      const me = (await admin.get(`${API}/me`).expect(200)).body.user;
      const refused = await admin
        .patch(`${API}/users/${me.id}`)
        .send({ roles: ['ADMIN', 'MARKETING'] })
        .expect(403);
      expect(refused.body).toEqual({ error: 'forbidden' });
      await admin
        .patch(`${API}/users/${me.id}`)
        .send({ name: 'Admin renamed' })
        .expect(200);
    });

    it('an empty permissions request cannot wipe every grant', async () => {
      const head = await signIn(demoEmail(2, 'head'));
      await head.put(`${API}/permissions`).send({}).expect(400);
    });

    it('a made-up link is refused before any password hashing', async () => {
      const started = Date.now();
      await http()
        .post(`${API}/auth/password/reset`)
        .send({ token: 'x'.repeat(43), password: PASSWORD })
        .expect(404);
      await http()
        .post(`${API}/invites/accept`)
        .send({ token: 'x'.repeat(43), password: PASSWORD })
        .expect(404);
      expect(Date.now() - started).toBeLessThan(100);
    });

    it('USER-18: refuses cross-site requests however the browser labels them', async () => {
      const post = () =>
        http()
          .post(`${API}/auth/sign-in/email`)
          .send({ email: demoEmail(1, 'fc'), password: PASSWORD });
      await post().set('Origin', 'null').expect(403);
      await post().set('Sec-Fetch-Site', 'cross-site').expect(403);
      await post().set('Sec-Fetch-Site', 'same-site').expect(403);
      await post().set('Origin', process.env.APP_URL!).expect(200);
    });

    it('never answers another origin with CORS permission', async () => {
      const res = await http()
        .get(`${API}/health`)
        .set('Origin', 'https://evil.example');
      expect(res.get('Access-Control-Allow-Origin')).toBeUndefined();
    });

    it('responses are not cacheable and reveal no framework', async () => {
      const agent = await signIn(demoEmail(1, 'fc'));
      const res = await agent.get(`${API}/me`).expect(200);
      expect(res.get('Cache-Control')).toBe('no-store');
      expect(res.get('X-Powered-By')).toBeUndefined();
      expect(res.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('sessions: signing in again replaces the old one; the count per user is capped', async () => {
      const email = demoEmail(1, 'um');
      const count = async () => {
        const users = await connection.collection('users').findOne({ email });
        return connection
          .collection('sessions')
          .countDocuments({ userId: users!._id });
      };
      await connection.collection('sessions').deleteMany({});

      const agent = request.agent(app.getHttpServer());
      await agent
        .post(`${API}/auth/sign-in/email`)
        .send({ email, password: PASSWORD })
        .expect(200);
      await agent
        .post(`${API}/auth/sign-in/email`)
        .send({ email, password: PASSWORD })
        .expect(200);
      expect(await count()).toBe(1);

      for (let i = 0; i < 12; i++) await attempt(email, PASSWORD).expect(200);
      expect(await count()).toBeLessThanOrEqual(10);
    });

    it('sessions: renewal cannot pass the absolute limit', async () => {
      const email = demoEmail(1, 'marketing');
      const agent = await signIn(email);
      const user = await connection.collection('users').findOne({ email });
      const absolute = new Date(Date.now() + 2 * 86_400_000);
      await connection.collection('sessions').updateMany(
        { userId: user!._id },
        {
          $set: {
            expiresAt: new Date(Date.now() + 3_600_000),
            absoluteExpiresAt: absolute,
          },
        },
      );
      await agent.get(`${API}/me`).expect(200);
      const session = await connection
        .collection('sessions')
        .findOne({ userId: user!._id });
      expect(session!.expiresAt.getTime()).toBeLessThanOrEqual(
        absolute.getTime(),
      );
      expect(session!.expiresAt.getTime()).toBeGreaterThan(
        Date.now() + 3_600_000,
      );
    });

    it('sign-out-others ends other devices and keeps this one', async () => {
      const email = demoEmail(1, 'admin');
      const here = await signIn(email);
      const there = await signIn(email);
      await here.post(`${API}/auth/sign-out-others`).expect(204);
      await here.get(`${API}/me`).expect(200);
      await there.get(`${API}/me`).expect(401);
    });

    it('USER-4: weak passwords are refused everywhere, without using up the link', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const email = 'weak.password@test.local';
      const invited = await head
        .post(`${API}/users/invite`)
        .send({ email, name: 'Weak', roles: ['ADMIN'] })
        .expect(201);
      const token = inviteToken(invited.body.inviteUrl);

      const weak = await http()
        .post(`${API}/invites/accept`)
        .send({ token, password: '12345678' })
        .expect(400);
      expect(weak.body.error).toBe('password_too_weak');
      await http()
        .post(`${API}/invites/accept`)
        .send({ token, password: 'xx-weak.password-99' })
        .expect(400);

      const agent = request.agent(app.getHttpServer());
      await agent
        .post(`${API}/invites/accept`)
        .send({ token, password: PASSWORD })
        .expect(201);
      await agent
        .post(`${API}/auth/password/change`)
        .send({ currentPassword: PASSWORD, newPassword: 'password123' })
        .expect(400);
      await head
        .post(`${API}/users/${invited.body.user.id}/password`)
        .send({ password: 'password123' })
        .expect(400);
    });

    it('limits what a client can make the server store or parse', async () => {
      const agent = http()
        .post(`${API}/auth/sign-in/email`)
        .set('User-Agent', 'x'.repeat(5000))
        .send({ email: 'long.agent@test.local', password: 'wrong-password' });
      await agent.expect(401);
      const event = await connection
        .collection('auditEvents')
        .find({ action: 'LOGIN_FAILED' })
        .sort({ at: -1 })
        .limit(1)
        .next();
      expect(event!.userAgent.length).toBeLessThanOrEqual(256);

      const big = await http()
        .post(`${API}/auth/sign-in/email`)
        .send({ email: 'a@test.local', password: 'x'.repeat(200_000) })
        .expect(413);
      expect(big.body).toEqual({ error: 'invalid_input' });
    });
  });

  describe('AUD: audit trail', () => {
    it('AUD-5: filters by the email of the person who acted, inside this GA only', async () => {
      const email = demoEmail(1, 'head');
      const head = await signIn(email);
      const list = async (query: Record<string, string | number>) =>
        (await head.get(`${API}/audit`).query(query).expect(200)).body;

      const exact = await list({ email, pageSize: 50 });
      expect(exact.total).toBeGreaterThan(0);
      for (const event of exact.items) expect(event.actor.email).toBe(email);

      // Part of an address, in any case, gives the same people
      const partial = await list({
        email: `  ${email.split('@')[0].toUpperCase()}@ `,
        pageSize: 50,
      });
      expect(partial.total).toBe(exact.total);
      const withAction = await list({ email, action: 'LOGIN', pageSize: 50 });
      expect(withAction.total).toBeGreaterThan(0);
      for (const event of withAction.items) expect(event.action).toBe('LOGIN');

      // The filter is a literal text, not a pattern
      expect((await list({ email: '.*' })).total).toBe(0);
      expect((await list({ email: 'nobody@nowhere' })).items).toEqual([]);

      // TEN-7: GA-2's people, and DLVN staff who appear in this log by role, cannot be found by email
      expect((await list({ email: demoEmail(2, 'head') })).total).toBe(0);
      expect(
        (await list({ action: 'CROSS_TENANT_READ' })).total,
      ).toBeGreaterThan(0);
      expect(
        (await list({ email: process.env.PLATFORM_ADMIN_EMAIL! })).total,
      ).toBe(0);

      await head.get(`${API}/audit`).query({ 'email[$ne]': 'x' }).expect(400);
      await head
        .get(`${API}/audit`)
        .query({ email: 'x'.repeat(255) })
        .expect(400);
    });

    it('AUD-5: filters by IP and by role, without exposing DLVN staff', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const list = async (query: Record<string, string | number>) =>
        (await head.get(`${API}/audit`).query(query).expect(200)).body;

      const [sample] = (await list({ action: 'LOGIN' })).items;
      const part = sample.ip.slice(-4);
      const byIp = await list({ ip: part, pageSize: 50 });
      expect(byIp.total).toBeGreaterThan(0);
      for (const event of byIp.items) expect(event.ip).toContain(part);
      expect((await list({ ip: '203.0.113.200' })).total).toBe(0);
      expect((await list({ ip: '.*' })).total).toBe(0);

      // DLVN staff rows carry an IP that this list hides; searching must not confirm it
      expect(
        (await list({ action: 'CROSS_TENANT_READ' })).total,
      ).toBeGreaterThan(0);
      expect((await list({ action: 'CROSS_TENANT_READ', ip: ':' })).total).toBe(
        0,
      );
      expect((await list({ action: 'CROSS_TENANT_READ', ip: '1' })).total).toBe(
        0,
      );

      const byRole = await list({ role: 'GA_HEAD', pageSize: 50 });
      expect(byRole.total).toBeGreaterThan(0);
      for (const event of byRole.items) {
        expect(event.actor.email).toBe(demoEmail(1, 'head'));
      }
      const both = await list({ role: 'GA_HEAD', action: 'LOGIN', ip: part });
      expect(both.total).toBeGreaterThan(0);
      expect((await list({ role: 'PLATFORM_ADMIN' })).total).toBe(0);
      await head.get(`${API}/audit`).query({ role: 'BOSS' }).expect(400);
      await head
        .get(`${API}/audit`)
        .query({ ip: 'x'.repeat(46) })
        .expect(400);
    });

    it('users list: filters by role and sorts by last sign-in', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const list = async (query: Record<string, string | number>) =>
        (await head.get(`${API}/users`).query(query).expect(200)).body
          .items as {
          email: string;
          roles: string[];
          lastLoginAt: string | null;
        }[];

      const managers = await list({ role: 'BM', pageSize: 50 });
      expect(managers.length).toBeGreaterThan(0);
      for (const user of managers) expect(user.roles).toContain('BM');
      // TEN-7: no other GA in the result
      for (const user of managers) expect(user.email).not.toContain('@ga2.');

      const stamp = (user: { lastLoginAt: string | null }) =>
        user.lastLoginAt ? new Date(user.lastLoginAt).getTime() : 0;
      const latest = (await list({ order: 'desc', pageSize: 50 })).map(stamp);
      expect(latest).toEqual([...latest].sort((a, b) => b - a));
      const earliest = (await list({ order: 'asc', pageSize: 50 })).map(stamp);
      expect(earliest).toEqual([...earliest].sort((a, b) => a - b));
      await head.get(`${API}/users`).query({ order: 'up' }).expect(400);
    });

    it('tenants list: filters by status for the platform only', async () => {
      const admin = await signIn(
        process.env.PLATFORM_ADMIN_EMAIL!,
        process.env.PLATFORM_ADMIN_PASSWORD!,
      );
      const list = async (status: string) =>
        (
          await admin
            .get(`${API}/platform/tenants`)
            .query({ status, pageSize: 50 })
            .expect(200)
        ).body.items as {
          status: string;
        }[];
      const active = await list('active');
      expect(active.length).toBeGreaterThan(0);
      for (const tenant of active) expect(tenant.status).toBe('active');
      for (const tenant of await list('suspended'))
        expect(tenant.status).toBe('suspended');
      await admin
        .get(`${API}/platform/tenants`)
        .query({ status: 'gone' })
        .expect(400);

      const head = await signIn(demoEmail(1, 'head'));
      await head
        .get(`${API}/platform/tenants`)
        .query({ status: 'active' })
        .expect(403);
    });

    it('AUD-5: sorts by time in both directions, with stable pages', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const list = async (query: Record<string, string | number>) =>
        (await head.get(`${API}/audit`).query(query).expect(200)).body
          .items as { id: string; at: string }[];

      const newest = await list({ pageSize: 50 });
      expect(await list({ order: 'desc', pageSize: 50 })).toEqual(newest);
      const times = newest.map((event) => new Date(event.at).getTime());
      expect(times).toEqual([...times].sort((a, b) => b - a));

      const oldest = await list({ order: 'asc', pageSize: 50 });
      const oldTimes = oldest.map((event) => new Date(event.at).getTime());
      expect(oldTimes).toEqual([...oldTimes].sort((a, b) => a - b));
      expect(oldest[0].id).not.toBe(newest[0].id);

      const pages = [
        ...(await list({ order: 'asc', pageSize: 10 })),
        ...(await list({ order: 'asc', page: 2, pageSize: 10 })),
      ];
      expect(pages.map((event) => event.id)).toEqual(
        oldest.slice(0, 20).map((event) => event.id),
      );

      await head.get(`${API}/audit`).query({ order: 'sideways' }).expect(400);
    });

    it('AUD-1: the chain links every event to the previous hash of its tenant', async () => {
      const events = await connection
        .collection('auditEvents')
        .find({ tenantId: null })
        .sort({ at: 1, _id: 1 })
        .toArray();
      expect(events.length).toBeGreaterThan(0);
      const hashes = new Set(events.map((event) => event.hash));
      expect(hashes.size).toBe(events.length);
      for (const event of events.slice(1))
        expect(hashes.has(event.prevHash)).toBe(true);
    });

    it('AUD-1: audit events cannot be changed through the API role (section 22.4)', async () => {
      const tenantDb = app.get(TenantDb);
      const { id: tenantId } = (
        await ownerDb().query<{ id: string }>(
          `SELECT id FROM tenants WHERE ga_code = 'GA-HN'`,
        )
      ).rows[0];
      for (const change of [
        `UPDATE audit_events SET action = 'LOGIN' WHERE tenant_id = $1`,
        `DELETE FROM audit_events WHERE tenant_id = $1`,
      ])
        await expect(
          tenantDb.run({ tenantId }, (db) => db.query(change, [tenantId])),
        ).rejects.toThrow(/permission denied/);
    });

    it('UI-3: each audit line names who acted and on whom, inside the tenant only', async () => {
      const head = await signIn(demoEmail(1, 'head'));
      const email = 'audited.user@test.local';
      const invited = await head
        .post(`${API}/users/invite`)
        .send({ email, name: 'Audited User', roles: ['ADMIN'] })
        .expect(201);
      const list = async (query: Record<string, string>) =>
        (await head.get(`${API}/audit`).query(query).expect(200)).body.items;

      const created = (await list({ action: 'CREATE', entity: 'user' }))[0];
      expect(created.actor).toEqual({
        kind: 'user',
        name: 'Chủ GA 1',
        email: demoEmail(1, 'head'),
      });
      expect(created.target).toEqual({
        kind: 'user',
        name: 'Audited User',
        email,
      });

      await head.delete(`${API}/users/${invited.body.user.id}`).expect(204);
      const deleted = (await list({ action: 'DELETE', entity: 'user' }))[0];
      expect(deleted.target).toEqual({ kind: 'deleted' });

      // DLVN staff are shown by role: a GA must not learn their names (see TEN-6)
      const admin = await signIn(
        process.env.PLATFORM_ADMIN_EMAIL!,
        process.env.PLATFORM_ADMIN_PASSWORD!,
      );
      const tenants = await admin
        .get(`${API}/platform/tenants`)
        .query({ q: 'GA-HN' })
        .expect(200);
      await admin
        .get(`${API}/platform/tenants/${tenants.body.items[0].id}/users`)
        .expect(200);
      const read = (await list({ action: 'CROSS_TENANT_READ' }))[0];
      expect(read.actor).toEqual({ kind: 'platform' });
      expect(JSON.stringify(read)).not.toContain(
        process.env.PLATFORM_ADMIN_EMAIL!,
      );

      // TEN-3: another GA sees none of this
      const other = await signIn(demoEmail(2, 'head'));
      const otherItems = (
        await other.get(`${API}/audit`).query({ pageSize: 50 }).expect(200)
      ).body.items;
      expect(JSON.stringify(otherItems)).not.toContain(email);
      expect(JSON.stringify(otherItems)).not.toContain(demoEmail(1, 'head'));
    });

    it('AUD-4: audit metadata never holds passwords or hashes', async () => {
      const events = await connection
        .collection('auditEvents')
        .find({})
        .toArray();
      expect(JSON.stringify(events)).not.toMatch(
        /passwordHash|tokenHash|demo-password/,
      );
    });
  });
});
