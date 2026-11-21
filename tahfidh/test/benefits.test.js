import test from 'node:test';
import assert from 'node:assert';
import pg from 'pg';
import { NetlifyDB } from '@netlify/database-dev';
import { createHandler } from '../lib/app.js';

let db, pool, handle;
test.before(async () => {
  db = new NetlifyDB();
  const cs = await db.start();
  await db.applyMigrations(new URL('../netlify/database/migrations', import.meta.url).pathname);
  pool = new pg.Pool({ connectionString: cs });
  handle = createHandler(pool, { adminPassword: 'admin123' });
});
test.after(async () => {
  await pool.end();
  await db.stop();
});
async function call(method, url, body, cookie) {
  const res = await handle(new Request('http://localhost' + url, {
    method, headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
const login = async (u, p) => {
  const r = await call('POST', '/api/login', { username: u, password: p });
  return (m, url, b) => call(m, url, b, r.cookie);
};

test('benefits per group and private student notes', async () => {
  const admin = await login('admin', 'admin123');
  const g1 = (await admin('POST', '/api/quran/groups', { name: 'أ', meet_day: 6 })).body.group;
  const g2 = (await admin('POST', '/api/quran/groups', { name: 'ب', meet_day: 0 })).body.group;
  await admin('POST', '/api/quran/students', { username: 's1', password: 'secret1', first_name: 'س1', group_id: g1.id });
  await admin('POST', '/api/quran/students', { username: 's2', password: 'secret1', first_name: 'س2', group_id: g2.id });
  assert.strictEqual((await admin('POST', '/api/quran/benefits', { body: 'للجميع' })).status, 201);
  assert.strictEqual((await admin('POST', '/api/quran/benefits', { group_id: g1.id, title: 'تنبيه', body: 'للمجموعة أ' })).status, 201);
  assert.strictEqual((await admin('POST', '/api/quran/benefits', { body: '' })).status, 400);

  const s1 = await login('s1', 'secret1');
  const s2 = await login('s2', 'secret1');
  assert.deepStrictEqual((await s1('GET', '/api/quran/benefits')).body.benefits.map((b) => b.body).sort(), ['للجميع', 'للمجموعة أ'].sort());
  assert.deepStrictEqual((await s2('GET', '/api/quran/benefits')).body.benefits.map((b) => b.body), ['للجميع']);
  assert.strictEqual((await s1('POST', '/api/quran/benefits', { body: 'x' })).status, 403);

  const n = (await s1('POST', '/api/quran/my-notes', { body: 'ملاحظتي' })).body;
  assert.strictEqual((await s1('GET', '/api/quran/my-notes')).body.notes.length, 1);
  assert.strictEqual((await s2('GET', '/api/quran/my-notes')).body.notes.length, 0);
  assert.strictEqual((await s2('PUT', `/api/quran/my-notes/${n.id}`, { body: 'x' })).status, 404);
  assert.strictEqual((await admin('GET', '/api/quran/my-notes')).status, 403);
  await s1('PUT', `/api/quran/my-notes/${n.id}`, { body: 'معدّلة' });
  assert.strictEqual((await s1('GET', '/api/quran/my-notes')).body.notes[0].body, 'معدّلة');
});

test('polls: create, answer, results, closed, group visibility', async () => {
  const admin = await login('admin', 'admin123');
  const g = (await admin('POST', '/api/quran/groups', { name: 'ج', meet_day: 6 })).body.group;
  const g2 = (await admin('POST', '/api/quran/groups', { name: 'د', meet_day: 6 })).body.group;
  await admin('POST', '/api/quran/students', { username: 'p1', password: 'secret1', first_name: 'ط1', group_id: g.id });
  await admin('POST', '/api/quran/students', { username: 'p2', password: 'secret1', first_name: 'ط2', group_id: g2.id });
  assert.strictEqual((await admin('POST', '/api/quran/polls', { title: 'x', questions: [{ q: 'س', type: 'single', options: ['أ'] }] })).status, 400);
  const id = (await admin('POST', '/api/quran/polls', {
    title: 'تقييم الحلقة', group_id: g.id,
    questions: [
      { q: 'هل الوقت مناسب؟', type: 'single', options: ['نعم', 'لا'] },
      { q: 'ما يعجبك؟', type: 'multi', options: ['التسميع', 'الفوائد', 'العدّاد'] },
      { q: 'قيّم الحلقة', type: 'rating' },
      { q: 'اقتراح', type: 'text' },
    ],
  })).body.id;
  const p1 = await login('p1', 'secret1');
  const p2 = await login('p2', 'secret1');
  assert.strictEqual((await p2('GET', '/api/quran/polls')).body.polls.length, 0);
  assert.strictEqual((await p2('PUT', `/api/quran/polls/${id}/answer`, { answers: [0] })).status, 404);
  assert.strictEqual((await p1('PUT', `/api/quran/polls/${id}/answer`, { answers: [] })).status, 400);
  assert.strictEqual((await p1('PUT', `/api/quran/polls/${id}/answer`, { answers: [0, [0, 2, 9], 4, 'أكثر من فوائد'] })).status, 200);
  const mine = (await p1('GET', '/api/quran/polls')).body.polls[0].my_answers;
  assert.deepStrictEqual(mine, [0, [0, 2], 4, 'أكثر من فوائد']);
  const r = (await admin('GET', `/api/quran/polls/${id}/results`)).body;
  assert.strictEqual(r.poll.answers, 1);
  assert.strictEqual(r.poll.audience, 1);
  assert.deepStrictEqual(r.results[0].options.map((o) => o.count), [1, 0]);
  assert.deepStrictEqual(r.results[1].options.map((o) => o.count), [1, 0, 1]);
  assert.strictEqual(r.results[2].average, 4);
  assert.strictEqual(r.results[3].texts[0].who, 'ط1');
  await admin('PUT', `/api/quran/polls/${id}/closed`, { closed: true });
  assert.strictEqual((await p1('PUT', `/api/quran/polls/${id}/answer`, { answers: [1] })).status, 400);
  assert.strictEqual((await p1('GET', `/api/quran/polls/${id}/results`)).status, 403);
});
