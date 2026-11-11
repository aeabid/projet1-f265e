import test from 'node:test';
import assert from 'node:assert';
import pg from 'pg';
import { NetlifyDB } from '@netlify/database-dev';
import { createHandler } from '../lib/app.js';
import { dayPlan, weekStartOf, addDays } from '../lib/quran.js';

let db, pool, handle;
test.before(async () => {
  db = new NetlifyDB();
  const connectionString = await db.start();
  await db.applyMigrations(new URL('../netlify/database/migrations', import.meta.url).pathname);
  pool = new pg.Pool({ connectionString });
  handle = createHandler(pool, { adminPassword: 'admin123' });
});
test.after(async () => {
  await pool.end();
  await db.stop();
});

async function call(method, url, body, cookie) {
  const res = await handle(new Request('http://localhost' + url, {
    method,
    headers: { ...(cookie ? { cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }));
  return { status: res.status, body: await res.json(), headers: res.headers };
}
async function login(username, password) {
  const res = await call('POST', '/api/login', { username, password });
  assert.strictEqual(res.status, 200, JSON.stringify(res.body));
  const cookie = res.headers.get('set-cookie').split(';')[0];
  return (method, url, body) => call(method, url, body, cookie);
}

test('week helpers and daily plan', () => {
  assert.strictEqual(weekStartOf('2026-11-11', 6), '2026-11-07'); // الأربعاء ← السبت الماضي
  assert.strictEqual(weekStartOf('2026-11-07', 6), '2026-11-07');
  const Q = globalThis.QURAN;
  const juz30 = Object.fromEntries(Q.segments.filter((s) => s.juz === 30).map((s) => [s.id, 's']));
  const st = { week_start: 6, solid_days: 7, weak_days: 7, memorized: juz30 };
  const labels = [];
  for (let i = 0; i < 7; i++) labels.push(dayPlan(st, addDays('2026-11-07', i)).solid.label);
  assert.strictEqual(new Set(labels).size, 7);
  assert.ok(labels[0].startsWith('النبأ'));
  assert.ok(labels[6].endsWith('الناس'));
  assert.strictEqual(dayPlan(st, '2026-11-14').solid.label, labels[0]); // الأسبوع الموالي يعيد
  assert.strictEqual(dayPlan(st, '2026-11-07').weak, null);
});

test('quran space: sheikh, groups, students, review, counter, meetings', async () => {
  const admin = await login('admin', 'admin123');
  const sh = await admin('POST', '/api/quran/sheikhs', { username: 'sheikh1', full_name: 'الشيخ محمد', password: 'secret1' });
  assert.strictEqual(sh.status, 201);
  await admin('POST', '/api/quran/sheikhs', { username: 'sheikh2', full_name: 'الشيخ علي', password: 'secret1' });
  const sheikh = await login('sheikh1', 'secret1');
  const other = await login('sheikh2', 'secret1');
  assert.strictEqual((await sheikh('POST', '/api/quran/sheikhs', { username: 'x', full_name: 'x', password: 'secret1' })).status, 403);

  const g = (await sheikh('POST', '/api/quran/groups', { name: 'حلقة المبتدئين', level: 'مبتدئ', meet_day: 6 })).body.group;
  assert.strictEqual(g.sheikh_id, sh.body.sheikh.id);
  const Q = globalThis.QURAN;
  const juz30 = Q.segments.filter((s) => s.juz === 30).map((s) => s.id);
  const res = await sheikh('POST', '/api/quran/students', {
    username: 'talib1', password: 'secret1', first_name: 'أحمد', last_name: 'بن علي', age: 12, group_id: g.id,
    memorized: Object.fromEntries(juz30.map((id, i) => [id, i < 3 ? 'w' : 's'])),
  });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  const sid = res.body.student.id;
  assert.strictEqual(res.body.student.week_start, 6);
  assert.strictEqual(res.body.student.full_name, 'أحمد بن علي');
  assert.strictEqual((await other('GET', `/api/quran/students/${sid}`)).status, 404);
  assert.strictEqual((await other('GET', '/api/quran/overview')).body.students.length, 0);

  const talib = await login('talib1', 'secret1');
  const me = (await talib('GET', `/api/quran/students/${sid}`)).body;
  assert.strictEqual(me.week.length, 7);
  assert.strictEqual(me.student.week_start, 6);
  assert.strictEqual(me.week_start, me.student.week_from);
  assert.ok(me.student.solid_hizb > 0 && me.student.weak_hizb > 0);
  const todayRow = me.week.find((d) => d.date === me.today);
  assert.ok(todayRow.solid);
  assert.strictEqual((await talib('POST', `/api/quran/students/${sid}/review`, { kind: 'solid' })).body.done, true);
  assert.strictEqual((await talib('POST', `/api/quran/students/${sid}/lessons`, { content: 'x' })).status, 403);
  assert.strictEqual((await talib('PUT', `/api/quran/students/${sid}`, { first_name: 'x' })).status, 403);
  // الطالب يحدّد محفوظه
  const mem = await talib('PUT', `/api/quran/students/${sid}/memorized`, { memorized: { [juz30[0]]: 's', 9999: 's', [juz30[1]]: 'bad' } });
  assert.deepStrictEqual(mem.body.memorized, { [juz30[0]]: 's' });

  // الدرس الجديد: 70 قراءة
  const lesson = (await sheikh('POST', `/api/quran/students/${sid}/lessons`, { content: 'الملك 1-14', athman: 1 })).body.lesson;
  assert.strictEqual(lesson.target, 70);
  await talib('PUT', `/api/quran/lessons/${lesson.id}/reps`, {});
  let r = (await talib('PUT', `/api/quran/lessons/${lesson.id}/reps`, { add: 5 })).body;
  assert.strictEqual(r.total, 6);
  r = (await talib('PUT', `/api/quran/lessons/${lesson.id}/reps`, { count: 72 })).body;
  assert.deepStrictEqual([r.total, r.reached], [72, true]);
  assert.strictEqual((await talib('PUT', `/api/quran/lessons/${lesson.id}/reps`, { date: '2099-01-01', add: 1 })).status, 400);

  // اللقاء والتقييم: يراه الطالب
  const m = await sheikh('POST', `/api/quran/students/${sid}/meetings`, { attendance: 'present', review_eval: 'good', hifz_eval: 'excellent', ada_eval: 'average', lesson_id: lesson.id, note: 'بارك الله فيك' });
  assert.strictEqual(m.status, 201, JSON.stringify(m.body));
  assert.strictEqual((await sheikh('POST', `/api/quran/students/${sid}/meetings`, { hifz_eval: 'wow' })).status, 400);
  const after = (await talib('GET', `/api/quran/students/${sid}`)).body;
  assert.strictEqual(after.meetings[0].note, 'بارك الله فيك');
  assert.strictEqual(after.lesson.total, 72);
  // حضور المجموعة
  assert.strictEqual((await sheikh('POST', `/api/quran/groups/${g.id}/attendance`, { date: '2026-11-07', marks: { [sid]: 'absent' } })).body.saved, 1);

  const ov = (await admin('GET', '/api/quran/overview')).body;
  assert.strictEqual(ov.students.length, 1);
  assert.strictEqual(ov.sheikhs.length, 2);
  assert.strictEqual(ov.students[0].lesson.total, 72);
  assert.strictEqual(ov.students[0].memorized, undefined);
  assert.strictEqual((await call('GET', '/api/me', null, null)).status, 401);
  assert.strictEqual((await talib('GET', '/api/me')).body.user.role_label, 'طالب');
  assert.strictEqual((await sheikh('DELETE', `/api/quran/students/${sid}`)).status, 200);
});
