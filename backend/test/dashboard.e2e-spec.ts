import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { vi } from 'vitest';
import { startApp, stopApp } from './support/app.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';
import { RealtimeEvent } from '../src/modules/realtime/realtime.events.js';
import { DASHBOARD_THROTTLE_MS, RealtimeService } from '../src/modules/realtime/realtime.service.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const FC = '00100004';
type Agent = ReturnType<typeof request.agent>;
type Dashboard = {
  available: boolean;
  scope: 'TENANT' | 'LINE' | 'OWN';
  days: number;
  totals: { openLeads: number; pipelineValueVnd: number; newLeads: number; contacted: number; won: number };
  pipeline: { stage: string; count: number; valueVnd: number }[];
  daily: { day: string; created: number; contacted: number; won: number; open: number; valueVnd: number }[];
  previous: { openLeads: number; pipelineValueVnd: number; newLeads: number; contacted: number; won: number };
  sources: { code: string | null; label: string | null; count: number; won: number }[];
  agents: { agentCode: string | null; name: string | null; open: number; contacted: number }[] | null;
};

/** Home page charts: the leads of the person's report scope (RPT-3), refreshed by `dashboard.changed`. */
describe('Home dashboard (e2e)', () => {
  let app: INestApplication;
  let head: Agent;
  let fc: Agent;
  let um: Agent;
  let head2: Agent;
  let phone = 913_500_000;

  const as = async (key: string, ga = 1) => {
    const agent = request.agent(app.getHttpServer());
    await agent.post(`${API}/auth/sign-in/email`).send({ email: demoEmail(ga, key), password: PASSWORD }).expect(200);
    return agent;
  };
  const dashboard = async (agent: Agent, days?: number) =>
    (await agent.get(`${API}/reports/dashboard`).query(days ? { days } : {}).expect(200)).body as Dashboard;
  const lead = async (agentCode?: string) => {
    const { body } = await head
      .post(`${API}/leads`)
      .send({ fullName: `Khách ${phone}`, phone: `0${phone++}`, source: 'Facebook', consent: true })
      .expect(201);
    if (agentCode) await head.post(`${API}/leads/assign`).send({ leadIds: [body.id], agentCode }).expect(201);
    return body.id as string;
  };

  beforeAll(async () => {
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    [head, fc, um, head2] = await Promise.all([as('head'), as('fc'), as('um'), as('head', 2)]);
  });

  afterAll(async () => {
    await stopApp(app);
  });

  it('the GA head sees the whole GA: every pipeline stage in order, one point per day, sources and agents', async () => {
    const before = await dashboard(head);
    await lead(FC);
    const after = await dashboard(head);

    expect(after).toEqual(expect.objectContaining({ available: true, scope: 'TENANT', days: 30 }));
    expect(after.pipeline.map((row) => row.stage)).toEqual(['NEW', 'CONTACTED', 'APPOINTMENT', 'MET', 'PROPOSAL', 'SUBMITTED']);
    expect(after.daily).toHaveLength(30);
    expect(after.totals.openLeads).toBe(before.totals.openLeads + 1);
    expect(after.totals.newLeads).toBe(before.totals.newLeads + 1);
    expect(after.daily.at(-1)!.created).toBe(before.daily.at(-1)!.created + 1);
    expect(after.sources.find((row) => row.label === 'Facebook')?.count).toBeGreaterThan(0);
    expect(after.agents?.find((row) => row.agentCode === FC)?.open).toBeGreaterThan(0);
    // Counts only: nothing on the dashboard names or reaches a lead
    expect(JSON.stringify(after)).not.toMatch(/Khách 9135|0913/);
  });

  it('RPT-3: a FC sees their own leads only and has no agent comparison; a UM sees their line', async () => {
    const own = await dashboard(fc);
    expect(own.scope).toBe('OWN');
    expect(own.agents).toBeNull();
    const before = own.totals.openLeads;
    await lead();
    expect((await dashboard(fc)).totals.openLeads).toBe(before);
    await lead(FC);
    expect((await dashboard(fc)).totals.openLeads).toBe(before + 1);

    const line = await dashboard(um);
    expect(line.scope).toBe('LINE');
    expect(line.agents?.map((row) => row.agentCode)).toContain(FC);
    // The unassigned leads belong to the whole GA, not to a line
    expect(line.agents?.some((row) => row.agentCode === null)).toBe(false);
  });

  it('cards: each day carries the open leads at its end, worked back from stage changes; the period before is there to compare', async () => {
    const id = await lead(FC);
    const before = await dashboard(head, 7);
    const today = before.daily.at(-1)!;
    expect(today.open).toBe(before.totals.openLeads);
    expect(today.valueVnd).toBe(before.totals.pipelineValueVnd);
    expect(before.previous).toEqual(expect.objectContaining({ openLeads: expect.any(Number), newLeads: expect.any(Number) }));

    await head.patch(`${API}/leads/${id}`).send({ stage: 'LOST', lostReason: 'Không còn nhu cầu' }).expect(200);
    const after = await dashboard(head, 7);
    // Leaving the pipeline today lowers today only; earlier days keep what they were
    expect(after.daily.at(-1)!.open).toBe(today.open - 1);
    expect(after.daily.at(-2)!.open).toBe(before.daily.at(-2)!.open);
    expect(after.previous.openLeads).toBe(before.previous.openLeads);
    expect(after.totals.newLeads).toBe(after.daily.reduce((sum, day) => sum + day.created, 0));
  });

  it('the period is 7, 30 or 90 days; anything else is refused', async () => {
    expect((await dashboard(head, 7)).daily).toHaveLength(7);
    expect((await dashboard(head, 90)).daily).toHaveLength(90);
    await head.get(`${API}/reports/dashboard`).query({ days: 5 }).expect(400);
  });

  it('TEN-7: another GA counts only its own leads', async () => {
    const before = (await dashboard(head2)).totals.newLeads;
    await lead(FC);
    expect((await dashboard(head2)).totals.newLeads).toBe(before);
  });

  it('a lead change tells the GA once it commits, at most once every 5 seconds', async () => {
    const realtime = app.get(RealtimeService);
    const touched = vi.spyOn(realtime, 'touchDashboard');
    const sent = vi.spyOn(realtime, 'toTenant');
    try {
      await lead(FC);
      await vi.waitFor(() => expect(touched).toHaveBeenCalled());
      expect(touched.mock.calls[0][0]).toEqual(expect.any(String));

      // A GA with nothing pending, so the throttle starts fresh under fake timers
      const tenantId = '00000000-0000-7000-8000-000000000001';
      vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
      sent.mockClear();
      vi.advanceTimersByTime(DASHBOARD_THROTTLE_MS);
      realtime.touchDashboard(tenantId);
      realtime.touchDashboard(tenantId);
      realtime.touchDashboard(tenantId);
      expect(sent).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(DASHBOARD_THROTTLE_MS);
      expect(sent).toHaveBeenCalledTimes(2);
      expect(sent).toHaveBeenLastCalledWith(tenantId, RealtimeEvent.DashboardChanged);
    } finally {
      vi.useRealTimers();
      touched.mockRestore();
      sent.mockRestore();
    }
  });
});
