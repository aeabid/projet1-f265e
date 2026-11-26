// حلقة التحفيظ: متابعة حفظ ومراجعة الطلبة
// المحفوظ (جيد / يحتاج مراجعة) ← مراجعة يختارها الطالب كل يوم، الدرس الجديد وعدّاد الـ60، اللقاء الأسبوعي والتقييم
import '../public/quran-data.js';

const Q = globalThis.QURAN;
const RATINGS = ['excellent', 'good', 'average', 'weak'];
const ATTENDANCE = ['present', 'absent', 'excused'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// الدرس الجديد: 60 قراءة في الأسبوع دائمًا، ومقداره نصف ثمن أو ثمن أو ثمنان
const LESSON_TARGET = 60;
const ATHMAN = [0.5, 1, 2];

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
    // حالة واحدة: محفوظ (القيمة القديمة «يحتاج مراجعة» تُعتبر محفوظًا)
    if (Number.isInteger(id) && id >= 0 && id < Q.segments.length && (v === 's' || v === 'w')) out[id] = 's';
  }
  return out;
}
const idsOf = (mem, kind) => Object.entries(mem || {}).filter(([, v]) => v === kind).map(([k]) => Number(k));

// حجم ما رُوجع بالأحزاب، مع عدد مرات القراءة (السورة الواحدة قد تُقرأ أكثر من مرة في اليوم)
const readSize = (items) => Math.round(items.reduce((t, i) => t + (Q.segments[i.seg_id]?.size || 0) * (i.count || 1), 0) * 10) / 10;

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

