// حلقة التحفيظ: متابعة حفظ ومراجعة الطلبة
// المحفوظ (جيد / يحتاج مراجعة) ← مراجعة يختارها الطالب كل يوم، الدرس الجديد وعدّاد الـ70، اللقاء الأسبوعي والتقييم
import '../public/quran-data.js';

const Q = globalThis.QURAN;
const RATINGS = ['excellent', 'good', 'average', 'weak'];
const ATTENDANCE = ['present', 'absent', 'excused'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- التواريخ (نصوص YYYY-MM-DD بتوقيت UTC) ----------
const toDay = (d) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(`${s}T00:00:00Z`);
export const addDays = (s, n) => toDay(new Date(parse(s).getTime() + n * 864e5));
const weekday = (s) => parse(s).getUTCDay();
// بداية الأسبوع (يوم اللقاء مع الشيخ) التي تحتوي هذا اليوم
export const weekStartOf = (day, ws) => addDays(day, -((weekday(day) - ws + 7) % 7));

// المحفوظ: { [id المقطع]: 's' جيد | 'w' يحتاج مراجعة }
function cleanMemorized(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const [k, v] of Object.entries(value)) {
    const id = Number(k);
    if (Number.isInteger(id) && id >= 0 && id < Q.segments.length && (v === 's' || v === 'w')) out[id] = v;
  }
  return out;
}
const idsOf = (mem, kind) => Object.entries(mem || {}).filter(([, v]) => v === kind).map(([k]) => Number(k));

// تقدّم المراجعة في أسبوع: المحفوظ الجيد مرة واحدة على الأقل، وما يحتاج مراجعة weak_reps مرة
// items: [{ date, seg_id }] ما راجعه الطالب في الأسبوع
export function reviewProgress(st, items) {
  const count = new Map();
  for (const it of items) count.set(it.seg_id, (count.get(it.seg_id) || 0) + 1);
  const size = (id) => Q.segments[id]?.size || 0;
  const solid = idsOf(st.memorized, 's');
  const weak = idsOf(st.memorized, 'w');
  const reps = Math.max(1, st.weak_reps || 1);
  const r = (n) => Math.round(n * 100) / 100;
  const solidTotal = solid.reduce((t, i) => t + size(i), 0);
  const solidDone = solid.filter((i) => count.get(i)).reduce((t, i) => t + size(i), 0);
  const weakTotal = weak.reduce((t, i) => t + size(i), 0) * reps;
  const weakDone = weak.reduce((t, i) => t + Math.min(count.get(i) || 0, reps) * size(i), 0);
  const all = solidTotal + weakTotal;
  return {
    solid_total: r(solidTotal), solid_done: r(solidDone),
    weak_total: r(weakTotal), weak_done: r(weakDone), weak_reps: reps,
    percent: all ? Math.round(((solidDone + weakDone) / all) * 100) : null,
    // ما بقي هذا الأسبوع
    solid_left: solid.filter((i) => !count.get(i)),
    weak_left: weak.filter((i) => (count.get(i) || 0) < reps),
  };
}

