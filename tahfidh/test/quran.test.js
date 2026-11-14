import test from 'node:test';
import assert from 'node:assert';
import pg from 'pg';
import { NetlifyDB } from '@netlify/database-dev';
import { createHandler } from '../lib/app.js';
import { weekStartOf, reviewProgress } from '../lib/quran.js';

let db, pool, handle;
test.before(async () => {
  db = new NetlifyDB();
  const connectionString = await db.start();
  await db.applyMigrations(new URL('../netlify/database/migrations', import.meta.url).pathname);
  pool = new pg.Pool({ connectionString });
  handle = createHandler(pool, { adminPassword: 'admin123', adminUsername: 'alaa', adminName: 'علاء', adminEmail: 'alaa@example.com' });
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
const Q = () => globalThis.QURAN;

test('week start and review progress', () => {
  assert.strictEqual(weekStartOf('2026-11-11', 6), '2026-11-07');
  assert.strictEqual(weekStartOf('2026-11-07', 6), '2026-11-07');
  const juz30 = Q().segments.filter((s) => s.juz === 30).map((s) => s.id);
  const mem = Object.fromEntries(juz30.map((id, i) => [id, i === 0 ? 'w' : 's']));
  const st = { memorized: mem, weak_reps: 2 };
  let p = reviewProgress(st, []);
  assert.strictEqual(p.percent, 0);
  assert.strictEqual(p.solid_left.length, juz30.length - 1);
  p = reviewProgress(st, juz30.map((id) => ({ seg_id: id })));
  assert.strictEqual(p.solid_left.length, 0);
  assert.deepStrictEqual(p.weak_left, [juz30[0]]); // يحتاج مرتين
  p = reviewProgress(st, [...juz30, juz30[0]].map((id) => ({ seg_id: id })));
  assert.strictEqual(p.percent, 100);
});

test('short range labels', () => {
  const S = Q().segments;
  const L = (f) => Q().rangeLabel(S.filter(f));
  assert.strictEqual(L((s) => s.juz === 30), 'الجزء 30');
  assert.strictEqual(L((s) => s.juz >= 28), 'من الجزء 28 إلى الجزء 30');
  assert.strictEqual(L((s) => s.sura >= 78 && s.sura <= 85), 'من النبأ إلى البروج');
  assert.strictEqual(L((s) => s.sura === 67), 'الملك');
});

test('two admins with same rights, students, chosen review, counter, meetings', async () => {
  // الدخول بالبريد أيضًا
  await login('alaa@example.com', 'admin123');
  const alaa = await login('alaa', 'admin123');
  assert.strictEqual((await alaa('GET', '/api/me')).body.user.role_label, 'مشرف');
  assert.strictEqual((await alaa('POST', '/api/admins', { username: 'ayoub', full_name: 'الشيخ أيوب', password: 'secret1' })).status, 201);
  const ayoub = await login('ayoub', 'secret1');
  assert.strictEqual((await ayoub('GET', '/api/admins')).body.admins.length, 2);

  const g = (await ayoub('POST', '/api/quran/groups', { name: 'حلقة المبتدئين', level: 'مبتدئ', meet_day: 6 })).body.group;
  const juz30 = Q().segments.filter((s) => s.juz === 30).map((s) => s.id);
  const res = await ayoub('POST', '/api/quran/students', {
    username: 'talib1', password: 'secret1', first_name: 'أحمد', last_name: 'بن علي', age: 12, group_id: g.id, weak_reps: 2,
    memorized: Object.fromEntries(juz30.map((id, i) => [id, i < 3 ? 'w' : 's'])),
  });
  assert.strictEqual(res.status, 201, JSON.stringify(res.body));
  const sid = res.body.student.id;
  // أيوب وعلاء يريان نفس الطالب ويعدّلانه
  assert.strictEqual((await alaa('GET', `/api/quran/students/${sid}`)).status, 200);
  assert.strictEqual((await alaa('PUT', `/api/quran/students/${sid}`, { first_name: 'أحمد', last_name: 'بن علي', group_id: g.id, weak_reps: 2 })).status, 200);

  const talib = await login('talib1', 'secret1');
  const me = (await talib('GET', `/api/quran/students/${sid}`)).body;
  assert.strictEqual(me.week.length, 7);
  assert.strictEqual(me.student.week_start, 6);
  assert.strictEqual(me.progress.percent, 0);
  assert.strictEqual((await talib('GET', '/api/admins')).status, 403);
  assert.strictEqual((await talib('PUT', `/api/quran/students/${sid}`, { first_name: 'x' })).status, 403);

  // الطالب يختار ما راجعه اليوم: جزء عمّ كاملًا
  const r = (await talib('PUT', `/api/quran/students/${sid}/review`, { ids: juz30 })).body;
  assert.strictEqual(r.saved, juz30.length);
  assert.strictEqual(r.progress.solid_done, r.progress.solid_total);
  assert.ok(r.progress.weak_done < r.progress.weak_total); // ما يحتاج مراجعة: مرتين
  assert.strictEqual((await talib('PUT', `/api/quran/students/${sid}/review`, { ids: [1], date: '2099-01-01' })).status, 400);
  const after = (await talib('GET', `/api/quran/students/${sid}`)).body;
  const todayRow = after.week.find((d) => d.date === after.today);
  assert.ok(todayRow.solid > 0 && todayRow.weak > 0);
  assert.ok(todayRow.label.length > 0);
  // إعادة الحفظ تعوّض اختيار اليوم
  await talib('PUT', `/api/quran/students/${sid}/review`, { ids: [] });
  assert.strictEqual((await talib('GET', `/api/quran/students/${sid}`)).body.progress.percent, 0);

  // الدرس الجديد: 70 قراءة
  const lesson = (await ayoub('POST', `/api/quran/students/${sid}/lessons`, { content: 'الملك 1-14', athman: 1 })).body.lesson;
  assert.strictEqual(lesson.target, 70);
  await talib('PUT', `/api/quran/lessons/${lesson.id}/reps`, {});
  let c = (await talib('PUT', `/api/quran/lessons/${lesson.id}/reps`, { add: 5 })).body;
  assert.strictEqual(c.total, 6);
  c = (await talib('PUT', `/api/quran/lessons/${lesson.id}/reps`, { count: 72 })).body;
  assert.deepStrictEqual([c.total, c.reached], [72, true]);

  assert.strictEqual(c.week_total, 72);
  // عدّاد الأسبوع: قراءات أسبوع سابق لا تُحتسب
  const old = (await ayoub('POST', `/api/quran/students/${sid}/lessons`, { content: 'قديم', assigned_on: '2026-01-03' })).body.lesson;
  await talib('PUT', `/api/quran/lessons/${old.id}/reps`, { date: '2026-01-05', count: 40 });
  const ov0 = (await alaa('GET', '/api/quran/overview')).body.students[0];
  assert.strictEqual(ov0.lesson.week_total, 72);
  // الطالب يعدّل الدرس الذي تلقّاه (لا عدد القراءات الذي حدّده الشيخ)
  const ed = await talib('PUT', `/api/quran/lessons/${lesson.id}`, { content: 'الملك 1-15', athman: 2, target: 5 });
  assert.deepStrictEqual([ed.body.lesson.content, ed.body.lesson.athman, ed.body.lesson.target], ['الملك 1-15', 2, 70]);
  // السجلّ: أسابيع السنة، وأسبوع جانفي فيه 40 قراءة
  const hist = (await talib('GET', `/api/quran/students/${sid}/history?year=2026`)).body;
  assert.ok(hist.weeks.length > 40);
  assert.strictEqual(hist.weeks.find((w) => w.start === '2026-01-03').reps, 40);
  // بياناتي وصورتي
  const me2 = await talib('PUT', '/api/me', { first_name: 'أحمد', last_name: 'العلوي', age: 13, phone: '20123456' });
  assert.strictEqual(me2.body.user.full_name, 'أحمد العلوي');
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const ph = await talib('PUT', '/api/me/photo', { image: png });
  assert.strictEqual(ph.body.user.has_photo, true);
  const img = await handle(new Request(`http://localhost/api/users/${sid}/photo`, { headers: { cookie: (await login('alaa', 'admin123').then(() => null)) || '' } }));
  assert.strictEqual(img.status, 401);
  assert.strictEqual((await talib('PUT', '/api/me/photo', { image: 'data:text/html;base64,AAAA' })).status, 400);

  // الطالب يضيف درسه ويحذفه، ولا يحذف درس الشيخ
  const own = await talib('POST', `/api/quran/students/${sid}/lessons`, { content: 'الملك 15-30', athman: 1 });
  assert.strictEqual(own.status, 201);
  assert.strictEqual((await talib('DELETE', `/api/quran/lessons/${lesson.id}`)).status, 403);
  assert.strictEqual((await talib('DELETE', `/api/quran/lessons/${own.body.lesson.id}`)).status, 200);
  assert.strictEqual((await talib('POST', `/api/quran/attendance`, { date: '2026-11-07', marks: {} })).status, 403);

  // الحضور جملة واحدة لكل الطلبة
  assert.strictEqual((await ayoub('POST', '/api/quran/attendance', { date: '2026-11-08', marks: { [sid]: 'excused' } })).body.saved, 1);
  assert.deepStrictEqual((await alaa('GET', '/api/quran/attendance?date=2026-11-08')).body.marks, { [sid]: 'excused' });

  // اللقاء والتقييم يراه الطالب
  const m = await alaa('POST', `/api/quran/students/${sid}/meetings`, { attendance: 'present', review_eval: 'good', hifz_eval: 'excellent', lesson_id: lesson.id, note: 'بارك الله فيك' });
  assert.strictEqual(m.status, 201);
  assert.strictEqual((await talib('GET', `/api/quran/students/${sid}`)).body.meetings[0].note, 'بارك الله فيك');
  assert.strictEqual((await ayoub('POST', `/api/quran/groups/${g.id}/attendance`, { date: '2026-11-07', marks: { [sid]: 'absent' } })).body.saved, 1);

  const ov = (await alaa('GET', '/api/quran/overview')).body;
  assert.strictEqual(ov.students.length, 1);
  assert.strictEqual(ov.students[0].memorized, undefined);
  assert.strictEqual(ov.students[0].review.percent, 0);
  assert.strictEqual((await alaa('DELETE', `/api/admins/${(await alaa('GET', '/api/me')).body.user.id}`)).status, 400);
  assert.strictEqual((await ayoub('DELETE', `/api/quran/students/${sid}`)).status, 200);
});