export function registerQuranRoutes({ route, pool, all, one, HttpError, text, date, hashPassword, password, today, notify }) {
  const STAFF = ['admin'];
  const q = (method, path, roles, handler) =>
    route(method, path, roles, handler);

  const rating = (v, name) => {
    if (v === undefined || v === null || v === '') return null;
    const t = String(v);
    if (!RATINGS.includes(t) && !/^[1-5]$/.test(t)) throw new HttpError(400, `${name}: قيمة غير صالحة`);
    return t;
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
    const items = await all(`SELECT student_id, date::text, seg_id, count FROM quran_review_items WHERE student_id = ANY($1::int[]) AND date >= $2 AND date <= $3`, [ids, minStart, day]);
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
        reviewed_today: readSize(items.filter((i) => i.student_id === st.id && i.date === day)),
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
  // تسجيل حضور طالب في حصة أسبوعه (لقاء واحد في الأسبوع)، وإشعار الطالب إذا غاب مرتين متتاليتين
  async function markAttendance(st, session, attendance, userId, extra = null) {
    const end = addDays(session, 6);
    const old = await one('SELECT id, date::text, attendance, note FROM quran_meetings WHERE student_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date LIMIT 1', [st.id, session, end]);
    let row;
    if (extra) {
      const cols = ['attendance', 'review_eval', 'hifz_eval', 'ada_eval', 'tajweed_eval', 'lesson_id', 'note'];
      const vals = [attendance, extra.review_eval, extra.hifz_eval, extra.ada_eval, extra.tajweed_eval, extra.lesson_id, extra.note];
      row = old
        ? await one(`UPDATE quran_meetings SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING id, date::text, attendance`, [old.id, ...vals])
        : await one(
            `INSERT INTO quran_meetings (student_id, date, created_by, ${cols.join(', ')}) VALUES ($1, $2, $3, ${cols.map((_, i) => `$${i + 4}`).join(', ')})
             RETURNING id, date::text, attendance`,
            [st.id, session, userId, ...vals]
          );
    } else {
      row = old
        ? await one('UPDATE quran_meetings SET attendance = $2 WHERE id = $1 RETURNING id, date::text, attendance', [old.id, attendance])
        : await one('INSERT INTO quran_meetings (student_id, date, attendance, created_by) VALUES ($1, $2, $3, $4) RETURNING id, date::text, attendance', [st.id, session, attendance, userId]);
    }
    if (attendance === 'absent' && old?.attendance !== 'absent') {
      const prev = await one('SELECT attendance FROM quran_meetings WHERE student_id = $1 AND date < $2 ORDER BY date DESC LIMIT 1', [st.id, session]);
      if (prev?.attendance === 'absent') {
        await notify([st.id], {
          kind: 'absence', title: '⚠️ غبت عن حصّتين متتاليتين',
          body: 'نفتقدك في الحلقة! حافظ على حضورك، وإن كان لك عذر فأخبر الشيخ.', link: '#/my-progress',
        });
      }
    }
    return { row, old };
  }
  const sessionOf = (st, ref) => weekStartOf(ref, st.week_start);

  // حضور كل الطلبة لحصة الأسبوع الذي فيه اليوم ref
  q('GET', '/api/quran/attendance', STAFF, async ({ query }) => {
    const ref = date(query.get('week') || query.get('date') || today());
    const sts = await all('SELECT user_id AS id, week_start FROM quran_students');
    const rows = await all('SELECT student_id, date::text, attendance FROM quran_meetings WHERE date BETWEEN $1 AND $2', [addDays(ref, -6), addDays(ref, 6)]);
    const marks = {};
    const sessions = {};
    for (const st of sts) {
      const ses = sessionOf(st, ref);
      sessions[st.id] = ses;
      const m = rows.find((r) => r.student_id === st.id && r.date >= ses && r.date <= addDays(ses, 6));
      if (m) marks[st.id] = m.attendance;
    }
    return { week: ref, marks, sessions };
  });
  q('POST', '/api/quran/attendance', STAFF, async ({ user, body }) => {
    const ref = date(body.week || body.date);
    if (ref > today()) throw new HttpError(400, 'لا يمكن تسجيل حضور حصة لم تأت بعد');
    const marks = body.marks && typeof body.marks === 'object' ? body.marks : {};
    const sts = await all('SELECT user_id AS id, week_start FROM quran_students');
    let n = 0;
    for (const st of sts) {
      const a = marks[st.id];
      if (!ATTENDANCE.includes(a)) continue;
      await markAttendance(st, sessionOf(st, ref), a, user.id);
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
      await markAttendance({ id: user_id, week_start: g.meet_day }, weekStartOf(day, g.meet_day), a, user.id);
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
      target: LESSON_TARGET,
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
    const items = await all(`SELECT date::text, seg_id, count FROM quran_review_items WHERE student_id = $1 AND date BETWEEN $2 AND $3 ORDER BY seg_id`, [st.id, start, end]);
    const lessons = await all(
      `SELECT l.id, l.assigned_on::text, l.content, l.athman::float8 AS athman, l.target, l.created_by, u.full_name AS by_name,
         COALESCE((SELECT SUM(count) FROM quran_lesson_reps r WHERE r.lesson_id = l.id), 0)::int AS total
       FROM quran_lessons l LEFT JOIN users u ON u.id = l.created_by WHERE l.student_id = $1 ORDER BY l.assigned_on DESC, l.id DESC LIMIT 30`,
      [st.id]
    );
    // المقرر: مقرر الأسبوع المعروض (أسبوع سابق: مقرره وتكراراته في ذلك الأسبوع)
    const lastDay = end < day ? end : day;
    const lesson = lessons.find((l) => l.assigned_on <= lastDay) || null;
    if (lesson) {
      lesson.reps = await all('SELECT date::text, count FROM quran_lesson_reps WHERE lesson_id = $1 ORDER BY date', [lesson.id]);
      lesson.week_start = start;
      lesson.week_total = lesson.reps.filter((r) => r.date >= start && r.date <= end).reduce((t, r) => t + r.count, 0);
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
      const dayItems = items.filter((x) => x.date === d);
      const ids = dayItems.map((x) => x.seg_id);
      week.push({
        date: d,
        ids,
        // عدد مرات قراءة كل مقطع ذلك اليوم
        counts: Object.fromEntries(dayItems.filter((x) => x.count > 1).map((x) => [x.seg_id, x.count])),
        solid: readSize(dayItems.filter((x) => st.memorized[x.seg_id] === 's')),
        weak: readSize(dayItems.filter((x) => st.memorized[x.seg_id] === 'w')),
        other: readSize(dayItems.filter((x) => !st.memorized[x.seg_id])),
        label: Q.rangeLabel(ids.map((id) => Q.segments[id]), Object.fromEntries(dayItems.map((x) => [x.seg_id, x.count]))),
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
    // counts: { [مقطع]: عدد مرات القراءة اليوم } (افتراضيًا مرة واحدة، حتى 20)
    const counts = ids.map((i) => Math.min(20, Math.max(1, Math.floor(Number(body.counts?.[i]) || 1))));
    await pool.query('DELETE FROM quran_review_items WHERE student_id = $1 AND date = $2', [st.id, day]);
    if (ids.length) {
      await pool.query(
        `INSERT INTO quran_review_items (student_id, date, seg_id, kind, count)
         SELECT $1, $2, x.id, ($4::jsonb ->> x.id::text), x.c FROM unnest($3::int[], $5::int[]) AS x(id, c) ON CONFLICT DO NOTHING`,
        [st.id, day, ids, JSON.stringify(st.memorized || {}), counts]
      );
    }
    const start = weekStartOf(day, st.week_start);
    const items = await all('SELECT date::text, seg_id FROM quran_review_items WHERE student_id = $1 AND date BETWEEN $2 AND $3', [st.id, start, addDays(start, 6)]);
    const { solid_left, weak_left, ...progress } = reviewProgress(st, items);
    return { saved: ids.length, size: readSize(ids.map((id, k) => ({ seg_id: id, count: counts[k] }))), progress };
  });

  // ---------- الدرس الجديد وعدّاد القراءات ----------
  // تاريخ الإملاء: افتراضيًا يوم لقاء هذا الأسبوع، والطالب يختار أي يوم من أيام هذا الأسبوع
  const lessonDate = (user, st, value, fallback) => {
    const d = value ? date(value, 'تاريخ الإملاء') : fallback ?? weekStartOf(today(), st.week_start);
    if (d > today()) throw new HttpError(400, 'تاريخ الإملاء لم يأت بعد');
    // الطالب: أي يوم من أيام هذا الأسبوع (الافتراضي يوم اللقاء)
    if (user.role === 'talib' && d !== fallback && d < weekStartOf(today(), st.week_start)) throw new HttpError(400, 'تاريخ الإملاء: اختر يومًا من أيام هذا الأسبوع');
    return d;
  };

  // الدرس الجديد: يضيفه المشرف، أو الطالب نفسه
  q('POST', '/api/quran/students/:id/lessons', ['admin', 'talib'], async ({ user, params, body }) => {
    const st = await loadStudent(user, params.id);
    const athman = Number(body.athman ?? 1);
    if (!ATHMAN.includes(athman)) throw new HttpError(400, 'المقدار: نصف ثمن أو ثمن أو ثمنان');
    const lesson = await one(
      `INSERT INTO quran_lessons (student_id, assigned_on, content, athman, target, created_by) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, assigned_on::text, content, athman::float8 AS athman, target`,
      [st.id, lessonDate(user, st, body.assigned_on), text(body.content, { required: true, max: 300, name: 'المقرر' }), athman,
        LESSON_TARGET, user.id]
    );
    return [201, { lesson }];
  });
  async function loadLesson(user, id, opts) {
    const l = await one('SELECT id, student_id, assigned_on::text, target, created_by FROM quran_lessons WHERE id = $1', [Number(id) || 0]);
    if (!l) throw new HttpError(404, 'المقرر غير موجود');
    l.student = await loadStudent(user, l.student_id, opts);
    return l;
  }
  // الطالب يحذف فقط درسًا أضافه هو
  q('DELETE', '/api/quran/lessons/:id', ['admin', 'talib'], async ({ user, params }) => {
    const l = await loadLesson(user, params.id);
    if (user.role === 'talib' && l.created_by !== user.id) throw new HttpError(403, 'هذا المقرر أملاه الشيخ: لا يمكنك حذفه');
    await pool.query('DELETE FROM quran_lessons WHERE id = $1', [l.id]);
    return { ok: true };
  });
  // add: زيادة (عدّاد +1 أو +n)، count: كتابة العدد مباشرة لذلك اليوم
  q('PUT', '/api/quran/lessons/:id/reps', ['admin', 'talib'], async ({ user, params, body }) => {
    const l = await loadLesson(user, params.id);
    const day = body.date ? date(body.date) : today();
    if (day > today() || day < l.assigned_on) throw new HttpError(400, 'التاريخ خارج مدة المقرر');
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

  // تعديل الدرس: الطالب يصحّح ما تلقّاه (السورة، المقدار، التاريخ)
  q('PUT', '/api/quran/lessons/:id', ['admin', 'talib'], async ({ user, params, body }) => {
    const l = await loadLesson(user, params.id);
    const athman = Number(body.athman ?? 1);
    if (!ATHMAN.includes(athman)) throw new HttpError(400, 'المقدار: نصف ثمن أو ثمن أو ثمنان');
    const lesson = await one(
      `UPDATE quran_lessons SET content = $1, athman = $2, assigned_on = $3 WHERE id = $4
       RETURNING id, assigned_on::text, content, athman::float8 AS athman, target`,
      [text(body.content, { required: true, max: 300, name: 'المقرر' }), athman, lessonDate(user, l.student, body.assigned_on, l.assigned_on), l.id]
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
    const items = await all('SELECT date::text, seg_id, kind, count FROM quran_review_items WHERE student_id = $1 AND date BETWEEN $2 AND $3', [st.id, from, addDays(to, 6)]);
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
      const size = (list) => Math.round(list.reduce((t, i) => t + (Q.segments[i.seg_id]?.size || 0) * (i.count || 1), 0) * 100) / 100;
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
    const ref = body.date ? date(body.date) : today();
    if (ref > today()) throw new HttpError(400, 'لا يمكن تقييم حصة لم تأت بعد');
    const session = sessionOf(st, ref);
    // المقرر المسمَّع: مقرر ذلك الأسبوع كما كتبه الطالب (أو آخر مقرر قبله)
    let lessonId = null;
    if (body.lesson_id) lessonId = (await loadLesson(user, body.lesson_id, { write: true })).id;
    else lessonId = (await one('SELECT id FROM quran_lessons WHERE student_id = $1 AND assigned_on <= $2 ORDER BY assigned_on DESC, id DESC LIMIT 1', [st.id, addDays(session, 6)]))?.id ?? null;
    const note = text(body.note, { max: 1000, name: 'الملاحظة' }) || null;
    const { row: meeting, old } = await markAttendance(st, session, attendance, user.id, {
      review_eval: rating(body.review_eval, 'تقييم المراجعة'), hifz_eval: rating(body.hifz_eval, 'تقييم الحفظ'),
      ada_eval: rating(body.ada_eval, 'تقييم الأداء'), tajweed_eval: rating(body.tajweed_eval, 'تقييم التجويد'), lesson_id: lessonId, note,
    });
    if (note && note !== (old?.note || '')) {
      await notify([st.id], { kind: 'note', title: `📝 ملاحظة جديدة من ${user.full_name}`, body: note, link: '#/home' });
    }
    return [201, { meeting }];
  });
  q('DELETE', '/api/quran/meetings/:id', STAFF, async ({ user, params }) => {
    const m = await one('SELECT id, student_id FROM quran_meetings WHERE id = $1', [params.id]);
    if (!m) throw new HttpError(404, 'اللقاء غير موجود');
    await loadStudent(user, m.student_id, { write: true });
    await pool.query('DELETE FROM quran_meetings WHERE id = $1', [m.id]);
    return { ok: true };
  });

  // ---------- إحصاءات فترة: الحضور، الورد (أحزاب)، تكرار المقرر ----------
  async function activity(ids, from, to) {
    if (!ids.length) return { items: [], reps: [], meets: [] };
    const [items, reps, meets] = await Promise.all([
      all('SELECT student_id, date::text, seg_id, count FROM quran_review_items WHERE student_id = ANY($1::int[]) AND date BETWEEN $2 AND $3', [ids, from, to]),
      all(`SELECT l.student_id, r.date::text, SUM(r.count)::int AS count FROM quran_lesson_reps r JOIN quran_lessons l ON l.id = r.lesson_id
           WHERE l.student_id = ANY($1::int[]) AND r.date BETWEEN $2 AND $3 GROUP BY l.student_id, r.date`, [ids, from, to]),
      all('SELECT student_id, date::text, attendance, hifz_eval, ada_eval FROM quran_meetings WHERE student_id = ANY($1::int[]) AND date BETWEEN $2 AND $3', [ids, from, to]),
    ]);
    return { items, reps, meets };
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  function bucket(act, id, from, to) {
    const inR = (x) => x.student_id === id && x.date >= from && x.date <= to;
    const its = act.items.filter(inR);
    const ms = act.meets.filter(inR);
    return {
      read: r1(its.reduce((t, i) => t + (Q.segments[i.seg_id]?.size || 0) * (i.count || 1), 0)),
      days: new Set(its.map((i) => i.date)).size,
      reps: act.reps.filter(inR).reduce((t, r) => t + r.count, 0),
      present: ms.filter((m) => m.attendance === 'present').length,
      absent: ms.filter((m) => m.attendance === 'absent').length,
      excused: ms.filter((m) => m.attendance === 'excused').length,
      att: ms.sort((a, b) => a.date.localeCompare(b.date))[0]?.attendance || null,
      hifz_eval: ms[0]?.hifz_eval || null,
      ada_eval: ms[0]?.ada_eval || null,
    };
  }
  const groupStudents = (gid) => all(`${STUDENT_SELECT} WHERE qs.active AND qs.group_id = $1 ORDER BY u.full_name`, [gid]);

  // السجل: جدول شامل لطلبة مجموعة على مرّ الأسابيع
  q('GET', '/api/quran/groups/:id/record', STAFF, async ({ user, params, query }) => {
    const g = await loadGroup(user, params.id);
    const day = today();
    const n = Math.min(12, Math.max(1, Number(query.get('weeks')) || 4));
    const ref = DATE_RE.test(query.get('to') || '') && query.get('to') <= day ? query.get('to') : day;
    const last = weekStartOf(ref, g.meet_day);
    const weeks = [];
    for (let i = n - 1; i >= 0; i--) weeks.push(addDays(last, -7 * i));
    const sts = await groupStudents(g.id);
    const act = await activity(sts.map((x) => x.id), weeks[0], addDays(last, 6));
    const students = sts.map((st) => {
      const mem = r1(Q.sizeOf(Object.keys(st.memorized || {}).map(Number)));
      return {
        id: st.id, full_name: st.full_name, has_photo: st.has_photo, photo_v: st.photo_v, memorized: mem,
        weeks: weeks.map((w) => {
          const b = bucket(act, st.id, w, addDays(w, 6));
          return { ...b, ward: mem ? Math.round((b.read / mem) * 100) : null };
        }),
      };
    });
    return { group: g, weeks, target: LESSON_TARGET, students, today: day, has_next: addDays(last, 7) <= day };
  });

  // التحديات: ترتيب طلبة المجموعة في الحضور، وتكرار المقرر، والورد (أسبوعيًا، شهريًا، إجماليًا)
  // نقاط الورد (عادلة): الأحزاب المقروءة × نسبة الإنجاز (بحدّ أقصى 100%)
  // من أتمّ محفوظه نال نقاطًا بعدد ما قرأ، ومن لم يتمّه نقصت نقاطه بقدر ما بقي
  const wardPoints = (read, need) => (need > 0 ? r1(read * Math.min(1, read / need)) : null);

  async function challengeData(user, gid, period) {
    const day = today();
    const g = gid ? await one('SELECT id, name, meet_day FROM quran_groups WHERE id = $1', [gid]) : null;
    if (!g) return null;
    const sts = await groupStudents(g.id);
    const thisWeek = weekStartOf(day, g.meet_day);
    const from = period === 'week' ? thisWeek : period === 'month' ? `${day.slice(0, 7)}-01` : '2000-01-01';
    const act = await activity(sts.map((x) => x.id), from, day);
    const weeksBetween = (a) => Math.floor((parse(thisWeek) - parse(weekStartOf(a, g.meet_day))) / (7 * 864e5)) + 1;
    const rows = sts.map((st) => {
      let start = from;
      if (period === 'all') {
        const dates = [...act.items, ...act.reps, ...act.meets].filter((x) => x.student_id === st.id).map((x) => x.date).sort();
        start = dates[0] || thisWeek;
      }
      const w = period === 'week' ? 1 : weeksBetween(start);
      const b = bucket(act, st.id, start, day);
      const mem = r1(Q.sizeOf(Object.keys(st.memorized || {}).map(Number)));
      const marked = b.present + b.absent + b.excused;
      const need = r1(mem * w);
      return {
        id: st.id, full_name: st.full_name, has_photo: st.has_photo, photo_v: st.photo_v, me: st.id === user.id,
        start, weeks: w, memorized: mem,
        attendance: marked ? Math.round((b.present / marked) * 100) : null, present: b.present, absent: b.absent, excused: b.excused, marked,
        lesson: Math.round((b.reps / (LESSON_TARGET * w)) * 100), reps: b.reps, reps_target: LESSON_TARGET * w,
        ward: mem ? Math.round((b.read / need) * 100) : null, read: b.read, ward_target: need,
        ward_points: wardPoints(b.read, need),
      };
    });
    return { g, rows, act, thisWeek };
  }

  q('GET', '/api/quran/challenges', ['admin', 'talib'], async ({ user, query }) => {
    let gid = Number(query.get('group_id')) || 0;
    if (user.role === 'talib') gid = (await one('SELECT group_id FROM quran_students WHERE user_id = $1', [user.id]))?.group_id || 0;
    const groups = user.role === 'admin' ? await all('SELECT id, name, meet_day FROM quran_groups ORDER BY name') : [];
    if (!gid && groups.length) gid = groups[0].id;
    const period = ['week', 'month', 'all'].includes(query.get('period')) ? query.get('period') : 'week';
    const data = await challengeData(user, gid, period);
    if (!data) return { group: null, groups, rankings: null };
    const { g, rows } = data;
    const rank = (k) => {
      const list = [...rows].sort((a, b) => (b[k] ?? -1) - (a[k] ?? -1));
      let prev, pos = 0;
      return list.map((r, i) => {
        if (r[k] !== prev) pos = i + 1;
        prev = r[k];
        return { ...r, rank: r[k] === null ? null : pos };
      });
    };
    return {
      group: g, groups, period, from: period === 'all' ? null : weekStartOf(today(), g.meet_day),
      rankings: { attendance: rank('attendance'), lesson: rank('lesson'), ward: rank('ward_points') },
    };
  });

  // تفاصيل نسبة طالب في التحديات: أسبوعًا بأسبوع
  q('GET', '/api/quran/challenges/student/:id', ['admin', 'talib'], async ({ user, params, query }) => {
    const st = await loadStudent(user, params.id);
    if (!st.group_id) throw new HttpError(404, 'الطالب ليس في مجموعة');
    const period = ['week', 'month', 'all'].includes(query.get('period')) ? query.get('period') : 'week';
    const data = await challengeData(user, st.group_id, period);
    const row = data.rows.find((x) => x.id === st.id);
    if (!row) throw new HttpError(404, 'الطالب غير موجود');
    const weeks = [];
    for (let w = weekStartOf(row.start, data.g.meet_day); w <= data.thisWeek; w = addDays(w, 7)) {
      const from = w < row.start ? row.start : w;
      const b = bucket(data.act, st.id, from, addDays(w, 6));
      weeks.push({ start: w, att: b.att, read: b.read, days: b.days, reps: b.reps, ward: row.memorized ? Math.round((b.read / row.memorized) * 100) : null });
    }
    return { student: row, group: data.g, period, target: LESSON_TARGET, weeks: weeks.reverse() };
  });
}
