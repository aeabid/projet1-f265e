import test from 'node:test';
import assert from 'node:assert';
import pg from 'pg';
import { NetlifyDB } from '@netlify/database-dev';
import { createHandler } from '../lib/app.js';

let db, pool, handle;
// رموز Google وهمية: "tok:<sub>:<email>"
const verifyGoogle = async (c) => {
  const [, sub, email] = c.split(':');
  if (!sub) throw Object.assign(new Error('bad'), { status: 401 });
  return { sub, email, name: 'أحمد بن علي' };
};
test.before(async () => {
  db = new NetlifyDB();
  const cs = await db.start();
  await db.applyMigrations(new URL('../netlify/database/migrations', import.meta.url).pathname);
  pool = new pg.Pool({ connectionString: cs });
  handle = createHandler(pool, { adminPassword: 'admin123', adminUsername: 'alaa', adminEmail: 'alaa@example.com', googleClientId: 'cid', verifyGoogle });
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
const as = (cookie) => (m, u, b) => call(m, u, b, cookie);

test('google signup: request, admin accepts, student logs in with google', async () => {
  assert.strictEqual((await call('GET', '/api/auth/config')).body.google_client_id, 'cid');
  // المشرف ببريده: يُربط ويدخل
  const a = await call('POST', '/api/auth/google', { credential: 'tok:g-admin:alaa@example.com' });
  assert.strictEqual(a.body.user.role, 'admin');
  const admin = as(a.cookie);
  const g = (await admin('POST', '/api/quran/groups', { name: 'حلقة السبت', meet_day: 6 })).body.group;

  // طالب جديد
  const cred = 'tok:g-1:ahmed.ali@gmail.com';
  let r = await call('POST', '/api/auth/google', { credential: cred });
  assert.deepStrictEqual([r.body.status, r.body.user], ['new', undefined]);
  assert.strictEqual(r.body.groups.length, 1);
  assert.strictEqual((await call('POST', '/api/auth/google/signup', { credential: cred, first_name: 'أحمد', last_name: 'بن علي', age: 12, group_id: g.id })).status, 201);
  assert.strictEqual((await call('POST', '/api/auth/google', { credential: cred })).body.status, 'pending');
  assert.strictEqual((await admin('GET', '/api/signups/count')).body.pending, 1);

  const list = (await admin('GET', '/api/signups')).body.signups;
  const acc = await admin('POST', `/api/signups/${list[0].id}/accept`, {});
  assert.strictEqual(acc.status, 200, JSON.stringify(acc.body));
  assert.strictEqual(acc.body.username, 'ahmed.ali');
  assert.strictEqual((await admin('POST', `/api/signups/${list[0].id}/accept`, {})).status, 409);

  r = await call('POST', '/api/auth/google', { credential: cred });
  assert.strictEqual(r.body.user.role, 'talib');
  const st = (await as(r.cookie)('GET', `/api/quran/students/${r.body.user.id}`)).body.student;
  assert.deepStrictEqual([st.group_id, st.week_start, st.full_name], [g.id, 6, 'أحمد بن علي']);

  // طلب مرفوض
  const c2 = 'tok:g-2:x@gmail.com';
  await call('POST', '/api/auth/google/signup', { credential: c2, first_name: 'س' });
  const id2 = (await admin('GET', '/api/signups')).body.signups.find((s) => s.google_email === 'x@gmail.com').id;
  await admin('POST', `/api/signups/${id2}/reject`);
  assert.strictEqual((await call('POST', '/api/auth/google', { credential: c2 })).body.status, 'rejected');
  // الطالب لا يرى الطلبات
  assert.strictEqual((await as(r.cookie)('GET', '/api/signups')).status, 403);
});
