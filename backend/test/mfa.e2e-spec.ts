import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import { base32Decode, timeStep, totpAt } from '../src/common/totp.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
type Agent = ReturnType<typeof request.agent>;

/** A code for the current step plus `ahead` (0 = now, 1 = the next 30 seconds). */
const codeFor = (secret: string, ahead = 0) =>
  totpAt(base32Decode(secret), timeStep(Date.now()) + ahead);

/** USER-16: TOTP MFA, mandatory for GA_HEAD, ADMIN and PLATFORM_ADMIN. */
describe('MFA (e2e)', () => {
  let app: INestApplication;
  let secret: string;
  let recovery: string[];
  let head: Agent;

  const signIn = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    const response = await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return { agent, body: response.body as Record<string, unknown> };
  };
  const userOf = (key: string) =>
    connection.collection('users').findOne({ email: demoEmail(1, key) });

  beforeAll(async () => {
    // This suite tests enforcement; the others run with it off (vitest.config.int.ts)
    process.env.MFA_ENFORCE = 'true';
    app = await startApp();
    await seedDemoData(app, PASSWORD);
  });

  afterAll(async () => {
    process.env.MFA_ENFORCE = 'false';
    await stopApp(app);
  });

  it('USER-16: a GA_HEAD without MFA can only set it up; an agent is not forced', async () => {
    const { agent: head, body } = await signIn('head');
    expect(body.mfa).toEqual({
      enabled: false,
      required: true,
      setupRequired: true,
    });
    const blocked = await head.get(`${API}/agents`).expect(403);
    expect(blocked.body.error).toBe('mfa_setup_required');
    expect(
      (await head.get(`${API}/me`).expect(200)).body.mfa.setupRequired,
    ).toBe(true);

    const { agent: fc, body: fcMe } = await signIn('fc');
    expect(fcMe.mfa).toEqual({
      enabled: false,
      required: false,
      setupRequired: false,
    });
    await fc.get(`${API}/agents`).expect(200);
  });

  it('USER-16: setting up needs a first code; recovery codes are shown once; the secret is stored encrypted', async () => {
    const { agent: head } = await signIn('head');
    const setup = (await head.post(`${API}/auth/mfa/setup`).expect(200)).body;
    secret = setup.secret;
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(setup.otpauthUrl).toContain('head%40ga1.gacrm.local');
    const wrong = await head
      .post(`${API}/auth/mfa/enable`)
      .send({ code: '000000' })
      .expect(400);
    expect(wrong.body.error).toBe('invalid_code');
    recovery = (
      await head
        .post(`${API}/auth/mfa/enable`)
        .send({ code: codeFor(secret) })
        .expect(200)
    ).body.recoveryCodes;
    expect(recovery).toHaveLength(10);
    await head.get(`${API}/agents`).expect(200);

    const stored = await connection
      .collection('users')
      .findOne({ email: demoEmail(1, 'head') });
    expect(stored!.mfaEnabled).toBe(true);
    expect(JSON.stringify(stored)).not.toContain(secret);
    expect(JSON.stringify(stored)).not.toContain(recovery[0]);
    expect(
      await connection
        .collection('auditEvents')
        .countDocuments({ entity: 'mfa', 'meta.mfa': 'enabled' }),
    ).toBe(1);
  });

  it('USER-16: after the password the session waits for the code; a code is used once', async () => {
    const { agent, body } = await signIn('head');
    expect(body).toEqual({ mfaRequired: true });
    expect((await agent.get(`${API}/me`).expect(401)).body.error).toBe(
      'mfa_required',
    );
    await agent.get(`${API}/agents`).expect(401);
    await agent
      .post(`${API}/auth/mfa/verify`)
      .send({ code: '123456' })
      .expect(400);
    // The step used to enable is spent, so the next one is used here
    const code = codeFor(secret, 1);
    await agent.post(`${API}/auth/mfa/verify`).send({ code }).expect(204);
    await agent.get(`${API}/agents`).expect(200);

    const { agent: again } = await signIn('head');
    const replay = await again
      .post(`${API}/auth/mfa/verify`)
      .send({ code })
      .expect(400);
    expect(replay.body.error).toBe('invalid_code');
    // Signing out works while waiting
    await again.post(`${API}/auth/sign-out`).expect(204);
  });

  it('USER-16: a recovery code opens the session once', async () => {
    const { agent } = await signIn('head');
    await agent
      .post(`${API}/auth/mfa/verify`)
      .send({ code: recovery[0].toUpperCase() })
      .expect(204);
    const { agent: second } = await signIn('head');
    await second
      .post(`${API}/auth/mfa/verify`)
      .send({ code: recovery[0] })
      .expect(400);
    await second
      .post(`${API}/auth/mfa/verify`)
      .send({ code: recovery[1] })
      .expect(204);
    expect(
      (await second.get(`${API}/auth/mfa`).expect(200)).body,
    ).toMatchObject({ enabled: true, required: true, recoveryCodesLeft: 8 });
    // Mandatory for the role
    const off = await second
      .post(`${API}/auth/mfa/disable`)
      .send({ code: recovery[2] })
      .expect(409);
    expect(off.body.error).toBe('mfa_mandatory');
  });

  it('USER-16: an agent may turn MFA on and off', async () => {
    const { agent: fc } = await signIn('fc');
    const fcSecret = (await fc.post(`${API}/auth/mfa/setup`).expect(200)).body
      .secret as string;
    await fc
      .post(`${API}/auth/mfa/enable`)
      .send({ code: codeFor(fcSecret) })
      .expect(200);
    await fc
      .post(`${API}/auth/mfa/disable`)
      .send({ code: codeFor(fcSecret, 1) })
      .expect(204);
    expect((await userOf('fc'))!.mfaEnabled).toBe(false);
  });

  it('USER-16: an admin resets a lost phone; the user is signed out and sets MFA up again (TEN-7)', async () => {
    const { agent: admin, body } = await signIn('admin');
    // ADMIN is a privileged role too
    expect(body.mfa).toMatchObject({ setupRequired: true });
    const adminSecret = (await admin.post(`${API}/auth/mfa/setup`).expect(200))
      .body.secret as string;
    await admin
      .post(`${API}/auth/mfa/enable`)
      .send({ code: codeFor(adminSecret) })
      .expect(200);

    const head = (await userOf('head'))!;
    const { agent: other } = await signIn('head', 2);
    const otherSetup = (await other.post(`${API}/auth/mfa/setup`).expect(200))
      .body.secret as string;
    await other
      .post(`${API}/auth/mfa/enable`)
      .send({ code: codeFor(otherSetup) })
      .expect(200);
    await other
      .post(`${API}/users/${head._id.toString()}/mfa/reset`)
      .expect(404);

    await admin
      .post(`${API}/users/${head._id.toString()}/mfa/reset`)
      .expect(204);
    const after = (await userOf('head'))!;
    expect(after.mfaEnabled).toBe(false);
    expect(after.mfaSecret).toBeUndefined();
    expect(
      await connection
        .collection('sessions')
        .countDocuments({ userId: head._id }),
    ).toBe(0);
    const { body: fresh } = await signIn('head');
    expect(fresh.mfa).toMatchObject({ setupRequired: true });
  });

  it('USER-16 + section 5.2: a GA can require MFA of everyone', async () => {
    // The head was reset above, so it sets MFA up again first
    const { agent } = await signIn('head');
    const fresh = (await agent.post(`${API}/auth/mfa/setup`).expect(200)).body
      .secret as string;
    await agent
      .post(`${API}/auth/mfa/enable`)
      .send({ code: codeFor(fresh) })
      .expect(200);
    head = agent;
    const view = (await head.get(`${API}/settings`).expect(200)).body;
    expect(view.security).toEqual({ mfaForAll: false });
    await head
      .put(`${API}/settings`)
      .send({ version: view.version, security: { mfaForAll: true } })
      .expect(204);
    const { body } = await signIn('fc');
    expect(body.mfa).toEqual({
      enabled: false,
      required: true,
      setupRequired: true,
    });
  });

  it('USER-10: disabling a user clears their MFA', async () => {
    const um = (await userOf('um'))!;
    await connection.collection('users').updateOne(
      { _id: um._id },
      {
        $set: {
          mfaEnabled: true,
          mfaSecret: 'x.y',
          mfaRecoveryCodes: ['h'],
          mfaLastStep: 1,
        },
      },
    );
    await head.post(`${API}/users/${um._id.toString()}/disable`).expect(204);
    const after = (await userOf('um'))!;
    expect(after).toMatchObject({ status: 'DISABLED', mfaEnabled: false });
    expect(after.mfaSecret).toBeUndefined();
    expect(after.mfaRecoveryCodes).toBeUndefined();
  });
  it('USER-16: wrong codes count like wrong passwords and lock for a while', async () => {
    const { agent } = await signIn('admin');
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 7; attempt += 1)
      statuses.push(
        (await agent.post(`${API}/auth/mfa/verify`).send({ code: '000000' }))
          .status,
      );
    expect(statuses.slice(0, 5)).toEqual([400, 400, 400, 400, 400]);
    expect(statuses.at(-1)).toBe(429);
  });
});
