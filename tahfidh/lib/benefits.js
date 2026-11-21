// ركن الفوائد: فوائد الشيخ (لمجموعة أو لكل الطلبة) وملاحظات الطالب الخاصة به
export function registerBenefitRoutes({ route, pool, all, one, HttpError, text }) {
  const body = (b) => text(b.body, { required: true, max: 5000, name: 'النص' });
  const title = (b) => text(b.title, { max: 150, name: 'العنوان' });
  async function groupOf(value) {
    if (!value) return null;
    const g = await one('SELECT id FROM quran_groups WHERE id = $1', [Number(value) || 0]);
    if (!g) throw new HttpError(400, 'المجموعة غير موجودة');
    return g.id;
  }
  const SELECT = `SELECT b.id, b.group_id, g.name AS group_name, b.title, b.body, b.created_at, b.updated_at, u.full_name AS by_name
    FROM quran_benefits b LEFT JOIN quran_groups g ON g.id = b.group_id LEFT JOIN users u ON u.id = b.created_by`;

  // المشرف يرى كل الفوائد، والطالب يرى فوائد مجموعته وفوائد كل الطلبة
  route('GET', '/api/quran/benefits', ['admin', 'talib'], async ({ user }) => {
    if (user.role === 'admin') return { benefits: await all(`${SELECT} ORDER BY b.created_at DESC LIMIT 300`) };
    const g = await one('SELECT group_id FROM quran_students WHERE user_id = $1', [user.id]);
    return {
      benefits: await all(`${SELECT} WHERE b.group_id IS NULL OR b.group_id = $1 ORDER BY b.created_at DESC LIMIT 300`, [g?.group_id ?? 0]),
    };
  });
  route('POST', '/api/quran/benefits', ['admin'], async ({ user, body: b }) => {
    const row = await one('INSERT INTO quran_benefits (group_id, title, body, created_by) VALUES ($1, $2, $3, $4) RETURNING id', [
      await groupOf(b.group_id), title(b), body(b), user.id,
    ]);
    return [201, { id: row.id }];
  });
  route('PUT', '/api/quran/benefits/:id', ['admin'], async ({ params, body: b }) => {
    const { rowCount } = await pool.query('UPDATE quran_benefits SET group_id = $1, title = $2, body = $3, updated_at = now() WHERE id = $4', [
      await groupOf(b.group_id), title(b), body(b), params.id,
    ]);
    if (!rowCount) throw new HttpError(404, 'الفائدة غير موجودة');
    return { ok: true };
  });
  route('DELETE', '/api/quran/benefits/:id', ['admin'], async ({ params }) => {
    await pool.query('DELETE FROM quran_benefits WHERE id = $1', [params.id]);
    return { ok: true };
  });

  // ملاحظاتي: خاصة بالطالب وحده
  route('GET', '/api/quran/my-notes', ['talib'], async ({ user }) => ({
    notes: await all('SELECT id, body, created_at, updated_at FROM quran_student_notes WHERE student_id = $1 ORDER BY created_at DESC LIMIT 500', [user.id]),
  }));
  route('POST', '/api/quran/my-notes', ['talib'], async ({ user, body: b }) => {
    const row = await one('INSERT INTO quran_student_notes (student_id, body) VALUES ($1, $2) RETURNING id', [user.id, body(b)]);
    return [201, { id: row.id }];
  });
  route('PUT', '/api/quran/my-notes/:id', ['talib'], async ({ user, params, body: b }) => {
    const { rowCount } = await pool.query('UPDATE quran_student_notes SET body = $1, updated_at = now() WHERE id = $2 AND student_id = $3', [body(b), params.id, user.id]);
    if (!rowCount) throw new HttpError(404, 'الملاحظة غير موجودة');
    return { ok: true };
  });
  route('DELETE', '/api/quran/my-notes/:id', ['talib'], async ({ user, params }) => {
    await pool.query('DELETE FROM quran_student_notes WHERE id = $1 AND student_id = $2', [params.id, user.id]);
    return { ok: true };
  });
}
