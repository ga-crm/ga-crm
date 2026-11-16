import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { connection } from './support/collections.js';
import {
  AiProviderClient,
  AiProviderFailure,
} from '../src/modules/ai/ai-provider.client.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const GOOD = 'AIzaGoodKey-1234';
const PLATFORM = 'platform-qwen-key-9876';
type Agent = ReturnType<typeof request.agent>;

/** Calls the fake provider received, so tests can see which key and model were used. */
const calls: { kind: string; provider: string; key: string; model?: string }[] =
  [];
const fakeClient = {
  listModels: (provider: string, key: string) => {
    calls.push({ kind: 'models', provider, key });
    if (key !== GOOD && key !== PLATFORM)
      return Promise.reject(new AiProviderFailure('ai_key_invalid', 401));
    return Promise.resolve(['gemini-3.5-flash', 'gemini-3.5-flash-lite']);
  },
  ping: (provider: string, key: string, model: string) => {
    calls.push({ kind: 'ping', provider, key, model });
    if (key !== GOOD && key !== PLATFORM)
      return Promise.reject(new AiProviderFailure('ai_key_invalid', 401));
    if (model === 'gone-model')
      return Promise.reject(new AiProviderFailure('ai_model_unavailable', 404));
    return Promise.resolve();
  },
};

type Provider = {
  provider: string;
  ready: boolean;
  keySource: string | null;
  last4: string | null;
  keyUnreadable: boolean;
};

