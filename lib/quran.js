// فضاء التحفيظ: الشيخ يتابع حفظ ومراجعة طلبته للقرآن
// المحفوظ (جيد / يحتاج مراجعة) ← خطة مراجعة يومية، الدرس الجديد وعدّاد الـ70، اللقاء الأسبوعي والتقييم
import '../public/quran-data.js';

const Q = globalThis.QURAN;
const RATINGS = ['excellent', 'good', 'average', 'weak'];
const ATTENDANCE = ['present', 'absent', 'excused'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// نفس جداول الملف netlify/database/migrations/20261203090000_quran.sql
// (قاعدة Supabase لا تطبّق الـ migrations وحدها: تُنشأ هنا عند أول استعمال)
const SCHEMA = `
CREATE TABLE IF NOT EXISTS quran_groups (
  id SERIAL PRIMARY KEY, name TEXT NOT NULL, level TEXT, sheikh_id INT REFERENCES users(id) ON DELETE SET NULL,
  meet_day SMALLINT NOT NULL DEFAULT 6 CHECK (meet_day BETWEEN 0 AND 6), notes TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
ALTER TABLE quran_groups ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS quran_students (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, first_name TEXT NOT NULL, last_name TEXT, age SMALLINT, level TEXT,
  group_id INT REFERENCES quran_groups(id) ON DELETE SET NULL, sheikh_id INT REFERENCES users(id) ON DELETE SET NULL,
  week_start SMALLINT NOT NULL DEFAULT 6 CHECK (week_start BETWEEN 0 AND 6),
  solid_days SMALLINT NOT NULL DEFAULT 7 CHECK (solid_days BETWEEN 1 AND 60),
  weak_days SMALLINT NOT NULL DEFAULT 7 CHECK (weak_days BETWEEN 1 AND 60),
  lesson_target INT NOT NULL DEFAULT 70, memorized JSONB NOT NULL DEFAULT '{}', active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS quran_students_group_idx ON quran_students (group_id);
ALTER TABLE quran_students ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS quran_lessons (
  id SERIAL PRIMARY KEY, student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, assigned_on DATE NOT NULL,
  content TEXT NOT NULL, athman NUMERIC(4,1) NOT NULL DEFAULT 1, target INT NOT NULL DEFAULT 70,
  created_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS quran_lessons_student_idx ON quran_lessons (student_id, assigned_on DESC);
ALTER TABLE quran_lessons ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS quran_lesson_reps (
  lesson_id INT NOT NULL REFERENCES quran_lessons(id) ON DELETE CASCADE, date DATE NOT NULL,
  count INT NOT NULL DEFAULT 0 CHECK (count >= 0), PRIMARY KEY (lesson_id, date));
ALTER TABLE quran_lesson_reps ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS quran_review_log (
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('solid', 'weak')), label TEXT, size NUMERIC(6,2),
  done_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (student_id, date, kind));
ALTER TABLE quran_review_log ENABLE ROW LEVEL SECURITY;
CREATE TABLE IF NOT EXISTS quran_meetings (
  id SERIAL PRIMARY KEY, student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, date DATE NOT NULL,
  attendance TEXT NOT NULL DEFAULT 'present' CHECK (attendance IN ('present', 'absent', 'excused')),
  review_eval TEXT, hifz_eval TEXT, ada_eval TEXT, tajweed_eval TEXT,
  lesson_id INT REFERENCES quran_lessons(id) ON DELETE SET NULL, note TEXT,
  created_by INT REFERENCES users(id) ON DELETE SET NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, date));
ALTER TABLE quran_meetings ENABLE ROW LEVEL SECURITY;`;

// ---------- التواريخ (نصوص YYYY-MM-DD بتوقيت UTC) ----------
const toDay = (d) => d.toISOString().slice(0, 10);
const parse = (s) => new Date(`${s}T00:00:00Z`);
export const addDays = (s, n) => toDay(new Date(parse(s).getTime() + n * 864e5));
const weekday = (s) => parse(s).getUTCDay();
const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
// بداية الأسبوع (يوم اللقاء مع الشيخ) التي تحتوي هذا اليوم
export const weekStartOf = (day, ws) => addDays(day, -((weekday(day) - ws + 7) % 7));
// مرجع ثابت لترقيم الأيام: 2024-01-07 يوم أحد
const ANCHOR = '2024-01-07';

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

// حصّة يوم معيّن من المراجعة: المحفوظ الجيد يُختم كل solid_days يومًا، والضعيف كل weak_days
export function dayPlan(st, day) {
  const idx = daysBetween(addDays(ANCHOR, st.week_start), day);
  const mod = (n) => ((idx % n) + n) % n;
  const part = (kind, days) => {
    const ids = idsOf(st.memorized, kind === 'solid' ? 's' : 'w');
    if (!ids.length) return null;
    const p = Q.splitPlan(ids, days)[mod(days)];
    return p.ids.length ? { label: p.label, size: p.size, day: mod(days) + 1, of: days } : null;
  };
  return { solid: part('solid', st.solid_days), weak: part('weak', st.weak_days) };
}

export function registerQuranRoutes({ route, pool, all, one, HttpError, text, date, hashPassword, password, today }) {
  let ready = null;
  const ensure = () =>
    (ready ??= (async () => {
      const c = await one(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'users_role_check'`);
      if (!c || !c.def.includes('talib')) {
        await pool.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
        await pool.query(`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'teacher', 'parent', 'sheikh', 'talib'))`);
      }
      await pool.query(SCHEMA);
    })().catch((e) => {
      ready = null;
      throw e;
    }));
  const STAFF = ['admin', 'sheikh'];
  const q = (method, path, roles, handler) =>
    route(method, path, roles, async (ctx) => {
      await ensure();
      return handler(ctx);
    });

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

  const STUDENT_SELECT = `SELECT qs.user_id AS id, qs.first_name, qs.last_name, qs.age, qs.level, qs.group_id, qs.sheikh_id,
      qs.week_start, qs.solid_days, qs.weak_days, qs.lesson_target, qs.memorized, qs.active,
      u.username, u.full_name, u.phone, u.last_seen, g.name AS group_name, sh.full_name AS sheikh_name
    FROM quran_students qs JOIN users u ON u.id = qs.user_id
    LEFT JOIN quran_groups g ON g.id = qs.group_id LEFT JOIN users sh ON sh.id = qs.sheikh_id`;

  // من يرى الطالب: الإدارة، شيخه (أو شيخ مجموعته)، والطالب نفسه
  async function loadStudent(user, id, { write = false } = {}) {
    const st = await one(`${STUDENT_SELECT} WHERE qs.user_id = $1`, [Number(id) || 0]);
    if (!st) throw new HttpError(404, 'الطالب غير موجود');
    if (user.role === 'admin') return st;
    if (user.role === 'sheikh') {
      const groupSheikh = st.group_id ? (await one('SELECT sheikh_id FROM quran_groups WHERE id = $1', [st.group_id]))?.sheikh_id : null;
      if (st.sheikh_id === user.id || groupSheikh === user.id) return st;
    }
    if (user.role === 'talib' && st.id === user.id && !write) return st;
    throw new HttpError(404, 'الطالب غير موجود');
  }
  async function loadGroup(user, id) {
    const g = await one('SELECT * FROM quran_groups WHERE id = $1', [Number(id) || 0]);
    if (!g || (user.role === 'sheikh' && g.sheikh_id !== user.id)) throw new HttpError(404, 'المجموعة غير موجودة');
    return g;
  }
  async function readSheikh(user, value) {
    if (user.role === 'sheikh') return user.id;
    if (!value) return null;
    const s = await one(`SELECT id FROM users WHERE id = $1 AND role IN ('sheikh', 'admin', 'teacher')`, [Number(value) || 0]);
    if (!s) throw new HttpError(400, 'الشيخ غير موجود');
    return s.id;
  }

  // ملخّص أسبوع الطالب: المراجعة المنجزة، والدرس الحالي وعدد قراءاته
  async function weekSummary(students, day = today()) {
    if (!students.length) return new Map();
    const ids = students.map((s) => s.id);
    const minStart = addDays(day, -6);
    const logs = await all(`SELECT student_id, date::text, kind FROM quran_review_log WHERE student_id = ANY($1::int[]) AND date >= $2 AND date <= $3`, [ids, minStart, day]);
    const lessons = await all(
      `SELECT DISTINCT ON (l.student_id) l.id, l.student_id, l.assigned_on::text, l.content, l.athman::float8 AS athman, l.target,
         COALESCE((SELECT SUM(count) FROM quran_lesson_reps r WHERE r.lesson_id = l.id), 0)::int AS total
       FROM quran_lessons l WHERE l.student_id = ANY($1::int[]) AND l.assigned_on <= $2 ORDER BY l.student_id, l.assigned_on DESC, l.id DESC`,
      [ids, day]
    );
    const meetings = await all(
      `SELECT DISTINCT ON (student_id) student_id, date::text, attendance, review_eval, hifz_eval, ada_eval FROM quran_meetings
       WHERE student_id = ANY($1::int[]) ORDER BY student_id, date DESC`,
      [ids]
    );
    const out = new Map();
    for (const st of students) {
      const start = weekStartOf(day, st.week_start);
      let expected = 0;
      let done = 0;
      for (let d = start; d <= day; d = addDays(d, 1)) {
        const p = dayPlan(st, d);
        for (const k of ['solid', 'weak']) {
          if (!p[k]) continue;
          expected++;
          if (logs.some((l) => l.student_id === st.id && l.date === d && l.kind === k)) done++;
        }
      }
      out.set(st.id, {
        week_from: start,
        review_done: done,
        review_expected: expected,
        solid_hizb: Q.sizeOf(idsOf(st.memorized, 's')),
        weak_hizb: Q.sizeOf(idsOf(st.memorized, 'w')),
        lesson: lessons.find((l) => l.student_id === st.id) || null,
        last_meeting: meetings.find((m) => m.student_id === st.id) || null,
      });
    }
    return out;
  }
  const publicStudent = ({ memorized, ...st }, summary) => ({ ...st, ...summary });

  // ---------- النظرة العامة (الإدارة والشيخ) ----------
  q('GET', '/api/quran/overview', STAFF, async ({ user }) => {
    const mine = user.role === 'sheikh';
    const groups = await all(
      `SELECT g.id, g.name, g.level, g.sheikh_id, g.meet_day, g.notes, u.full_name AS sheikh_name,
         (SELECT COUNT(*)::int FROM quran_students s WHERE s.group_id = g.id AND s.active) AS students
       FROM quran_groups g LEFT JOIN users u ON u.id = g.sheikh_id ${mine ? 'WHERE g.sheikh_id = $1' : ''} ORDER BY g.name`,
      mine ? [user.id] : []
    );
    const students = await all(
      `${STUDENT_SELECT} ${mine ? 'WHERE qs.sheikh_id = $1 OR g.sheikh_id = $1' : ''} ORDER BY qs.active DESC, u.full_name`,
      mine ? [user.id] : []
    );
    const sum = await weekSummary(students.filter((s) => s.active));
    const sheikhs = mine
      ? []
      : await all(`SELECT id, username, full_name, phone, role, last_seen FROM users WHERE role = 'sheikh' ORDER BY full_name`);
    return { groups, students: students.map((s) => publicStudent(s, sum.get(s.id))), sheikhs, today: today() };
  });

  // ---------- المشايخ (الإدارة) ----------
  q('POST', '/api/quran/sheikhs', ['admin'], async ({ body }) => {
    const username = text(body.username, { required: true, max: 50, name: 'اسم المستخدم' });
    if (await one('SELECT 1 FROM users WHERE lower(username) = lower($1)', [username])) throw new HttpError(409, 'اسم المستخدم مستعمل');
    const row = await one(
      `INSERT INTO users (username, password_hash, full_name, role, phone) VALUES ($1, $2, $3, 'sheikh', $4) RETURNING id, username, full_name, phone, role`,
      [username, hashPassword(password(body.password)), text(body.full_name, { required: true, max: 120, name: 'الاسم' }), text(body.phone, { max: 30, name: 'الهاتف' })]
    );
    return [201, { sheikh: row }];
  });
  q('PUT', '/api/quran/sheikhs/:id', ['admin'], async ({ params, body }) => {
    const s = await one(`SELECT id FROM users WHERE id = $1 AND role = 'sheikh'`, [params.id]);
    if (!s) throw new HttpError(404, 'الشيخ غير موجود');
    await pool.query('UPDATE users SET full_name = $1, phone = $2 WHERE id = $3', [
      text(body.full_name, { required: true, max: 120, name: 'الاسم' }), text(body.phone, { max: 30, name: 'الهاتف' }), s.id,
    ]);
    if (body.password) await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(password(body.password)), s.id]);
    return { ok: true };
  });
  q('DELETE', '/api/quran/sheikhs/:id', ['admin'], async ({ params }) => {
    const { rowCount } = await pool.query(`DELETE FROM users WHERE id = $1 AND role = 'sheikh'`, [params.id]);
    if (!rowCount) throw new HttpError(404, 'الشيخ غير موجود');
    return { ok: true };
  });

  // ---------- المجموعات ----------
  async function readGroup(user, body) {
    return [
      text(body.name, { required: true, max: 80, name: 'اسم المجموعة' }),
      text(body.level, { max: 60, name: 'المستوى' }),
      await readSheikh(user, body.sheikh_id),
      int(body.meet_day, { min: 0, max: 6, def: 6, name: 'يوم اللقاء' }),
      text(body.notes, { max: 500, name: 'ملاحظات' }),
    ];
  }
  q('POST', '/api/quran/groups', STAFF, async ({ user, body }) => {
    const group = await one(
      'INSERT INTO quran_groups (name, level, sheikh_id, meet_day, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      await readGroup(user, body)
    );
    return [201, { group }];
  });
  q('PUT', '/api/quran/groups/:id', STAFF, async ({ user, params, body }) => {
    const g = await loadGroup(user, params.id);
    const values = await readGroup(user, body);
    const group = await one('UPDATE quran_groups SET name = $1, level = $2, sheikh_id = $3, meet_day = $4, notes = $5 WHERE id = $6 RETURNING *', [...values, g.id]);
    // طلبة المجموعة يتبعون شيخها
    await pool.query('UPDATE quran_students SET sheikh_id = $1 WHERE group_id = $2', [group.sheikh_id, g.id]);
    return { group };
  });
  q('DELETE', '/api/quran/groups/:id', STAFF, async ({ user, params }) => {
    const g = await loadGroup(user, params.id);
    await pool.query('DELETE FROM quran_groups WHERE id = $1', [g.id]);
    return { ok: true };
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
    let sheikhId = existing?.sheikh_id ?? (user.role === 'sheikh' ? user.id : null);
    let weekStart = body.week_start;
    if (body.group_id) {
      const g = await loadGroup(user, body.group_id);
      groupId = g.id;
      if (g.sheikh_id) sheikhId = g.sheikh_id;
      if (weekStart === undefined || weekStart === '') weekStart = g.meet_day;
    }
    if (user.role === 'admin' && body.sheikh_id !== undefined && !groupId) sheikhId = await readSheikh(user, body.sheikh_id);
    return {
      first, last,
      full: [first, last].filter(Boolean).join(' '),
      age: int(body.age, { min: 3, max: 99, def: null, name: 'العمر' }),
      level: text(body.level, { max: 60, name: 'المستوى' }),
      groupId, sheikhId,
      weekStart: int(weekStart, { min: 0, max: 6, def: existing?.week_start ?? 6, name: 'بداية الأسبوع' }),
      solid: int(body.solid_days, { min: 1, max: 60, def: existing?.solid_days ?? 7, name: 'نسق المحفوظ الجيد' }),
      weak: int(body.weak_days, { min: 1, max: 60, def: existing?.weak_days ?? 7, name: 'نسق المحفوظ الذي يحتاج مراجعة' }),
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
      `INSERT INTO quran_students (user_id, first_name, last_name, age, level, group_id, sheikh_id, week_start, solid_days, weak_days, lesson_target, memorized)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [id, s.first, s.last, s.age, s.level, s.groupId, s.sheikhId, s.weekStart, s.solid, s.weak, s.target, JSON.stringify(cleanMemorized(body.memorized))]
    );
    return [201, { student: publicStudent(await loadStudent(user, id)) }];
  });
  q('PUT', '/api/quran/students/:id', STAFF, async ({ user, params, body }) => {
    const st = await loadStudent(user, params.id, { write: true });
    const s = await readStudent(user, body, st);
    await pool.query(
      `UPDATE quran_students SET first_name = $1, last_name = $2, age = $3, level = $4, group_id = $5, sheikh_id = $6,
         week_start = $7, solid_days = $8, weak_days = $9, lesson_target = $10, active = $11 WHERE user_id = $12`,
      [s.first, s.last, s.age, s.level, s.groupId, s.sheikhId, s.weekStart, s.solid, s.weak, s.target, s.active, st.id]
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
  q('GET', '/api/quran/students/:id', ['admin', 'sheikh', 'talib'], async ({ user, params, query }) => {
    const st = await loadStudent(user, params.id);
    const day = today();
    const ref = DATE_RE.test(query.get('week') || '') ? query.get('week') : day;
    const start = weekStartOf(ref, st.week_start);
    const end = addDays(start, 6);
    const logs = await all(`SELECT date::text, kind, label FROM quran_review_log WHERE student_id = $1 AND date BETWEEN $2 AND $3`, [st.id, start, end]);
    const lessons = await all(
      `SELECT l.id, l.assigned_on::text, l.content, l.athman::float8 AS athman, l.target, u.full_name AS by_name,
         COALESCE((SELECT SUM(count) FROM quran_lesson_reps r WHERE r.lesson_id = l.id), 0)::int AS total
       FROM quran_lessons l LEFT JOIN users u ON u.id = l.created_by WHERE l.student_id = $1 ORDER BY l.assigned_on DESC, l.id DESC LIMIT 30`,
      [st.id]
    );
    const lesson = lessons.find((l) => l.assigned_on <= day) || null;
    if (lesson) lesson.reps = await all('SELECT date::text, count FROM quran_lesson_reps WHERE lesson_id = $1 ORDER BY date', [lesson.id]);
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
    const week = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const p = dayPlan(st, d);
      week.push({
        date: d,
        solid: p.solid && { ...p.solid, done: logs.some((l) => l.date === d && l.kind === 'solid') },
        weak: p.weak && { ...p.weak, done: logs.some((l) => l.date === d && l.kind === 'weak') },
        reps: repsWeek.find((r) => r.date === d)?.count || 0,
      });
    }
    const summary = (await weekSummary([st], day)).get(st.id);
    return { student: { ...st, ...summary }, week, week_start: start, today: day, lesson, lessons, meetings };
  });

  // المحفوظ: الطالب يحدّده بنفسه، والشيخ يعدّله
  q('PUT', '/api/quran/students/:id/memorized', ['admin', 'sheikh', 'talib'], async ({ user, params, body }) => {
    const st = await loadStudent(user, params.id);
    const mem = cleanMemorized(body.memorized);
    await pool.query('UPDATE quran_students SET memorized = $1 WHERE user_id = $2', [JSON.stringify(mem), st.id]);
    return { memorized: mem, solid_hizb: Q.sizeOf(idsOf(mem, 's')), weak_hizb: Q.sizeOf(idsOf(mem, 'w')) };
  });

  // إنجاز حصة المراجعة لليوم (أو إلغاؤه)
  q('POST', '/api/quran/students/:id/review', ['admin', 'sheikh', 'talib'], async ({ user, params, body }) => {
    const st = await loadStudent(user, params.id);
    const day = body.date ? date(body.date) : today();
    if (day > today()) throw new HttpError(400, 'لا يمكن تسجيل مراجعة يوم لم يأت بعد');
    if (!['solid', 'weak'].includes(body.kind)) throw new HttpError(400, 'نوع المراجعة غير صالح');
    if (body.done === false) {
      await pool.query('DELETE FROM quran_review_log WHERE student_id = $1 AND date = $2 AND kind = $3', [st.id, day, body.kind]);
      return { done: false };
    }
    const p = dayPlan(st, day)[body.kind];
    if (!p) throw new HttpError(400, 'لا توجد حصة مراجعة من هذا النوع في هذا اليوم');
    await pool.query(
      `INSERT INTO quran_review_log (student_id, date, kind, label, size) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id, date, kind) DO UPDATE SET label = EXCLUDED.label, size = EXCLUDED.size, done_at = now()`,
      [st.id, day, body.kind, p.label, p.size]
    );
    return { done: true };
  });

  // ---------- الدرس الجديد وعدّاد القراءات ----------
  q('POST', '/api/quran/students/:id/lessons', STAFF, async ({ user, params, body }) => {
    const st = await loadStudent(user, params.id, { write: true });
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
    const l = await one('SELECT id, student_id, assigned_on::text, target FROM quran_lessons WHERE id = $1', [Number(id) || 0]);
    if (!l) throw new HttpError(404, 'الدرس غير موجود');
    await loadStudent(user, l.student_id, opts);
    return l;
  }
  q('DELETE', '/api/quran/lessons/:id', STAFF, async ({ user, params }) => {
    const l = await loadLesson(user, params.id, { write: true });
    await pool.query('DELETE FROM quran_lessons WHERE id = $1', [l.id]);
    return { ok: true };
  });
  // add: زيادة (عدّاد +1 أو +n)، count: كتابة العدد مباشرة لذلك اليوم
  q('PUT', '/api/quran/lessons/:id/reps', ['admin', 'sheikh', 'talib'], async ({ user, params, body }) => {
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
    const { count } = (await one('SELECT count FROM quran_lesson_reps WHERE lesson_id = $1 AND date = $2', [l.id, day])) || { count: 0 };
    return { total, day_count: count, target: l.target, reached: total >= l.target };
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
