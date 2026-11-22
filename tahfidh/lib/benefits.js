// ركن الفوائد: فوائد الشيخ (لمجموعة أو لكل الطلبة) وملاحظات الطالب الخاصة به
export function registerBenefitRoutes({ route, pool, all, one, HttpError, text, notify }) {
  const body = (b) => text(b.body, { required: !(b.images?.length || b.keep_images?.length || b.youtube?.length), max: 8000, name: 'النص' }) || '';
  // روابط يوتيوب: نحتفظ برقم الفيديو فقط (11 حرفًا)
  function youtube(list) {
    const out = [];
    for (const raw of (Array.isArray(list) ? list : String(list || '').split(/\s+/)).slice(0, 5)) {
      const u = String(raw || '').trim();
      if (!u) continue;
      const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/.exec(u) || /^([\w-]{11})$/.exec(u);
      if (!m) throw new HttpError(400, `رابط يوتيوب غير صالح: ${u.slice(0, 60)}`);
      out.push(m[1]);
    }
    return [...new Set(out)];
  }
  // الصور: data:image/... (تُصغَّر في الهاتف قبل الإرسال)، 6 صور على الأكثر
  function images(list) {
    return (Array.isArray(list) ? list : []).slice(0, 6).map((d) => {
      const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(d || ''));
      if (!m) throw new HttpError(400, 'صورة غير صالحة');
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 900 * 1024) throw new HttpError(400, 'صورة كبيرة جدًا');
      return { buf, type: m[1] };
    });
  }
  async function saveImages(id, b, keep = null) {
    if (keep) await pool.query('DELETE FROM quran_benefit_images WHERE benefit_id = $1 AND NOT (id = ANY($2::int[]))', [id, keep]);
    const { n } = await one('SELECT COUNT(*)::int AS n FROM quran_benefit_images WHERE benefit_id = $1', [id]);
    const imgs = images(b.images);
    if (n + imgs.length > 6) throw new HttpError(400, '6 صور على الأكثر في الفائدة الواحدة');
    for (const [k, im] of imgs.entries()) {
      await pool.query('INSERT INTO quran_benefit_images (benefit_id, data, type, position) VALUES ($1, $2, $3, $4)', [id, im.buf, im.type, n + k]);
    }
  }
  const title = (b) => text(b.title, { max: 150, name: 'العنوان' });
  async function groupOf(value) {
    if (!value) return null;
    const g = await one('SELECT id FROM quran_groups WHERE id = $1', [Number(value) || 0]);
    if (!g) throw new HttpError(400, 'المجموعة غير موجودة');
    return g.id;
  }
  const SELECT = `SELECT b.id, b.group_id, g.name AS group_name, b.title, b.body, b.youtube, b.created_at, b.updated_at, u.full_name AS by_name,
      COALESCE((SELECT json_agg(i.id ORDER BY i.position, i.id) FROM quran_benefit_images i WHERE i.benefit_id = b.id), '[]') AS images
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
    const yt = youtube(b.youtube);
    const row = await one('INSERT INTO quran_benefits (group_id, title, body, youtube, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id', [
      await groupOf(b.group_id), title(b), body({ ...b, youtube: yt }), JSON.stringify(yt), user.id,
    ]);
    try {
      await saveImages(row.id, b);
    } catch (e) {
      await pool.query('DELETE FROM quran_benefits WHERE id = $1', [row.id]);
      throw e;
    }
    const gid = await groupOf(b.group_id);
    await notify(
      gid
        ? { sql: 'SELECT s.user_id AS id FROM quran_students s WHERE s.active AND s.group_id = $1', params: [gid] }
        : { sql: 'SELECT s.user_id AS id FROM quran_students s WHERE s.active' },
      { kind: 'benefit', title: `💡 فائدة جديدة${b.title ? `: ${String(b.title).trim().slice(0, 100)}` : ''}`, body: b.body || null, link: '#/benefits' }
    );
    return [201, { id: row.id }];
  });
  route('PUT', '/api/quran/benefits/:id', ['admin'], async ({ params, body: b }) => {
    const yt = youtube(b.youtube);
    const keep = (Array.isArray(b.keep_images) ? b.keep_images : []).map(Number).filter(Number.isInteger);
    const { rowCount } = await pool.query('UPDATE quran_benefits SET group_id = $1, title = $2, body = $3, youtube = $4, updated_at = now() WHERE id = $5', [
      await groupOf(b.group_id), title(b), body({ ...b, youtube: yt, keep_images: keep }), JSON.stringify(yt), params.id,
    ]);
    if (!rowCount) throw new HttpError(404, 'الفائدة غير موجودة');
    await saveImages(params.id, b, keep);
    return { ok: true };
  });
  route('DELETE', '/api/quran/benefits/:id', ['admin'], async ({ params }) => {
    await pool.query('DELETE FROM quran_benefits WHERE id = $1', [params.id]);
    return { ok: true };
  });

  // صورة فائدة: لكل من دخل (الطالب يرى فوائد مجموعته)
  route('GET', '/api/quran/benefit-images/:id', ['admin', 'talib'], async ({ user, params }) => {
    const im = await one(
      `SELECT i.data, i.type, b.group_id FROM quran_benefit_images i JOIN quran_benefits b ON b.id = i.benefit_id WHERE i.id = $1`,
      [params.id]
    );
    if (!im) throw new HttpError(404, 'الصورة غير موجودة');
    if (user.role === 'talib' && im.group_id) {
      const s = await one('SELECT group_id FROM quran_students WHERE user_id = $1', [user.id]);
      if (s?.group_id !== im.group_id) throw new HttpError(404, 'الصورة غير موجودة');
    }
    return new Response(im.data, { status: 200, headers: { 'Content-Type': im.type, 'Cache-Control': 'private, max-age=31536000' } });
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