/** Section 14.4 + AI-11 to AI-17: slice 7a. */
describe('AI settings and provider keys (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let fc: Agent;
  let head2: Agent;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return agent;
  };
  const providers = async (agent: Agent) =>
    (await agent.get(`${API}/ai/admin/settings`).expect(200)).body
      .providers as Provider[];
  const one = async (agent: Agent, id: string) =>
    (await providers(agent)).find((item) => item.provider === id)!;

  beforeAll(async () => {
    process.env.AI_PLATFORM_KEY_QWEN = PLATFORM;
    app = await startApp((builder) =>
      builder.overrideProvider(AiProviderClient).useValue(fakeClient),
    );
    await seedDemoData(app, PASSWORD);
    [head, fc, head2] = await Promise.all([
      as('head'),
      as('fc'),
      as('head', 2),
    ]);
  });

  afterAll(async () => {
    delete process.env.AI_PLATFORM_KEY_QWEN;
    await stopApp(app);
  });

  it('AI-13 + AI-11: a GA starts with AI off and suggested models by tier', async () => {
    const { body } = await head.get(`${API}/ai/admin/settings`).expect(200);
    expect(body).toMatchObject({
      enabled: false,
      monthlyTokenLimit: 0,
      usedThisMonth: 0,
      tiers: {
        FAST: { provider: 'gemini', model: 'gemini-3.5-flash-lite' },
        DEEP: { provider: 'gemini', model: 'gemini-3.1-pro-preview' },
      },
    });
    expect(body.providers.map((item: Provider) => item.provider)).toEqual([
      'gemini',
      'deepseek',
      'qwen',
    ]);
    expect(await one(head, 'gemini')).toMatchObject({
      ready: false,
      keySource: null,
    });
    // AI-15: the platform key covers a GA without its own
    expect(await one(head, 'qwen')).toMatchObject({
      ready: true,
      keySource: 'PLATFORM',
      last4: null,
    });
  });

  it('PERM-4: only ai.manage reaches the AI admin routes', async () => {
    await fc.get(`${API}/ai/admin/settings`).expect(403);
    await fc
      .put(`${API}/ai/admin/keys/gemini`)
      .send({ apiKey: GOOD })
      .expect(403);
  });

  it('AI-15: a key is stored encrypted, shown as its last 4, never audited', async () => {
    await head
      .put(`${API}/ai/admin/keys/gemini`)
      .send({ apiKey: 'short' })
      .expect(400);
    await head
      .put(`${API}/ai/admin/keys/openai`)
      .send({ apiKey: GOOD })
      .expect(404);
    const { body } = await head
      .put(`${API}/ai/admin/keys/gemini`)
      .send({ apiKey: GOOD })
      .expect(200);
    expect(body).toEqual({ ok: true, last4: '1234' });
    expect(await one(head, 'gemini')).toMatchObject({
      ready: true,
      keySource: 'GA',
      last4: '1234',
      keyUnreadable: false,
    });
    const stored = await connection
      .collection('aiProviderKeys')
      .findOne({ provider: 'gemini' });
    expect(stored!.encryptedKey).not.toContain('AIzaGood');
    const audits = await connection
      .collection('auditEvents')
      .find({ entity: 'ai_key' })
      .toArray();
    expect(audits).toHaveLength(1);
    expect(JSON.stringify(audits)).not.toContain('AIzaGood');
    expect(
      JSON.stringify((await head.get(`${API}/ai/admin/settings`)).body),
    ).not.toContain('AIzaGood');
  });

  it("TEN-7: another GA sees none of GA-1's keys", async () => {
    expect(await one(head2, 'gemini')).toMatchObject({
      ready: false,
      keySource: null,
      last4: null,
    });
  });

  it('AI-17 + AI-16: models are read with the GA key; a test pings the model in use', async () => {
    const { body } = await head
      .get(`${API}/ai/admin/keys/gemini/models`)
      .expect(200);
    expect(body.items).toEqual(['gemini-3.5-flash', 'gemini-3.5-flash-lite']);
    expect(calls.at(-1)).toMatchObject({ kind: 'models', key: GOOD });

    const test = await head
      .post(`${API}/ai/admin/keys/gemini/test`)
      .expect(200);
    expect(test.body).toEqual({ ok: true, model: 'gemini-3.5-flash-lite' });
    // The platform key is used where the GA has none
    await head.post(`${API}/ai/admin/keys/qwen/test`).expect(200);
    expect(calls.at(-1)).toMatchObject({
      kind: 'ping',
      provider: 'qwen',
      key: PLATFORM,
      model: 'qwen-flash',
    });
    const missing = await head
      .get(`${API}/ai/admin/keys/deepseek/models`)
      .expect(503);
    expect(missing.body.error).toBe('ai_provider_missing');
  });

  it('AI-16: a rejected key reads as ai_key_invalid', async () => {
    await head
      .put(`${API}/ai/admin/keys/deepseek`)
      .send({ apiKey: 'sk-wrong-key-0000' })
      .expect(200);
    const { body } = await head
      .post(`${API}/ai/admin/keys/deepseek/test`)
      .expect(400);
    expect(body.error).toBe('ai_key_invalid');
  });

  it('AI-11 + AI-13: settings are validated and audited', async () => {
    const valid = {
      enabled: true,
      tiers: {
        FAST: { provider: 'gemini', model: 'gemini-3.5-flash-lite' },
        BALANCED: { provider: 'qwen', model: 'qwen-plus' },
        DEEP: { provider: 'gemini', model: 'gone-model' },
      },
      router: { provider: 'gemini', model: 'gemini-3.5-flash-lite' },
      monthlyTokenLimit: 2_000_000,
    };
    await head
      .put(`${API}/ai/admin/settings`)
      .send({ ...valid, router: { provider: 'openai', model: 'x' } })
      .expect(400);
    await head
      .put(`${API}/ai/admin/settings`)
      .send({ ...valid, monthlyTokenLimit: -1 })
      .expect(400);
    await head.put(`${API}/ai/admin/settings`).send(valid).expect(204);
    const { body } = await head.get(`${API}/ai/admin/settings`).expect(200);
    expect(body).toMatchObject({
      enabled: true,
      monthlyTokenLimit: 2_000_000,
      tiers: valid.tiers,
    });
    const audit = await connection
      .collection('auditEvents')
      .findOne({ entity: 'ai_settings' });
    expect(audit!.meta.after.monthlyTokenLimit).toBe(2_000_000);
    expect(audit!.meta.before.enabled).toBe(false);
    // AI-16: the test uses the first tier on that provider
    const test = await head
      .post(`${API}/ai/admin/keys/gemini/test`)
      .expect(200);
    expect(test.body.model).toBe('gemini-3.5-flash-lite');
  });

  it('AI-15: a key that no longer decrypts is flagged, and deleting it falls back', async () => {
    await connection
      .collection('aiProviderKeys')
      .updateOne(
        { provider: 'gemini' },
        { $set: { encryptedKey: 'AAAA.BBBB' } },
      );
    expect(await one(head, 'gemini')).toMatchObject({
      ready: false,
      keyUnreadable: true,
      last4: '1234',
    });
    await head.delete(`${API}/ai/admin/keys/gemini`).expect(204);
    expect(await one(head, 'gemini')).toMatchObject({
      ready: false,
      keyUnreadable: false,
      last4: null,
    });
  });
});