export function registerQuranRoutes({ route, pool, all, one, HttpError, text, date, hashPassword, password, today }) {
  const STAFF = ['admin'];
  const q = (method, path, roles, handler) =>
    route(method, path, roles, handler);

  const rating = (v, name) => {
    if (v === undefined || v === null || v === '') return null;
    if (!RATINGS.includes(v)) throw new HttpError(400, `${name}: قيمة غير صالحة`);
    return v;
  };
  const int = (v, { min, max, def, name }) => {
    if (v === undefined || v === null || v === '') return def;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${name}: بين ${min} و${max}`);
    return n;
  };

  const STUDENT_SELECT = `SELECT qs.user_id AS id, qs.first_name, qs.last_name, qs.age, qs.level, qs.group_id,
      qs.week_start, qs.weak_reps, qs.lesson_target, qs.memorized, qs.active,
      u.username, u.full_name, u.phone, u.last_seen, u.photo IS NOT NULL AS has_photo, u.photo_v, g.name AS group_name
    FROM quran_students qs JOIN users u ON u.id = qs.user_id
    LEFT JOIN quran_groups g ON g.id = qs.group_id`;

  // من يرى الطالب: المشرفون (الشيخ والإدارة، نفس الصلاحيات)، والطالب نفسه
  async function loadStudent(user, id, { write = false } = {}) {
    const st = await one(`${STUDENT_SELECT} WHERE qs.user_id = $1`, [Number(id) || 0]);
    if (!st) throw new HttpError(404, 'الطالب غير موجود');
    if (user.role === 'admin') return st;
    if (user.role === 'talib' && st.id === user.id && !write) return st;
    throw new HttpError(404, 'الطالب غير موجود');
  }
  async function loadGroup(user, id) {
    const g = await one('SELECT * FROM quran_groups WHERE id = $1', [Number(id) || 0]);
    if (!g) throw new HttpError(404, 'المجموعة غير موجودة');
    return g;
  }
  // ملخّص أسبوع الطالب: المراجعة المنجزة، والدرس الحالي وعدد قراءاته
  async function weekSummary(students, day = today()) {
    if (!students.length) return new Map();
    const ids = students.map((s) => s.id);
    const minStart = addDays(day, -6);
    const items = await all(`SELECT student_id, date::text, seg_id FROM quran_review_items WHERE student_id = ANY($1::int[]) AND date >= $2 AND date <= $3`, [ids, minStart, day]);
    const lessons = await all(
      `SELECT DISTINCT ON (l.student_id) l.id, l.student_id, l.assigned_on::text, l.content, l.athman::float8 AS athman, l.target,
         COALESCE((SELECT SUM(count) FROM quran_lesson_reps r WHERE r.lesson_id = l.id), 0)::int AS total
       FROM quran_lessons l WHERE l.student_id = ANY($1::int[]) AND l.assigned_on <= $2 ORDER BY l.student_id, l.assigned_on DESC, l.id DESC`,
      [ids, day]
    );
    // عدّاد الدرس يبدأ من الصفر كل أسبوع (القديم يبقى في السجلّ)
    const reps = lessons.length
      ? await all('SELECT lesson_id, date::text, count FROM quran_lesson_reps WHERE lesson_id = ANY($1::int[]) AND date >= $2', [lessons.map((l) => l.id), minStart])
      : [];
    const meetings = await all(
      `SELECT DISTINCT ON (student_id) student_id, date::text, attendance, review_eval, hifz_eval, ada_eval FROM quran_meetings
       WHERE student_id = ANY($1::int[]) ORDER BY student_id, date DESC`,
      [ids]
    );
    const out = new Map();
    for (const st of students) {
      const start = weekStartOf(day, st.week_start);
      const { solid_left, weak_left, ...progress } = reviewProgress(st, items.filter((i) => i.student_id === st.id && i.date >= start));
      out.set(st.id, {
        week_from: start,
        review: progress,
        reviewed_today: Q.sizeOf(items.filter((i) => i.student_id === st.id && i.date === day).map((i) => i.seg_id)),
        solid_hizb: Q.sizeOf(idsOf(st.memorized, 's')),
        weak_hizb: Q.sizeOf(idsOf(st.memorized, 'w')),
        lesson: (() => {
          const l = lessons.find((x) => x.student_id === st.id);
          return l ? { ...l, week_total: reps.filter((r) => r.lesson_id === l.id && r.date >= start).reduce((t, r) => t + r.count, 0) } : null;
        })(),
        last_meeting: meetings.find((m) => m.student_id === st.id) || null,
      });
    }
    return out;
  }
  const publicStudent = ({ memorized, ...st }, summary) => ({ ...st, ...summary });

  // ---------- النظرة العامة (الإدارة والشيخ) ----------
  q('GET', '/api/quran/overview', STAFF, async () => {
    const groups = await all(
      `SELECT g.id, g.name, g.level, g.meet_day, g.notes,
         (SELECT COUNT(*)::int FROM quran_students s WHERE s.group_id = g.id AND s.active) AS students
       FROM quran_groups g ORDER BY g.name`
    );
    const students = await all(`${STUDENT_SELECT} ORDER BY qs.active DESC, u.full_name`);
    const sum = await weekSummary(students.filter((s) => s.active));
    return { groups, students: students.map((s) => publicStudent(s, sum.get(s.id))), today: today() };
  });

  // ---------- المجموعات ----------
  async function readGroup(user, body) {
    return [
      text(body.name, { required: true, max: 80, name: 'اسم المجموعة' }),
      text(body.level, { max: 60, name: 'المستوى' }),
      int(body.meet_day, { min: 0, max: 6, def: 6, name: 'يوم اللقاء' }),
      text(body.notes, { max: 500, name: 'ملاحظات' }),
    ];
  }
  q('POST', '/api/quran/groups', STAFF, async ({ user, body }) => {
    const group = await one(
      'INSERT INTO quran_groups (name, level, meet_day, notes) VALUES ($1, $2, $3, $4) RETURNING *',
      await readGroup(user, body)
    );
    return [201, { group }];
  });
  q('PUT', '/api/quran/groups/:id', STAFF, async ({ user, params, body }) => {
    const g = await loadGroup(user, params.id);
    const values = await readGroup(user, body);
    const group = await one('UPDATE quran_groups SET name = $1, level = $2, meet_day = $3, notes = $4 WHERE id = $5 RETURNING *', [...values, g.id]);
    return { group };
  });
  q('DELETE', '/api/quran/groups/:id', STAFF, async ({ user, params }) => {
    const g = await loadGroup(user, params.id);
    await pool.query('DELETE FROM quran_groups WHERE id = $1', [g.id]);
    return { ok: true };
  });
  // الحضور الجماعي لكل الطلبة في قائمة واحدة
  q('GET', '/api/quran/attendance', STAFF, async ({ query }) => {
    const day = date(query.get('date') || today());
    const rows = await all('SELECT student_id, attendance FROM quran_meetings WHERE date = $1', [day]);
    return { date: day, marks: Object.fromEntries(rows.map((r) => [r.student_id, r.attendance])) };
  });
  q('POST', '/api/quran/attendance', STAFF, async ({ user, body }) => {
    const day = date(body.date);
    if (day > today()) throw new HttpError(400, 'لا يمكن تسجيل حضور يوم لم يأت بعد');
    const marks = body.marks && typeof body.marks === 'object' ? body.marks : {};
    const ids = (await all('SELECT user_id FROM quran_students')).map((r) => r.user_id);
    let n = 0;
    for (const id of ids) {
      const a = marks[id];
      if (!ATTENDANCE.includes(a)) continue;
      await pool.query(
        `INSERT INTO quran_meetings (student_id, date, attendance, created_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT (student_id, date) DO UPDATE SET attendance = EXCLUDED.attendance`,
        [id, day, a, user.id]
      );
      n++;
    }
    return { saved: n };
  });

  // حضور مجموعة كاملة في لقاء
  q('POST', '/api/quran/groups/:id/attendance', STAFF, async ({ user, params, body }) => {
    const g = await loadGroup(user, params.id);
    const day = date(body.date);
    const marks = body.marks && typeof body.marks === 'object' ? body.marks : {};
    const members = await all('SELECT user_id FROM quran_students WHERE group_id = $1', [g.id]);
    let n = 0;
    for (const { user_id } of members) {
      const a = marks[user_id];
      if (!ATTENDANCE.includes(a)) continue;
      await pool.query(
        `INSERT INTO quran_meetings (student_id, date, attendance, created_by) VALUES ($1, $2, $3, $4)
         ON CONFLICT (student_id, date) DO UPDATE SET attendance = EXCLUDED.attendance`,
        [user_id, day, a, user.id]
      );
      n++;
    }
    return { saved: n };
  });

  // ---------- الطلبة ----------
  async function readStudent(user, body, existing = null) {
    const first = text(body.first_name, { required: true, max: 60, name: 'الاسم' });
    const last = text(body.last_name, { max: 60, name: 'اللقب' });
    let groupId = null;
    let weekStart = body.week_start;
    if (body.group_id) {
      const g = await loadGroup(user, body.group_id);
      groupId = g.id;
      if (weekStart === undefined || weekStart === '') weekStart = g.meet_day;
    }
    return {
      first, last,
      full: [first, last].filter(Boolean).join(' '),
      age: int(body.age, { min: 3, max: 99, def: null, name: 'العمر' }),
      level: text(body.level, { max: 60, name: 'المستوى' }),
      groupId,
      weekStart: int(weekStart, { min: 0, max: 6, def: existing?.week_start ?? 6, name: 'بداية الأسبوع' }),
      weakReps: int(body.weak_reps, { min: 1, max: 14, def: existing?.weak_reps ?? 1, name: 'تكرار ما يحتاج مراجعة في الأسبوع' }),
      target: int(body.lesson_target, { min: 1, max: 1000, def: existing?.lesson_target ?? 70, name: 'عدد قراءات الدرس' }),
      active: body.active === undefined ? existing?.active ?? true : !!body.active,
    };
  }
  q('POST', '/api/quran/students', STAFF, async ({ user, body }) => {
    const s = await readStudent(user, body);
    const username = text(body.username, { required: true, max: 50, name: 'اسم المستخدم' });
    if (await one('SELECT 1 FROM users WHERE lower(username) = lower($1)', [username])) throw new HttpError(409, 'اسم المستخدم مستعمل');
    const { id } = await one(`INSERT INTO users (username, password_hash, full_name, role, phone) VALUES ($1, $2, $3, 'talib', $4) RETURNING id`, [
      username, hashPassword(password(body.password)), s.full, text(body.phone, { max: 30, name: 'الهاتف' }),
    ]);
    await pool.query(
      `INSERT INTO quran_students (user_id, first_name, last_name, age, level, group_id, week_start, weak_reps, lesson_target, memorized)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [id, s.first, s.last, s.age, s.level, s.groupId, s.weekStart, s.weakReps, s.target, JSON.stringify(cleanMemorized(body.memorized))]
    );
    return [201, { student: publicStudent(await loadStudent(user, id)) }];
  });
  q('PUT', '/api/quran/students/:id', STAFF, async ({ user, params, body }) => {
    const st = await loadStudent(user, params.id, { write: true });
    const s = await readStudent(user, body, st);
    await pool.query(
      `UPDATE quran_students SET first_name = $1, last_name = $2, age = $3, level = $4, group_id = $5,
         week_start = $6, weak_reps = $7, lesson_target = $8, active = $9 WHERE user_id = $10`,
      [s.first, s.last, s.age, s.level, s.groupId, s.weekStart, s.weakReps, s.target, s.active, st.id]
    );
    await pool.query('UPDATE users SET full_name = $1, phone = COALESCE($2, phone) WHERE id = $3', [s.full, text(body.phone, { max: 30, name: 'الهاتف' }), st.id]);
    if (body.password) {
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(password(body.password)), st.id]);
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [st.id]);
    }
    return { student: publicStudent(await loadStudent(user, st.id)) };
  });
  q('DELETE', '/api/quran/students/:id', STAFF, async ({ user, params }) => {
    const st = await loadStudent(user, params.id, { write: true });
    await pool.query(`DELETE FROM users WHERE id = $1 AND role = 'talib'`, [st.id]);
    return { ok: true };
  });

  // ملف الطالب: المحفوظ، خطة الأسبوع، الدرس الحالي، اللقاءات والملاحظات
  q('GET', '/api/quran/students/:id', ['admin', 'talib'], async ({ user, params, query }) => {
    const st = await loadStudent(user, params.id);
    const day = today();
    const ref = DATE_RE.test(query.get('week') || '') ? query.get('week') : day;
    const start = weekStartOf(ref, st.week_start);
    const end = addDays(start, 6);
    const items = await all(`SELECT date::text, seg_id FROM quran_review_items WHERE student_id = $1 AND date BETWEEN $2 AND $3 ORDER BY seg_id`, [st.id, start, end]);
    const lessons = await all(
      `SELECT l.id, l.assigned_on::text, l.content, l.athman::float8 AS athman, l.target, l.created_by, u.full_name AS by_name,
         COALESCE((SELECT SUM(count) FROM quran_lesson_reps r WHERE r.lesson_id = l.id), 0)::int AS total
       FROM quran_lessons l LEFT JOIN users u ON u.id = l.created_by WHERE l.student_id = $1 ORDER BY l.assigned_on DESC, l.id DESC LIMIT 30`,
      [st.id]
    );
    const lesson = lessons.find((l) => l.assigned_on <= day) || null;
    if (lesson) {
      lesson.reps = await all('SELECT date::text, count FROM quran_lesson_reps WHERE lesson_id = $1 ORDER BY date', [lesson.id]);
      const cur = weekStartOf(day, st.week_start);
      lesson.week_start = cur;
      lesson.week_total = lesson.reps.filter((r) => r.date >= cur).reduce((t, r) => t + r.count, 0);
    }
    const meetings = await all(
      `SELECT m.id, m.date::text, m.attendance, m.review_eval, m.hifz_eval, m.ada_eval, m.tajweed_eval, m.note, m.lesson_id,
         l.content AS lesson_content, u.full_name AS by_name
       FROM quran_meetings m LEFT JOIN quran_lessons l ON l.id = m.lesson_id LEFT JOIN users u ON u.id = m.created_by
       WHERE m.student_id = $1 ORDER BY m.date DESC LIMIT 60`,
      [st.id]
    );
    const repsWeek = await all(
      `SELECT r.date::text, SUM(r.count)::int AS count FROM quran_lesson_reps r JOIN quran_lessons l ON l.id = r.lesson_id
       WHERE l.student_id = $1 AND r.date BETWEEN $2 AND $3 GROUP BY r.date`,
      [st.id, start, end]
    );
    // جدول الأسبوع: كل يوم ما راجعه (جيد / يحتاج مراجعة) وعدد قراءات الدرس
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const ids = items.filter((x) => x.date === d).map((x) => x.seg_id);
      const of = (k) => ids.filter((id) => st.memorized[id] === k);
      const old = ids.filter((id) => !st.memorized[id]);
      week.push({
        date: d,
        ids,
        solid: Q.sizeOf(of('s')),
        weak: Q.sizeOf(of('w')),
        other: Q.sizeOf(old),
        label: Q.rangeLabel(ids.map((id) => Q.segments[id])),
        reps: repsWeek.find((r) => r.date === d)?.count || 0,
      });
    }
    const progress = reviewProgress(st, items);
    const summary = (await weekSummary([st], day)).get(st.id);
    return { student: { ...st, ...summary }, week, week_start: start, today: day, lesson, lessons, meetings, progress };
  });

  // المحفوظ: الطالب يحدّده بنفسه، والشيخ يعدّله
  q('PUT', '/api/quran/students/:id/memorized', ['admin', 'talib'], async ({ user, params, body }) => {
    const st = await loadStudent(user, params.id);
    const mem = cleanMemorized(body.memorized);
    await pool.query('UPDATE quran_students SET memorized = $1 WHERE user_id = $2', [JSON.stringify(mem), st.id]);
    return { memorized: mem, solid_hizb: Q.sizeOf(idsOf(mem, 's')), weak_hizb: Q.sizeOf(idsOf(mem, 'w')) };
  });

  // المراجعة: الطالب يختار ما راجعه في يوم (ids = كل ما راجعه ذلك اليوم، يعوّض ما سُجّل قبله)
  q('PUT', '/api/quran/students/:id/review', ['admin', 'talib'], async ({ user, params, body }) => {
    const st = await loadStudent(user, params.id);
    const day = body.date ? date(body.date) : today();
    if (day > today()) throw new HttpError(400, 'لا يمكن تسجيل مراجعة يوم لم يأت بعد');
    const ids = [...new Set((Array.isArray(body.ids) ? body.ids : []).map(Number))].filter((i) => Number.isInteger(i) && i >= 0 && i < Q.segments.length);
    await pool.query('DELETE FROM quran_review_items WHERE student_id = $1 AND date = $2', [st.id, day]);
    if (ids.length) {
      await pool.query(
        `INSERT INTO quran_review_items (student_id, date, seg_id, kind)
         SELECT $1, $2, x, ($4::jsonb ->> x::text) FROM unnest($3::int[]) AS x ON CONFLICT DO NOTHING`,
        [st.id, day, ids, JSON.stringify(st.memorized || {})]
      );
    }
    const start = weekStartOf(day, st.week_start);
    const items = await all('SELECT date::text, seg_id FROM quran_review_items WHERE student_id = $1 AND date BETWEEN $2 AND $3', [st.id, start, addDays(start, 6)]);
    const { solid_left, weak_left, ...progress } = reviewProgress(st, items);
    return { saved: ids.length, size: Q.sizeOf(ids), progress };
  });

  // ---------- الدرس الجديد وعدّاد القراءات ----------
  // الدرس الجديد: يضيفه المشرف، أو الطالب نفسه
  q('POST', '/api/quran/students/:id/lessons', ['admin', 'talib'], async ({ user, params, body }) => {
    const st = await loadStudent(user, params.id);
    const athman = Number(body.athman ?? 1);
    if (!(athman > 0 && athman <= 16)) throw new HttpError(400, 'عدد الأثمان غير صالح');
    const lesson = await one(
      `INSERT INTO quran_lessons (student_id, assigned_on, content, athman, target, created_by) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, assigned_on::text, content, athman::float8 AS athman, target`,
      [st.id, body.assigned_on ? date(body.assigned_on) : today(), text(body.content, { required: true, max: 300, name: 'الدرس' }), athman,
        int(body.target, { min: 1, max: 1000, def: st.lesson_target, name: 'عدد القراءات' }), user.id]
    );
    return [201, { lesson }];
  });
  async function loadLesson(user, id, opts) {
    const l = await one('SELECT id, student_id, assigned_on::text, target, created_by FROM quran_lessons WHERE id = $1', [Number(id) || 0]);
    if (!l) throw new HttpError(404, 'الدرس غير موجود');
    l.student = await loadStudent(user, l.student_id, opts);
    return l;
  }
  // الطالب يحذف فقط درسًا أضافه هو
  q('DELETE', '/api/quran/lessons/:id', ['admin', 'talib'], async ({ user, params }) => {
    const l = await loadLesson(user, params.id);
    if (user.role === 'talib' && l.created_by !== user.id) throw new HttpError(403, 'هذا الدرس أملاه الشيخ: لا يمكنك حذفه');
    await pool.query('DELETE FROM quran_lessons WHERE id = $1', [l.id]);
    return { ok: true };
  });
  // add: زيادة (عدّاد +1 أو +n)، count: كتابة العدد مباشرة لذلك اليوم
  q('PUT', '/api/quran/lessons/:id/reps', ['admin', 'talib'], async ({ user, params, body }) => {
    const l = await loadLesson(user, params.id);
    const day = body.date ? date(body.date) : today();
    if (day > today() || day < l.assigned_on) throw new HttpError(400, 'التاريخ خارج مدة الدرس');
    if (body.count !== undefined) {
      const n = int(body.count, { min: 0, max: 10000, def: 0, name: 'العدد' });
      await pool.query(
        `INSERT INTO quran_lesson_reps (lesson_id, date, count) VALUES ($1, $2, $3) ON CONFLICT (lesson_id, date) DO UPDATE SET count = EXCLUDED.count`,
        [l.id, day, n]
      );
    } else {
      const add = int(body.add ?? 1, { min: -100, max: 1000, def: 1, name: 'الزيادة' });
      await pool.query(
        `INSERT INTO quran_lesson_reps (lesson_id, date, count) VALUES ($1, $2, GREATEST($3, 0))
         ON CONFLICT (lesson_id, date) DO UPDATE SET count = GREATEST(quran_lesson_reps.count + $3, 0)`,
        [l.id, day, add]
      );
    }
    const { total } = await one('SELECT COALESCE(SUM(count), 0)::int AS total FROM quran_lesson_reps WHERE lesson_id = $1', [l.id]);
    const cur = weekStartOf(today(), l.student.week_start);
    const { week } = await one('SELECT COALESCE(SUM(count), 0)::int AS week FROM quran_lesson_reps WHERE lesson_id = $1 AND date >= $2', [l.id, cur]);
    const { count } = (await one('SELECT count FROM quran_lesson_reps WHERE lesson_id = $1 AND date = $2', [l.id, day])) || { count: 0 };
    return { total, week_total: week, day_count: count, target: l.target, reached: week >= l.target };
  });

  // تعديل الدرس: الطالب يصحّح ما تلقّاه (المقطع، الأثمان، التاريخ)، والمشرف أيضًا عدد القراءات
  q('PUT', '/api/quran/lessons/:id', ['admin', 'talib'], async ({ user, params, body }) => {
    const l = await loadLesson(user, params.id);
    const athman = Number(body.athman ?? 1);
    if (!(athman > 0 && athman <= 16)) throw new HttpError(400, 'عدد الأثمان غير صالح');
    const target = int(body.target, { min: 1, max: 1000, def: l.target, name: 'عدد القراءات' });
    const lesson = await one(
      `UPDATE quran_lessons SET content = $1, athman = $2, assigned_on = $3, target = $4 WHERE id = $5
       RETURNING id, assigned_on::text, content, athman::float8 AS athman, target`,
      [text(body.content, { required: true, max: 300, name: 'الدرس' }), athman, body.assigned_on ? date(body.assigned_on) : l.assigned_on,
        user.role === 'admin' || l.created_by === user.id ? target : l.target, l.id]
    );
    return { lesson };
  });

  // ---------- السجلّ: كل أسابيع السنة (الشهري والسنوي يُجمَعان منها) ----------
  q('GET', '/api/quran/students/:id/history', ['admin', 'talib'], async ({ user, params, query }) => {
    const st = await loadStudent(user, params.id);
    const day = today();
    const year = /^\d{4}$/.test(query.get('year') || '') ? query.get('year') : day.slice(0, 4);
    const from = weekStartOf(`${year}-01-01`, st.week_start);
    const to = `${year}-12-31` < day ? `${year}-12-31` : day;
    const items = await all('SELECT date::text, seg_id, kind FROM quran_review_items WHERE student_id = $1 AND date BETWEEN $2 AND $3', [st.id, from, addDays(to, 6)]);
    const reps = await all(
      `SELECT r.date::text, SUM(r.count)::int AS count FROM quran_lesson_reps r JOIN quran_lessons l ON l.id = r.lesson_id
       WHERE l.student_id = $1 AND r.date BETWEEN $2 AND $3 GROUP BY r.date`,
      [st.id, from, addDays(to, 6)]
    );
    const lessons = await all(
      `SELECT l.id, l.assigned_on::text, l.content, l.athman::float8 AS athman, l.target,
         COALESCE((SELECT SUM(count) FROM quran_lesson_reps r WHERE r.lesson_id = l.id), 0)::int AS total
       FROM quran_lessons l WHERE l.student_id = $1 AND l.assigned_on BETWEEN $2 AND $3 ORDER BY l.assigned_on`,
      [st.id, from, addDays(to, 6)]
    );
    const meetings = await all(
      `SELECT date::text, attendance, review_eval, hifz_eval, ada_eval, tajweed_eval, note FROM quran_meetings
       WHERE student_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date`,
      [st.id, from, addDays(to, 6)]
    );
    const weeks = [];
    for (let w = from; w <= to; w = addDays(w, 7)) {
      const e = addDays(w, 6);
      const its = items.filter((i) => i.date >= w && i.date <= e);
      const kindOf = (i) => i.kind || st.memorized[i.seg_id] || '';
      const size = (list) => Math.round(list.reduce((t, i) => t + (Q.segments[i.seg_id]?.size || 0), 0) * 100) / 100;
      weeks.push({
        start: w,
        solid: size(its.filter((i) => kindOf(i) === 's')),
        weak: size(its.filter((i) => kindOf(i) === 'w')),
        other: size(its.filter((i) => !kindOf(i))),
        days: new Set(its.map((i) => i.date)).size,
        label: Q.rangeLabel([...new Set(its.map((i) => i.seg_id))].map((id) => Q.segments[id])),
        reps: reps.filter((r) => r.date >= w && r.date <= e).reduce((t, r) => t + r.count, 0),
        lessons: lessons.filter((l) => l.assigned_on >= w && l.assigned_on <= e),
        meetings: meetings.filter((m) => m.date >= w && m.date <= e),
      });
    }
    return { year, student: { id: st.id, full_name: st.full_name, week_start: st.week_start }, weeks: weeks.reverse() };
  });

  // ---------- اللقاء: الحضور والتقييم والملاحظة ----------
  q('POST', '/api/quran/students/:id/meetings', STAFF, async ({ user, params, body }) => {
    const st = await loadStudent(user, params.id, { write: true });
    const attendance = body.attendance || 'present';
    if (!ATTENDANCE.includes(attendance)) throw new HttpError(400, 'الحضور غير صالح');
    let lessonId = null;
    if (body.lesson_id) lessonId = (await loadLesson(user, body.lesson_id, { write: true })).id;
    const meeting = await one(
      `INSERT INTO quran_meetings (student_id, date, attendance, review_eval, hifz_eval, ada_eval, tajweed_eval, lesson_id, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (student_id, date) DO UPDATE SET attendance = EXCLUDED.attendance, review_eval = EXCLUDED.review_eval,
         hifz_eval = EXCLUDED.hifz_eval, ada_eval = EXCLUDED.ada_eval, tajweed_eval = EXCLUDED.tajweed_eval,
         lesson_id = EXCLUDED.lesson_id, note = EXCLUDED.note
       RETURNING id, date::text, attendance`,
      [st.id, body.date ? date(body.date) : today(), attendance, rating(body.review_eval, 'تقييم المراجعة'), rating(body.hifz_eval, 'تقييم الحفظ'),
        rating(body.ada_eval, 'تقييم الأداء'), rating(body.tajweed_eval, 'تقييم التجويد'), lessonId, text(body.note, { max: 1000, name: 'الملاحظة' }), user.id]
    );
    return [201, { meeting }];
  });
  q('DELETE', '/api/quran/meetings/:id', STAFF, async ({ user, params }) => {
    const m = await one('SELECT id, student_id FROM quran_meetings WHERE id = $1', [params.id]);
    if (!m) throw new HttpError(404, 'اللقاء غير موجود');
    await loadStudent(user, m.student_id, { write: true });
    await pool.query('DELETE FROM quran_meetings WHERE id = $1', [m.id]);
    return { ok: true };
  });
}
