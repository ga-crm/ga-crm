import type { INestApplication } from '@nestjs/common';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { ownerDb } from './support/owner-db.js';
import { ObjectStorage } from '../src/core/storage/object-storage.js';
import { ChatNoticesService } from '../src/modules/chat/chat-notices.service.js';
import { PresenceService } from '../src/modules/presence/presence.service.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const APP_ORIGIN = new URL(process.env.APP_URL!).origin;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const PDF = Buffer.from('%PDF-1.7\n% hợp đồng mẫu\n');

type Message = { seq: number; body: string | null; data: { files?: { id: string; name: string; kind: string }[] } };

/** Realtime slice C4: files (K8), search, unread notices (K6). */
describe('Chat files, search and notices (e2e)', () => {
  let app: INestApplication;
  const ids: Record<string, string> = {};
  const cookies: Record<string, string> = {};
  let tenantId: string;

  const signIn = async (key: string, ga = 1) => {
    const res = await request(app.getHttpServer())
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    return ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((line) => line.split(';')[0])
      .find((pair) => pair.startsWith('crm_session='))!;
  };
  const as = (who: string) => {
    const server = request(app.getHttpServer());
    const wrap = (test: request.Test) => test.set('Cookie', cookies[who]).set('Origin', APP_ORIGIN);
    return {
      get: (path: string) => wrap(server.get(`${API}${path}`)),
      post: (path: string) => wrap(server.post(`${API}${path}`)),
      put: (path: string) => wrap(server.put(`${API}${path}`)),
      delete: (path: string) => wrap(server.delete(`${API}${path}`)),
    };
  };
  const direct = async (who: string, withWhom: string) =>
    (await as(who).post('/chat/direct').send({ userId: ids[withWhom] }).expect(201)).body.id as string;
  const send = async (who: string, id: string, body: string, extra: object = {}) =>
    (
      await as(who)
        .post(`/chat/conversations/${id}/messages`)
        .send({ clientMsgId: randomUUID(), body, ...extra })
        .expect(201)
    ).body as Message;
  const upload = (who: string, id: string, files: [Buffer, string][]) => {
    let test = as(who).post(`/chat/conversations/${id}/files`);
    for (const [content, name] of files) test = test.attach('files', content, name);
    return test;
  };
  const notices = async (key: string, type: string) =>
    (
      await ownerDb().query<{ data: Record<string, unknown>; link: string }>(
        `SELECT data, link FROM notifications WHERE user_id = $1 AND type = $2 ORDER BY created_at`,
        [ids[key], type],
      )
    ).rows;

  beforeAll(async () => {
    const redis = new Redis(process.env.REDIS_URL!);
    await redis.flushdb();
    await redis.quit();
    app = await startApp();
    await seedDemoData(app, PASSWORD);
    const { rows } = await ownerDb().query<{ id: string; email: string; tenant_id: string }>(
      `SELECT id, email, tenant_id FROM users WHERE email LIKE '%.gacrm.local'`,
    );
    for (const key of ['head', 'admin', 'bm', 'um', 'fc', 'gad'])
      ids[key] = rows.find((row) => row.email === demoEmail(1, key))!.id;
    tenantId = rows.find((row) => row.email === demoEmail(1, 'fc'))!.tenant_id;
    for (const key of ['head', 'admin', 'bm', 'um', 'fc', 'gad']) cookies[key] = await signIn(key);
    cookies.head2 = await signIn('head', 2);
  });

  afterAll(async () => {
    await stopApp(app);
  });

  describe('files (K8)', () => {
    it('sends an image and a PDF; members open them, others get 404 (TEN-7), the GA head may (K3)', async () => {
      const id = await direct('fc', 'um');
      const uploaded = (await upload('fc', id, [[PNG, 'anh-chup.png'], [PDF, 'Hợp đồng.pdf']]).expect(201)).body.items as {
        id: string;
        kind: string;
        contentType: string;
      }[];
      expect(uploaded.map((file) => [file.kind, file.contentType])).toEqual([
        ['IMAGE', 'image/png'],
        ['FILE', 'application/pdf'],
      ]);
      // Before it is sent, only the uploader can open it
      await as('um').get(`/chat/files/${uploaded[0].id}`).expect(404);

      const message = await send('fc', id, '', { fileIds: uploaded.map((file) => file.id) });
      expect(message.data.files?.map((file) => file.name)).toEqual(['anh-chup.png', 'Hợp đồng.pdf']);

      const image = await as('um').get(`/chat/files/${uploaded[0].id}`).buffer(true).expect(200);
      expect(image.headers['content-type']).toBe('image/png');
      expect(image.headers['content-disposition']).toMatch(/^inline/);
      expect(image.headers['content-security-policy']).toContain('sandbox');
      expect(Buffer.compare(image.body as Buffer, PNG)).toBe(0);
      const pdf = await as('um').get(`/chat/files/${uploaded[1].id}`).buffer(true).expect(200);
      expect(pdf.headers['content-disposition']).toContain("attachment; filename=\"Hop dong.pdf\"; filename*=UTF-8''");

      await as('bm').get(`/chat/files/${uploaded[0].id}`).expect(404);
      await as('head2').get(`/chat/files/${uploaded[0].id}`).expect(404);
      await as('head').get(`/chat/files/${uploaded[0].id}`).expect(200);
    });

    it('refuses other types whatever their name, oversized files, too many files and non-members', async () => {
      const id = await direct('fc', 'gad');
      const svg = await upload('fc', id, [[Buffer.from('<svg onload="alert(1)"/>'), 'logo.png']]).expect(415);
      expect(svg.body.error).toBe('chat_file_type');
      const big = await upload('fc', id, [[Buffer.concat([PDF, Buffer.alloc(10 * 1024 * 1024)]), 'lon.pdf']]).expect(413);
      expect(big.body.error).toBe('chat_file_too_large');
      const many = await upload('fc', id, Array.from({ length: 6 }, (_, index): [Buffer, string] => [PDF, `${index}.pdf`])).expect(400);
      expect(many.body.error).toBe('chat_too_many_files');
      await upload('bm', id, [[PDF, 'a.pdf']]).expect(404);
      await upload('head2', id, [[PDF, 'a.pdf']]).expect(404);
    });

    it('a file goes only with a message of its uploader, in its conversation, once', async () => {
      const id = await direct('fc', 'admin');
      const [file] = (await upload('fc', id, [[PDF, 'a.pdf']]).expect(201)).body.items as { id: string }[];
      await as('admin')
        .post(`/chat/conversations/${id}/messages`)
        .send({ clientMsgId: randomUUID(), body: 'của người khác', fileIds: [file.id] })
        .expect(404);
      await send('fc', id, 'lần đầu', { fileIds: [file.id] });
      await as('fc')
        .post(`/chat/conversations/${id}/messages`)
        .send({ clientMsgId: randomUUID(), body: 'lần hai', fileIds: [file.id] })
        .expect(404);
      // A message needs text or a file
      await as('fc').post(`/chat/conversations/${id}/messages`).send({ clientMsgId: randomUUID(), body: '' }).expect(400);
    });

    it('PDP: recalling a message deletes its files from storage', async () => {
      const id = await direct('fc', 'bm');
      const [file] = (await upload('fc', id, [[PDF, 'cccd.pdf']]).expect(201)).body.items as { id: string }[];
      const message = await send('fc', id, 'giấy tờ', { fileIds: [file.id] });
      const { rows } = await ownerDb().query<{ storage_key: string }>(`SELECT storage_key FROM chat_files WHERE id = $1`, [file.id]);

      await as('fc').delete(`/chat/conversations/${id}/messages/${message.seq}`).expect(204);

      await as('bm').get(`/chat/files/${file.id}`).expect(404);
      await expect(app.get(ObjectStorage).get(rows[0].storage_key)).rejects.toThrow();
      const [stored] = (await as('bm').get(`/chat/conversations/${id}/messages`).expect(200)).body.items as Message[];
      expect(stored.data.files).toBeUndefined();
    });

    it('uploads never sent are removed after a day', async () => {
      const id = await direct('um', 'gad');
      const [file] = (await upload('um', id, [[PDF, 'nhap.pdf']]).expect(201)).body.items as { id: string }[];
      await ownerDb().query(`UPDATE chat_files SET created_at = now() - interval '25 hours' WHERE id = $1`, [file.id]);
      await app.get(ChatNoticesService).tick(new Date());
      const { rows } = await ownerDb().query(`SELECT 1 FROM chat_files WHERE id = $1`, [file.id]);
      expect(rows).toHaveLength(0);
    });

    it('section 5.2: uploads stop at the plan\'s storage limit', async () => {
      const id = await direct('um', 'admin');
      await ownerDb().query(`UPDATE tenants SET storage_mb = 1 WHERE id = $1`, [tenantId]);
      try {
        const res = await upload('um', id, [[Buffer.concat([PDF, Buffer.alloc(1024 * 1024)]), 'lon.pdf']]).expect(409);
        expect(res.body.error).toBe('plan_storage_limit');
      } finally {
        await ownerDb().query(`UPDATE tenants SET storage_mb = NULL WHERE id = $1`, [tenantId]);
      }
    });
  });

  describe('search', () => {
    it('finds one\'s own conversations\' messages without diacritics; not others\', not recalled ones', async () => {
      const id = await direct('bm', 'um');
      await send('bm', id, 'Khách hàng Nguyễn Văn Ánh muốn mua bảo hiểm sức khỏe');
      const recalled = await send('bm', id, 'Khách hàng cũ đã hủy hợp đồng');
      await as('bm').delete(`/chat/conversations/${id}/messages/${recalled.seq}`).expect(204);

      const found = (await as('um').get('/chat/search?q=khach hang nguyen').expect(200)).body.items as { body: string; conversationId: string }[];
      expect(found.map((item) => item.body)).toEqual(['Khách hàng Nguyễn Văn Ánh muốn mua bảo hiểm sức khỏe']);
      expect(found[0]).toEqual(expect.objectContaining({ conversationId: id, conversationTitle: 'Trưởng ban 1' }));
      expect((await as('fc').get('/chat/search?q=khach hang nguyen').expect(200)).body.items).toHaveLength(0);
      expect((await as('head2').get('/chat/search?q=khach').expect(200)).body.items).toHaveLength(0);
      // LIKE wildcards are plain characters
      expect((await as('um').get('/chat/search?q=%25%25').expect(200)).body.items).toHaveLength(0);
      await as('um').get('/chat/search?q=k').expect(400);
    });

    it('someone added to a group later does not find what was said before', async () => {
      const group = (
        await as('bm').post('/chat/groups').send({ title: 'Nhóm tìm kiếm', memberIds: [ids.um] }).expect(201)
      ).body.id as string;
      await send('bm', group, 'Mật mã phòng họp 2468');
      await as('bm').post(`/chat/conversations/${group}/members`).send({ userIds: [ids.fc] }).expect(204);
      expect((await as('fc').get('/chat/search?q=phong hop').expect(200)).body.items).toHaveLength(0);
      expect((await as('um').get('/chat/search?q=phong hop').expect(200)).body.items).toHaveLength(1);
    });
  });

  describe('unread notices (K6)', () => {
    const age = (id: string, minutes: number) =>
      ownerDb().query(`UPDATE messages SET created_at = now() - make_interval(mins => $2) WHERE conversation_id = $1`, [
        id,
        minutes,
      ]);

    it('tells a member once about messages unread for 5 minutes, and again only after new ones', async () => {
      const id = await direct('gad', 'admin');
      await send('gad', id, 'một');
      await send('gad', id, 'hai');
      const notices = app.get(ChatNoticesService);

      await notices.tick(new Date());
      expect(await noticesFor()).toHaveLength(0);

      await age(id, 6);
      await notices.tick(new Date());
      await notices.tick(new Date());
      const [notice] = await noticesFor();
      expect(await noticesFor()).toHaveLength(1);
      expect(notice).toEqual({ data: { count: 2, userId: ids.gad }, link: `/chat?c=${id}` });

      await send('gad', id, 'ba');
      await age(id, 6);
      await notices.tick(new Date());
      expect((await noticesFor()).at(-1)!.data).toEqual({ count: 1, userId: ids.gad });

      async function noticesFor() {
        return (await notices_('admin')).filter((row) => row.link === `/chat?c=${id}`);
      }
    });

    it('a muted conversation, a read one, or a member online right now gets no notice', async () => {
      const muted = await direct('um', 'head');
      await send('um', muted, 'tin nhóm im lặng');
      await as('head').put(`/chat/conversations/${muted}/prefs`).send({ muted: true }).expect(204);
      const read = await direct('fc', 'head');
      const last = await send('fc', read, 'đã đọc');
      await as('head').post(`/chat/conversations/${read}/read`).send({ seq: last.seq }).expect(204);
      const online = await direct('admin', 'head');
      await send('admin', online, 'đang online');
      await Promise.all([age(muted, 6), age(read, 6), age(online, 6)]);
      const { rows } = await ownerDb().query<{ member_no: number }>(`SELECT member_no FROM users WHERE id = $1`, [ids.head]);
      const now = new Date();
      await app.get(PresenceService).heartbeat(tenantId, rows[0].member_no, true, now.getTime());

      await app.get(ChatNoticesService).tick(now);

      const links = (await notices_('head')).map((row) => row.link);
      expect(links).not.toContain(`/chat?c=${muted}`);
      expect(links).not.toContain(`/chat?c=${read}`);
      expect(links).not.toContain(`/chat?c=${online}`);
    });

    it('a group notice names the group; an @mention notifies at once, muted or not', async () => {
      const group = (
        await as('gad').post('/chat/groups').send({ title: 'Đội GAD', memberIds: [ids.um, ids.bm] }).expect(201)
      ).body.id as string;
      await as('um').put(`/chat/conversations/${group}/prefs`).send({ muted: true }).expect(204);
      const message = await send('gad', group, '@Trưởng nhóm 1 xem giúp', { mentions: [ids.um] });

      const [mention] = (await notices_('um')).filter((row) => row.link.startsWith(`/chat?c=${group}`));
      expect(mention).toEqual({ data: { userId: ids.gad, conversationId: group }, link: `/chat?c=${group}&m=${message.seq}` });
      await age(group, 6);
      await app.get(ChatNoticesService).tick(new Date());
      const listed = (await as('bm').get('/notifications').expect(200)).body.items as { type: string; subject: string }[];
      expect(listed.find((item) => item.type === 'CHAT_UNREAD')?.subject).toBe('Đội GAD');
    });
  });

  // `notices` is the name used inside the tests for the service
  function notices_(key: string) {
    return notices(key, 'CHAT_UNREAD').then(async (unread) => [...unread, ...(await notices(key, 'CHAT_MENTION'))]);
  }
});
