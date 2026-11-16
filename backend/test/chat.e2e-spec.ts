import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import request from 'supertest';
import { startApp, stopApp } from './support/app.js';
import { ownerDb } from './support/owner-db.js';
import { demoEmail, seedDemoData } from '../src/seed/demo-data.js';

const API = '/api/v1';
const PASSWORD = 'demo-password-123';
const APP_ORIGIN = new URL(process.env.APP_URL!).origin;

type Message = {
  conversationId: string;
  seq: number;
  senderId: string | null;
  kind: 'TEXT' | 'SYSTEM';
  body: string | null;
  data: Record<string, unknown>;
  mentions: string[];
  editedAt: string | null;
  deletedAt: string | null;
};

/** Realtime slices C2 and C3: one-to-one and group chat; K1, K3 decided on 14/11/2026. */
describe('Chat (e2e)', () => {
  let app: INestApplication;
  let url: string;
  const ids: Record<string, string> = {};
  const cookies: Record<string, string> = {};
  const sockets: Socket[] = [];

  const signIn = async (key: string, ga = 1) => {
    const res = await request(app.getHttpServer())
      .post(`${API}/auth/sign-in/email`)
      .send({ email: demoEmail(ga, key), password: PASSWORD })
      .expect(200);
    const cookie = ([] as string[])
      .concat(res.headers['set-cookie'] ?? [])
      .map((line) => line.split(';')[0])
      .find((pair) => pair.startsWith('crm_session='));
    if (!cookie) throw new Error('No session cookie');
    return cookie;
  };
  /** A request as one of the demo users: `as('fc').post(...)`. */
  const as = (who: string) => {
    const server = request(app.getHttpServer());
    const wrap = (test: request.Test) =>
      test.set('Cookie', cookies[who]).set('Origin', APP_ORIGIN);
    return {
      get: (path: string) => wrap(server.get(`${API}${path}`)),
      post: (path: string) => wrap(server.post(`${API}${path}`)),
      patch: (path: string) => wrap(server.patch(`${API}${path}`)),
      put: (path: string) => wrap(server.put(`${API}${path}`)),
      delete: (path: string) => wrap(server.delete(`${API}${path}`)),
    };
  };
  const connect = (who: string) =>
    new Promise<Socket>((resolve, reject) => {
      const socket = io(url, {
        path: '/socket.io',
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        extraHeaders: { origin: APP_ORIGIN, cookie: cookies[who] },
      });
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  const record = <T>(socket: Socket, event: string) => {
    const seen: T[] = [];
    socket.on(event, (payload: T) => seen.push(payload));
    return seen;
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
  const send = (who: string, conversationId: string, body: string, extra: object = {}) =>
    as(who)
      .post(`/chat/conversations/${conversationId}/messages`)
      .send({ clientMsgId: randomUUID(), body, ...extra })
      .expect(201)
      .then((res) => res.body as Message);
  const direct = async (who: string, withWhom: string) =>
    (await as(who).post('/chat/direct').send({ userId: ids[withWhom] }).expect(201)).body
      .id as string;
  const messagesOf = async (who: string, id: string, query = '') =>
    (await as(who).get(`/chat/conversations/${id}/messages${query}`).expect(200)).body as {
      items: Message[];
      hasMore: boolean;
    };

  beforeAll(async () => {
    app = await startApp();
    await app.listen(0);
    url = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    await seedDemoData(app, PASSWORD);
    const { rows } = await ownerDb().query<{ id: string; email: string }>(
      `SELECT id, email FROM users WHERE email LIKE '%.gacrm.local'`,
    );
    for (const key of ['head', 'admin', 'marketing', 'gad', 'bm', 'um', 'fc'])
      ids[key] = rows.find((row) => row.email === demoEmail(1, key))!.id;
    ids.head2 = rows.find((row) => row.email === demoEmail(2, 'head'))!.id;
    for (const key of ['head', 'admin', 'marketing', 'gad', 'bm', 'um', 'fc'])
      cookies[key] = await signIn(key);
    cookies.head2 = await signIn('head', 2);
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  afterAll(async () => {
    await stopApp(app);
  });

  describe('one-to-one', () => {
    it('K1: anyone in the GA opens one conversation per pair, whoever starts it', async () => {
      const first = await direct('marketing', 'fc');
      const again = await direct('fc', 'marketing');
      expect(again).toBe(first);
      // Until someone writes, it is listed only for whoever opened it first
      const listed = async (who: string) =>
        ((await as(who).get('/chat/conversations').expect(200)).body.items as { id: string }[]).map((item) => item.id);
      expect(await listed('marketing')).toContain(first);
      expect(await listed('fc')).not.toContain(first);
      await send('fc', first, 'Chào chị');
      expect(await listed('fc')).toContain(first);
    });

    it('TEN-7: a user of another GA is not found, and neither is their conversation', async () => {
      await as('fc').post('/chat/direct').send({ userId: ids.head2 }).expect(404);
      const id = await direct('fc', 'um');
      await as('head2').get(`/chat/conversations/${id}`).expect(404);
      await as('head2').get(`/chat/conversations/${id}/messages`).expect(404);
      await as('head2')
        .post(`/chat/conversations/${id}/messages`)
        .send({ clientMsgId: randomUUID(), body: 'xin chào' })
        .expect(404);
    });

    it('a non-member of a conversation in the same GA gets 404', async () => {
      const id = await direct('fc', 'um');
      await as('bm').get(`/chat/conversations/${id}/messages`).expect(404);
    });

    it('pushes each new message to the members only, and counts it unread for the other one', async () => {
      const id = await direct('bm', 'gad');
      const gad = await connect('gad');
      const outsider = await connect('fc');
      const toGad = record<Message>(gad, 'chat.message');
      const toOutsider = record<Message>(outsider, 'chat.message');
      const before = (await as('gad').get('/chat/unread').expect(200)).body.unread as number;

      const sent = await send('bm', id, 'Chào anh, mai họp lúc 9 giờ nhé');
      await settle();

      expect(sent.seq).toBe(1);
      expect(toGad).toEqual([expect.objectContaining({ conversationId: id, seq: 1, body: sent.body })]);
      expect(toOutsider).toHaveLength(0);
      expect((await as('gad').get('/chat/unread').expect(200)).body.unread).toBe(before + 1);
      // Your own message is read
      const mine = (await as('bm').get('/chat/conversations').expect(200)).body.items.find(
        (item: { id: string }) => item.id === id,
      );
      expect(mine.unread).toBe(0);
      expect(mine.lastMessage.body).toBe(sent.body);
    });

    it('numbers messages 1, 2, 3... with no gap even when sent at once', async () => {
      const id = await direct('um', 'gad');
      const sent = await Promise.all(
        Array.from({ length: 10 }, (_, index) => send(index % 2 ? 'um' : 'gad', id, `tin ${index}`)),
      );
      expect(sent.map((message) => message.seq).sort((a, b) => a - b)).toEqual(
        Array.from({ length: 10 }, (_, index) => index + 1),
      );
    });

    it('a retried send with the same clientMsgId is one message', async () => {
      const id = await direct('admin', 'gad');
      const clientMsgId = randomUUID();
      const [a, b] = await Promise.all(
        [1, 2].map(() =>
          as('admin')
            .post(`/chat/conversations/${id}/messages`)
            .send({ clientMsgId, body: 'gửi hai lần' })
            .expect(201),
        ),
      );
      expect(a.body.seq).toBe(b.body.seq);
      expect((await messagesOf('gad', id)).items).toHaveLength(1);
    });

    it('marking read clears the count and tells the sender, who sees it as "seen"', async () => {
      const id = await direct('admin', 'um');
      await send('admin', id, 'một');
      const second = await send('admin', id, 'hai');
      const admin = await connect('admin');
      const reads = record<{ userId: string; seq: number }>(admin, 'chat.read');

      await as('um').post(`/chat/conversations/${id}/read`).send({ seq: 99 }).expect(204);
      await settle();

      expect(reads).toEqual([expect.objectContaining({ userId: ids.um, seq: second.seq })]);
      const detail = (await as('admin').get(`/chat/conversations/${id}`).expect(200)).body;
      expect(detail.members.find((member: { id: string }) => member.id === ids.um).lastReadSeq).toBe(second.seq);
      // Never goes back
      await as('um').post(`/chat/conversations/${id}/read`).send({ seq: 1 }).expect(204);
      const after = (await as('admin').get(`/chat/conversations/${id}`).expect(200)).body;
      expect(after.members.find((member: { id: string }) => member.id === ids.um).lastReadSeq).toBe(second.seq);
    });

    it('the author edits within 15 minutes and recalls (text wiped); nobody else can', async () => {
      const id = await direct('fc', 'gad');
      const message = await send('fc', id, 'Số CCCD của khách là 012345678901');
      const gad = await connect('gad');
      const updates = record<{ seq: number }>(gad, 'chat.updated');

      await as('gad').patch(`/chat/conversations/${id}/messages/${message.seq}`).send({ body: 'x' }).expect(404);
      await as('fc').patch(`/chat/conversations/${id}/messages/${message.seq}`).send({ body: 'Sửa lại' }).expect(204);
      await as('fc').delete(`/chat/conversations/${id}/messages/${message.seq}`).expect(204);
      await settle();

      const [stored] = (await messagesOf('gad', id)).items;
      expect(stored.body).toBeNull();
      expect(stored.deletedAt).not.toBeNull();
      expect(updates.map((update) => update.seq)).toEqual([message.seq, message.seq]);
      const { rows } = await ownerDb().query(`SELECT body FROM messages WHERE id = $1`, [
        (message as unknown as { id: string }).id,
      ]);
      expect(rows[0].body).toBeNull();

      const old = await send('fc', id, 'cũ');
      await ownerDb().query(
        `UPDATE messages SET created_at = now() - interval '16 minutes' WHERE conversation_id = $1 AND seq = $2`,
        [id, old.seq],
      );
      const late = await as('fc').patch(`/chat/conversations/${id}/messages/${old.seq}`).send({ body: 'muộn' });
      expect(late.status).toBe(409);
      expect(late.body.error).toBe('chat_edit_window_closed');
    });

    it('typing reaches the other member only', async () => {
      const id = await direct('marketing', 'um');
      const marketing = await connect('marketing');
      const um = await connect('um');
      const toUm = record<{ userId: string }>(um, 'chat.typing');
      const toSelf = record(marketing, 'chat.typing');

      marketing.emit('chat.typing', { conversationId: id });
      await settle();

      expect(toUm).toEqual([{ conversationId: id, userId: ids.marketing }]);
      expect(toSelf).toHaveLength(0);
      // Someone outside the conversation is not heard
      const outsider = await connect('bm');
      outsider.emit('chat.typing', { conversationId: id });
      await settle();
      expect(toUm).toHaveLength(1);
    });
  });

  describe('groups', () => {
    let group: string;

    it('C3: the creator owns the group; members get the "created" message', async () => {
      const created = await as('head')
        .post('/chat/groups')
        .send({ title: 'Ban kinh doanh 1', memberIds: [ids.bm, ids.um, ids.fc] })
        .expect(201);
      group = created.body.id;
      const detail = (await as('fc').get(`/chat/conversations/${group}`).expect(200)).body;
      expect(detail.kind).toBe('GROUP');
      expect(detail.members.map((member: { id: string; role: string }) => [member.id, member.role])).toEqual(
        expect.arrayContaining([
          [ids.head, 'OWNER'],
          [ids.fc, 'MEMBER'],
        ]),
      );
      const [first] = (await messagesOf('fc', group)).items;
      expect(first).toEqual(
        expect.objectContaining({ kind: 'SYSTEM', data: expect.objectContaining({ event: 'created', actorId: ids.head }) }),
      );
    });

    it('only the owner and admins rename or add people', async () => {
      await as('fc').patch(`/chat/conversations/${group}`).send({ title: 'Đổi tên' }).expect(403);
      await as('head').put(`/chat/conversations/${group}/members/${ids.bm}/role`).send({ role: 'ADMIN' }).expect(204);
      await as('bm').patch(`/chat/conversations/${group}`).send({ title: 'Ban 1 - tháng 11' }).expect(204);
      // Admins cannot make admins
      await as('bm').put(`/chat/conversations/${group}/members/${ids.um}/role`).send({ role: 'ADMIN' }).expect(403);
    });

    it('someone added later does not see what was said before', async () => {
      await send('fc', group, 'Tin trước khi chị Marketing vào');
      await as('bm').post(`/chat/conversations/${group}/members`).send({ userIds: [ids.marketing] }).expect(204);
      const seen = (await messagesOf('marketing', group)).items;
      expect(seen.map((message) => message.body)).not.toContain('Tin trước khi chị Marketing vào');
      expect(seen[0]).toEqual(expect.objectContaining({ kind: 'SYSTEM', data: expect.objectContaining({ event: 'added' }) }));
    });

    it('@mentions keep only current members', async () => {
      const message = await send('um', group, '@Tư vấn viên 1 xem giúp', {
        mentions: [ids.fc, ids.gad, ids.um],
      });
      expect(message.mentions).toEqual([ids.fc]);
    });

    it('an admin removes a member but not the owner; the removed member loses access', async () => {
      await as('bm').delete(`/chat/conversations/${group}/members/${ids.head}`).expect(403);
      const fc = await connect('fc');
      const told = record<{ conversationId: string }>(fc, 'chat.conversation');
      await as('bm').delete(`/chat/conversations/${group}/members/${ids.fc}`).expect(204);
      await settle();
      expect(told).toContainEqual({ conversationId: group });
      await as('fc').get(`/chat/conversations/${group}/messages`).expect(404);
      const list = (await as('fc').get('/chat/conversations').expect(200)).body.items as { id: string }[];
      expect(list.map((item) => item.id)).not.toContain(group);
    });

    it('an owner who leaves hands the group to the earliest admin', async () => {
      await as('head').delete(`/chat/conversations/${group}/members/${ids.head}`).expect(204);
      const detail = (await as('bm').get(`/chat/conversations/${group}`).expect(200)).body;
      expect(detail.members.find((member: { id: string }) => member.id === ids.bm).role).toBe('OWNER');
      const last = (await messagesOf('bm', group)).items.at(-1)!;
      expect(last.data).toEqual(
        expect.objectContaining({ event: 'left', newOwnerId: ids.bm, actorId: ids.head, names: { [ids.bm]: 'Trưởng ban 1' } }),
      );
    });

    it('a muted conversation leaves the chat icon count; pinned ones list first', async () => {
      const before = (await as('um').get('/chat/unread').expect(200)).body.unread as number;
      await send('bm', group, 'Thông báo chung');
      expect((await as('um').get('/chat/unread').expect(200)).body.unread).toBe(before + 1);
      await as('um').put(`/chat/conversations/${group}/prefs`).send({ muted: true, pinned: true }).expect(204);
      expect((await as('um').get('/chat/unread').expect(200)).body.unread).toBeLessThan(before + 1);
      const [first] = (await as('um').get('/chat/conversations').expect(200)).body.items;
      expect(first).toEqual(expect.objectContaining({ id: group, pinned: true, muted: true }));
    });
  });

  describe('K3: the GA head reads conversations', () => {
    it('lists the GA\'s conversations and reads one, audited each time; nobody else can', async () => {
      const id = await direct('fc', 'um');
      await send('fc', id, 'Tin riêng giữa hai người');

      const list = (await as('head').get('/chat/review?q=Tư vấn').expect(200)).body;
      expect(list.items.map((item: { id: string }) => item.id)).toContain(id);
      const read = (await as('head').get(`/chat/review/${id}/messages`).expect(200)).body;
      expect(read.items.map((message: Message) => message.body)).toContain('Tin riêng giữa hai người');
      const { rows } = await ownerDb().query(
        `SELECT user_id FROM audit_events WHERE action = 'CHAT_READ' AND entity_id = $1`,
        [id],
      );
      expect(rows).toEqual([{ user_id: ids.head }]);

      await as('admin').get('/chat/review').expect(403);
      await as('admin').get(`/chat/review/${id}/messages`).expect(403);
      // TEN-7
      await as('head2').get(`/chat/review/${id}/messages`).expect(404);
    });
  });
});
