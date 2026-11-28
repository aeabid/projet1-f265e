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

test('benefit images and youtube links', async () => {
  const admin = await login('admin', 'admin123');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const r = await admin('POST', '/api/quran/benefits', { title: 'صور', youtube: ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=abcdefghijk&t=3'], images: [png, png] });
  assert.strictEqual(r.status, 201);
  let list = (await admin('GET', '/api/quran/benefits')).body.benefits;
  let b = list.find((x) => x.title === 'صور');
  assert.deepStrictEqual(b.youtube, ['dQw4w9WgXcQ', 'abcdefghijk']);
  assert.strictEqual(b.images.length, 2);
  const img = await handle(new Request('http://localhost/api/quran/benefit-images/' + b.images[0], { headers: { cookie: (await call('POST', '/api/login', { username: 'admin', password: 'admin123' })).cookie } }));
  assert.strictEqual(img.status, 200);
  assert.strictEqual(img.headers.get('content-type'), 'image/png');
  assert.strictEqual((await admin('PUT', `/api/quran/benefits/${b.id}`, { title: 'صور', keep_images: [b.images[1]], youtube: [] })).status, 200);
  b = (await admin('GET', '/api/quran/benefits')).body.benefits.find((x) => x.id === b.id);
  assert.strictEqual(b.images.length, 1);
  assert.deepStrictEqual(b.youtube, []);
  assert.strictEqual((await admin('POST', '/api/quran/benefits', { images: ['data:text/html;base64,AAAA'] })).status, 400);
  assert.strictEqual((await admin('POST', '/api/quran/benefits', { youtube: ['nope'] })).status, 400);
});

test('notifications: new benefit and sheikh note reach students', async () => {
  const admin = await login('admin', 'admin123');
  const g = (await admin('POST', '/api/quran/groups', { name: 'ج', meet_day: 5 })).body.group;
  const s = (await admin('POST', '/api/quran/students', { username: 'n1', password: 'secret1', first_name: 'ن1', group_id: g.id })).body.student;
  const st = await login('n1', 'secret1');
  assert.strictEqual((await st('GET', '/api/notifications/count')).body.unread, 0);
  await admin('POST', '/api/quran/benefits', { group_id: g.id, title: 'تنبيه', body: 'نص' });
  await admin('POST', `/api/quran/students/${s.id}/meetings`, { attendance: 'present', note: 'أحسنت' });
  await admin('POST', `/api/quran/students/${s.id}/meetings`, { attendance: 'present', note: 'أحسنت' });
  assert.strictEqual((await st('GET', '/api/notifications/count')).body.unread, 2);
  const list = (await st('GET', '/api/notifications')).body.notifications;
  assert.deepStrictEqual(list.map((n) => n.kind).sort(), ['benefit', 'note']);
  await st('POST', '/api/notifications/read');
  assert.strictEqual((await st('GET', '/api/notifications/count')).body.unread, 0);
  assert.strictEqual((await admin('DELETE', `/api/quran/students/${s.id}`)).status, 200);
});

test('session attendance, two-absence alert, record table and challenges', async () => {
  const admin = await login('admin', 'admin123');
  const g = (await admin('POST', '/api/quran/groups', { name: 'د', meet_day: 6 })).body.group;
  const a = (await admin('POST', '/api/quran/students', { username: 'c1', password: 'secret1', first_name: 'أ', group_id: g.id, week_start: 6, memorized: { 150: 's', 151: 's' } })).body.student;
  const b = (await admin('POST', '/api/quran/students', { username: 'c2', password: 'secret1', first_name: 'ب', group_id: g.id, week_start: 6 })).body.student;
  const t = new Date().toISOString().slice(0, 10);
  const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const lastWeek = add(t, -7), twoAgo = add(t, -14);
  // حصة الأسبوع: نفس الحصة طوال الأسبوع
  const r1 = await admin('GET', `/api/quran/attendance?week=${t}`);
  const ses = r1.body.sessions[a.id];
  assert.strictEqual(new Date(ses + 'T00:00:00Z').getUTCDay(), 6);
  await admin('POST', '/api/quran/attendance', { week: twoAgo, marks: { [a.id]: 'absent', [b.id]: 'present' } });
  await admin('POST', '/api/quran/attendance', { week: lastWeek, marks: { [a.id]: 'absent', [b.id]: 'present' } });
  await admin('POST', '/api/quran/attendance', { week: lastWeek, marks: { [a.id]: 'absent' } });
  const st = await login('c1', 'secret1');
  const ns = (await st('GET', '/api/notifications')).body.notifications.filter((n) => n.kind === 'absence');
  assert.strictEqual(ns.length, 1);
  // تقييم بالنقاط 1-5 يحدّث نفس حصة الأسبوع
  assert.strictEqual((await admin('POST', `/api/quran/students/${a.id}/meetings`, { date: lastWeek, attendance: 'excused', hifz_eval: '4', ada_eval: 5 })).status, 201);
  assert.strictEqual((await admin('POST', `/api/quran/students/${a.id}/meetings`, { date: lastWeek, hifz_eval: '9' })).status, 400);
  const rec = (await admin('GET', `/api/quran/groups/${g.id}/record?weeks=4`)).body;
  assert.strictEqual(rec.weeks.length, 4);
  const ra = rec.students.find((s) => s.id === a.id);
  assert.strictEqual(ra.weeks[2].att, 'excused');
  assert.strictEqual(ra.weeks[2].hifz_eval, '4');
  assert.strictEqual(ra.weeks[1].att, 'absent');
  assert.ok('cover' in ra.weeks[0]);
  const ch = (await st('GET', '/api/quran/challenges?period=all')).body;
  assert.strictEqual(ch.group.id, g.id);
  const att = ch.rankings.attendance;
  assert.strictEqual(att[0].id, b.id);
  assert.strictEqual(att[0].attendance, 100);
  assert.strictEqual(att[1].attendance, 0);
  // تفاصيل الطالب: الطالب يرى تفاصيله فقط
  const det = (await st('GET', `/api/quran/challenges/student/${a.id}?period=all`)).body;
  assert.ok(det.weeks.length >= 3);
  assert.strictEqual(det.student.absent, 1);
  assert.strictEqual(det.student.excused, 1);
  assert.strictEqual((await st('GET', `/api/quran/challenges/student/${b.id}?period=all`)).status, 404);
  assert.ok('ward_points' in ch.rankings.ward[0]);
});

test('reactions on benefits are visible to everyone', async () => {
  const admin = await login('admin', 'admin123');
  const g = (await admin('POST', '/api/quran/groups', { name: 'ر', meet_day: 3 })).body.group;
  const g2 = (await admin('POST', '/api/quran/groups', { name: 'ز', meet_day: 3 })).body.group;
  await admin('POST', '/api/quran/students', { username: 'x1', password: 'secret1', first_name: 'زيد', group_id: g.id });
  await admin('POST', '/api/quran/students', { username: 'x2', password: 'secret1', first_name: 'عمرو', group_id: g.id });
  await admin('POST', '/api/quran/students', { username: 'x3', password: 'secret1', first_name: 'بكر', group_id: g2.id });
  const id = (await admin('POST', '/api/quran/benefits', { group_id: g.id, body: 'فائدة' })).body.id;
  const s1 = await login('x1', 'secret1');
  const s2 = await login('x2', 'secret1');
  const s3 = await login('x3', 'secret1');
  assert.strictEqual((await s1('PUT', `/api/quran/benefits/${id}/react`, { emoji: '👍' })).status, 200);
  assert.strictEqual((await s2('PUT', `/api/quran/benefits/${id}/react`, { emoji: '👍' })).status, 200);
  assert.strictEqual((await s2('PUT', `/api/quran/benefits/${id}/react`, { emoji: '🤲' })).status, 200);
  assert.strictEqual((await s1('PUT', `/api/quran/benefits/${id}/react`, { emoji: '💩' })).status, 400);
  assert.strictEqual((await s3('PUT', `/api/quran/benefits/${id}/react`, { emoji: '👍' })).status, 404);
  const b = (await s2('GET', '/api/quran/benefits')).body.benefits.find((x) => x.id === id);
  assert.deepStrictEqual(b.reactions.map((r) => [r.emoji, r.count, r.names]), [['👍', 1, ['زيد']], ['🤲', 1, ['عمرو']]]);
  assert.strictEqual(b.my_reaction, '🤲');
  await s2('PUT', `/api/quran/benefits/${id}/react`, { emoji: null });
  const a = (await admin('GET', '/api/quran/benefits')).body.benefits.find((x) => x.id === id);
  assert.strictEqual(a.reactions.length, 1);
});

test('record coverage counts each memorized part once, ignoring repetition', async () => {
  const admin = await login('admin', 'admin123');
  const g = (await admin('POST', '/api/quran/groups', { name: 'ت', meet_day: 0 })).body.group;
  const s = (await admin('POST', '/api/quran/students', { username: 'cv1', password: 'secret1', first_name: 'ت', group_id: g.id, week_start: 0, memorized: { 150: 's', 151: 's' } })).body.student;
  const t = new Date().toISOString().slice(0, 10);
  await admin('PUT', `/api/quran/students/${s.id}/review`, { date: t, ids: [150], counts: { 150: 5 } });
  const r = (await admin('GET', `/api/quran/groups/${g.id}/record?weeks=1`)).body;
  const w = r.students[0].weeks[0];
  assert.ok(w.cover > 0 && w.cover < 100, `cover ${w.cover}`);
  assert.ok(w.ward > w.cover, 'repetition raises reading but not coverage');
  await admin('PUT', `/api/quran/students/${s.id}/review`, { date: t, ids: [150, 151] });
  assert.strictEqual((await admin('GET', `/api/quran/groups/${g.id}/record?weeks=1`)).body.students[0].weeks[0].cover, 100);
});

test('benefit folders organize benefits by topic', async () => {
  const admin = await login('admin', 'admin123');
  const f = (await admin('POST', '/api/quran/benefit-folders', { name: 'آداب طالب العلم', icon: '📘' })).body.folder;
  assert.ok(f.id);
  const id = (await admin('POST', '/api/quran/benefits', { title: 'الإخلاص', body: 'نص', folder_id: f.id })).body.id;
  let b = (await admin('GET', '/api/quran/benefits')).body.benefits.find((x) => x.id === id);
  assert.strictEqual(b.folder_id, f.id);
  assert.strictEqual((await admin('POST', '/api/quran/benefits', { body: 'x', folder_id: 99999 })).status, 400);
  await admin('PUT', `/api/quran/benefit-folders/${f.id}`, { name: 'آداب', icon: '📗' });
  await admin('DELETE', `/api/quran/benefit-folders/${f.id}`);
  b = (await admin('GET', '/api/quran/benefits')).body.benefits.find((x) => x.id === id);
  assert.strictEqual(b.folder_id, null);
  await admin('POST', '/api/quran/students', { username: 'fl1', password: 'secret1', first_name: 'ف' });
  const st = await login('fl1', 'secret1');
  assert.strictEqual((await st('GET', '/api/quran/benefit-folders')).status, 200);
  assert.strictEqual((await st('POST', '/api/quran/benefit-folders', { name: 'x' })).status, 403);
});
