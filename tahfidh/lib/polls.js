// سبر الآراء والتقييمات: أسئلة من 4 أنواع — single (اختيار واحد)، multi (اختيارات)، rating (نجوم 1–5)، text (جواب مكتوب)
const TYPES = ['single', 'multi', 'rating', 'text'];

export function registerPollRoutes({ route, pool, all, one, HttpError, text }) {
  function readQuestions(list) {
    if (!Array.isArray(list) || !list.length) throw new HttpError(400, 'أضف سؤالًا واحدًا على الأقل');
    if (list.length > 30) throw new HttpError(400, '30 سؤالًا على الأكثر');
    return list.map((q, i) => {
      const t = TYPES.includes(q?.type) ? q.type : 'single';
      const out = { q: text(q?.q, { required: true, max: 300, name: `نص السؤال ${i + 1}` }), type: t };
      if (t === 'single' || t === 'multi') {
        const opts = (Array.isArray(q.options) ? q.options : []).map((o) => String(o ?? '').trim()).filter(Boolean).slice(0, 10);
        if (opts.length < 2) throw new HttpError(400, `السؤال ${i + 1}: اكتب اختيارين على الأقل`);
        out.options = opts.map((o) => o.slice(0, 150));
      }
      return out;
    });
  }
  async function groupOf(value) {
    if (!value) return null;
    const g = await one('SELECT id FROM quran_groups WHERE id = $1', [Number(value) || 0]);
    if (!g) throw new HttpError(400, 'المجموعة غير موجودة');
    return g.id;
  }
  const values = async (b) => [
    await groupOf(b.group_id),
    text(b.title, { required: true, max: 150, name: 'العنوان' }),
    text(b.description, { max: 1000, name: 'الوصف' }),
    JSON.stringify(readQuestions(b.questions)),
    !!b.anonymous,
  ];
  const SELECT = `SELECT p.id, p.group_id, g.name AS group_name, p.title, p.description, p.questions, p.anonymous, p.closed, p.created_at,
      (SELECT COUNT(*)::int FROM quran_poll_answers a WHERE a.poll_id = p.id) AS answers,
      (SELECT COUNT(*)::int FROM quran_students s WHERE s.active AND (p.group_id IS NULL OR s.group_id = p.group_id)) AS audience
    FROM quran_polls p LEFT JOIN quran_groups g ON g.id = p.group_id`;
  // الطالب يرى استبيانات مجموعته واستبيانات كل الطلبة
  async function visiblePoll(user, id) {
    const p = await one(`${SELECT} WHERE p.id = $1`, [Number(id) || 0]);
    if (!p) throw new HttpError(404, 'الاستبيان غير موجود');
    if (user.role === 'talib') {
      const s = await one('SELECT group_id FROM quran_students WHERE user_id = $1', [user.id]);
      if (p.group_id && p.group_id !== s?.group_id) throw new HttpError(404, 'الاستبيان غير موجود');
    }
    return p;
  }

  route('GET', '/api/quran/polls', ['admin', 'talib'], async ({ user }) => {
    if (user.role === 'admin') return { polls: await all(`${SELECT} ORDER BY p.closed, p.created_at DESC`) };
    const s = await one('SELECT group_id FROM quran_students WHERE user_id = $1', [user.id]);
    const polls = await all(`${SELECT} WHERE p.group_id IS NULL OR p.group_id = $1 ORDER BY p.closed, p.created_at DESC`, [s?.group_id ?? 0]);
    const mine = await all('SELECT poll_id, answers FROM quran_poll_answers WHERE student_id = $1', [user.id]);
    return { polls: polls.map((p) => ({ ...p, my_answers: mine.find((m) => m.poll_id === p.id)?.answers ?? null })) };
  });
  route('POST', '/api/quran/polls', ['admin'], async ({ user, body }) => {
    const row = await one(
      'INSERT INTO quran_polls (group_id, title, description, questions, anonymous, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [...(await values(body)), user.id]
    );
    return [201, { id: row.id }];
  });
  route('PUT', '/api/quran/polls/:id', ['admin'], async ({ params, body }) => {
    const { rowCount } = await pool.query(
      'UPDATE quran_polls SET group_id = $1, title = $2, description = $3, questions = $4, anonymous = $5, updated_at = now() WHERE id = $6',
      [...(await values(body)), params.id]
    );
    if (!rowCount) throw new HttpError(404, 'الاستبيان غير موجود');
    return { ok: true };
  });
  route('PUT', '/api/quran/polls/:id/closed', ['admin'], async ({ params, body }) => {
    await pool.query('UPDATE quran_polls SET closed = $1 WHERE id = $2', [!!body.closed, params.id]);
    return { ok: true };
  });
  route('DELETE', '/api/quran/polls/:id', ['admin'], async ({ params }) => {
    await pool.query('DELETE FROM quran_polls WHERE id = $1', [params.id]);
    return { ok: true };
  });

  // جواب الطالب (يمكنه تعديله ما دام الاستبيان مفتوحًا)
  route('PUT', '/api/quran/polls/:id/answer', ['talib'], async ({ user, params, body }) => {
    const p = await visiblePoll(user, params.id);
    if (p.closed) throw new HttpError(400, 'هذا الاستبيان مغلق');
    const given = Array.isArray(body.answers) ? body.answers : [];
    const answers = p.questions.map((q, i) => {
      const a = given[i];
      if (a === undefined || a === null || a === '') return null;
      if (q.type === 'single') return Number.isInteger(a) && a >= 0 && a < q.options.length ? a : null;
      if (q.type === 'multi') return Array.isArray(a) ? [...new Set(a.filter((x) => Number.isInteger(x) && x >= 0 && x < q.options.length))] : null;
      if (q.type === 'rating') return Number.isInteger(a) && a >= 1 && a <= 5 ? a : null;
      return String(a).trim().slice(0, 1000) || null;
    });
    if (answers.every((a) => a === null || (Array.isArray(a) && !a.length))) throw new HttpError(400, 'أجب عن سؤال واحد على الأقل');
    await pool.query(
      `INSERT INTO quran_poll_answers (poll_id, student_id, answers) VALUES ($1, $2, $3)
       ON CONFLICT (poll_id, student_id) DO UPDATE SET answers = EXCLUDED.answers, updated_at = now()`,
      [p.id, user.id, JSON.stringify(answers)]
    );
    return { ok: true };
  });

  // النتائج (المشرف)
  route('GET', '/api/quran/polls/:id/results', ['admin'], async ({ params }) => {
    const p = await one(`${SELECT} WHERE p.id = $1`, [params.id]);
    if (!p) throw new HttpError(404, 'الاستبيان غير موجود');
    const rows = await all(
      `SELECT a.answers, a.updated_at, u.full_name FROM quran_poll_answers a JOIN users u ON u.id = a.student_id WHERE a.poll_id = $1 ORDER BY a.updated_at DESC`,
      [p.id]
    );
    const results = p.questions.map((q, i) => {
      const got = rows.map((r) => ({ a: r.answers[i], who: r.full_name })).filter((x) => x.a !== null && x.a !== undefined && !(Array.isArray(x.a) && !x.a.length));
      const base = { q: q.q, type: q.type, answered: got.length };
      if (q.type === 'single' || q.type === 'multi') {
        return { ...base, options: q.options.map((o, k) => ({ label: o, count: got.filter((x) => (q.type === 'single' ? x.a === k : x.a.includes(k))).length })) };
      }
      if (q.type === 'rating') {
        const avg = got.length ? Math.round((got.reduce((t, x) => t + x.a, 0) / got.length) * 10) / 10 : null;
        return { ...base, average: avg, stars: [1, 2, 3, 4, 5].map((n) => got.filter((x) => x.a === n).length) };
      }
      return { ...base, texts: got.map((x) => ({ text: x.a, who: p.anonymous ? null : x.who })) };
    });
    return { poll: p, results, respondents: p.anonymous ? null : rows.map((r) => r.full_name) };
  });
}
