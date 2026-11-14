// الدخول بحساب Google وتسجيل الطلبة الجدد
// الحساب المربوط يدخل مباشرة. الطالب الجديد يملأ استمارة قصيرة، والمشرف يقبل الطلب (أو يرفضه).
import crypto from 'node:crypto';

export async function verifyGoogleToken(credential, clientId, HttpError) {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
  if (!res.ok) throw new HttpError(401, 'تعذّر التحقق من حساب Google');
  const info = await res.json();
  if (info.aud !== clientId || !['accounts.google.com', 'https://accounts.google.com'].includes(info.iss)) {
    throw new HttpError(401, 'حساب Google غير صالح لهذا التطبيق');
  }
  if (String(info.email_verified) !== 'true') throw new HttpError(401, 'البريد الإلكتروني غير مؤكَّد في Google');
  return { sub: info.sub, email: info.email, name: info.name || info.email };
}

export function registerGoogleRoutes({ route, pool, all, one, HttpError, text, hashPassword, today, startSession, googleClientId, verifyGoogle, ANY }) {
  const enabled = () => {
    if (!googleClientId) throw new HttpError(400, 'الدخول بـ Google غير مفعّل بعد');
  };
  const int = (v, min, max, name) => {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${name} غير صالح`);
    return n;
  };

  route('GET', '/api/auth/config', null, async () => ({ google_client_id: googleClientId || null }));

  // الدخول: حساب مربوط ← يدخل. بريد مشرف غير مربوط بعد ← يُربط ويدخل. غير ذلك ← حالة طلب التسجيل
  route('POST', '/api/auth/google', null, async ({ body, setSession }) => {
    enabled();
    const g = await verifyGoogle(String(body.credential || ''));
    const known = await one('SELECT id, disabled FROM users WHERE google_sub = $1', [g.sub]);
    if (known) {
      if (known.disabled) throw new HttpError(403, 'حسابك موقوف حاليًا');
      await pool.query('UPDATE users SET google_email = $1 WHERE id = $2', [g.email, known.id]);
      return { user: await startSession(known.id, setSession) };
    }
    const admin = await one(`SELECT id FROM users WHERE role = 'admin' AND google_sub IS NULL AND lower(email) = lower($1) ORDER BY id LIMIT 1`, [g.email]);
    if (admin) {
      await pool.query('UPDATE users SET google_sub = $1, google_email = $2 WHERE id = $3', [g.sub, g.email, admin.id]);
      return { user: await startSession(admin.id, setSession) };
    }
    const req = await one('SELECT status FROM quran_signups WHERE google_sub = $1', [g.sub]);
    const groups = await all('SELECT id, name, meet_day FROM quran_groups ORDER BY name');
    return { status: req?.status || 'new', google: { email: g.email, name: g.name }, groups };
  });

  // طلب تسجيل طالب جديد
  route('POST', '/api/auth/google/signup', null, async ({ body }) => {
    enabled();
    const g = await verifyGoogle(String(body.credential || ''));
    if (await one('SELECT 1 FROM users WHERE google_sub = $1', [g.sub])) throw new HttpError(409, 'هذا الحساب مسجّل مسبقًا: ادخل بـ Google مباشرة');
    const prev = await one('SELECT status FROM quran_signups WHERE google_sub = $1', [g.sub]);
    if (prev?.status === 'pending') return { status: 'pending' };
    let groupId = null;
    if (body.group_id) groupId = (await one('SELECT id FROM quran_groups WHERE id = $1', [Number(body.group_id) || 0]))?.id ?? null;
    const values = [
      g.sub, g.email, g.name,
      text(body.first_name, { required: true, max: 60, name: 'الاسم' }),
      text(body.last_name, { max: 60, name: 'اللقب' }),
      int(body.age, 3, 99, 'العمر'),
      text(body.phone, { max: 30, name: 'الهاتف' }),
      groupId,
      text(body.note, { max: 300, name: 'الملاحظة' }),
    ];
    await pool.query(
      `INSERT INTO quran_signups (google_sub, google_email, google_name, first_name, last_name, age, phone, group_id, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (google_sub) DO UPDATE SET google_email = $2, google_name = $3, first_name = $4, last_name = $5, age = $6,
         phone = $7, group_id = $8, note = $9, status = 'pending', handled_by = NULL, created_at = now()`,
      values
    );
    return [201, { status: 'pending' }];
  });

  // ---------- المشرف: طلبات التسجيل ----------
  route('GET', '/api/signups', ['admin'], async () => ({
    signups: await all(
      `SELECT s.id, s.google_email, s.google_name, s.first_name, s.last_name, s.age, s.phone, s.group_id, s.note, s.status,
         s.created_at, s.user_id, g.name AS group_name
       FROM quran_signups s LEFT JOIN quran_groups g ON g.id = s.group_id
       ORDER BY (s.status = 'pending') DESC, s.created_at DESC LIMIT 200`
    ),
  }));
  route('GET', '/api/signups/count', ['admin'], async () => ({
    pending: (await one(`SELECT COUNT(*)::int AS n FROM quran_signups WHERE status = 'pending'`)).n,
  }));

  // القبول: يُنشأ حساب الطالب مربوطًا بحساب Google (والمشرف يمكنه تعديل الاسم والمجموعة)
  route('POST', '/api/signups/:id/accept', ['admin'], async ({ user, params, body }) => {
    const r = await one(`SELECT * FROM quran_signups WHERE id = $1`, [params.id]);
    if (!r) throw new HttpError(404, 'الطلب غير موجود');
    if (r.status === 'accepted') throw new HttpError(409, 'الطلب مقبول مسبقًا');
    if (await one('SELECT 1 FROM users WHERE google_sub = $1', [r.google_sub])) throw new HttpError(409, 'حساب Google هذا مربوط بحساب آخر');
    const first = text(body.first_name ?? r.first_name, { required: true, max: 60, name: 'الاسم' });
    const last = text(body.last_name ?? r.last_name ?? '', { max: 60, name: 'اللقب' });
    let group = null;
    const gid = body.group_id !== undefined ? body.group_id : r.group_id;
    if (gid) group = await one('SELECT id, meet_day FROM quran_groups WHERE id = $1', [Number(gid) || 0]);
    const weekStart = int(body.week_start, 0, 6, 'بداية الأسبوع') ?? group?.meet_day ?? 6;
    // اسم مستخدم من البريد (فريد)، وكلمة سر عشوائية: الدخول يكون بـ Google
    const base = r.google_email.split('@')[0].toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 30) || 'talib';
    let username = base;
    for (let i = 2; await one('SELECT 1 FROM users WHERE lower(username) = $1', [username]); i++) username = `${base}${i}`;
    const { id } = await one(
      `INSERT INTO users (username, email, password_hash, full_name, role, phone, google_sub, google_email)
       VALUES ($1, $2, $3, $4, 'talib', $5, $6, $2) RETURNING id`,
      [username, r.google_email, hashPassword(crypto.randomBytes(18).toString('hex')), [first, last].filter(Boolean).join(' '), r.phone, r.google_sub]
    );
    await pool.query(
      `INSERT INTO quran_students (user_id, first_name, last_name, age, group_id, week_start) VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, first, last, r.age, group?.id ?? null, weekStart]
    );
    await pool.query(`UPDATE quran_signups SET status = 'accepted', user_id = $1, handled_by = $2 WHERE id = $3`, [id, user.id, r.id]);
    return { student_id: id, username };
  });
  route('POST', '/api/signups/:id/reject', ['admin'], async ({ user, params }) => {
    const { rowCount } = await pool.query(`UPDATE quran_signups SET status = 'rejected', handled_by = $1 WHERE id = $2 AND status = 'pending'`, [user.id, params.id]);
    if (!rowCount) throw new HttpError(404, 'الطلب غير موجود');
    return { ok: true };
  });
  route('DELETE', '/api/signups/:id', ['admin'], async ({ params }) => {
    await pool.query(`DELETE FROM quran_signups WHERE id = $1 AND status <> 'accepted'`, [params.id]);
    return { ok: true };
  });

  // ربط حساب Google بحساب موجود (من «حسابي»)
  route('POST', '/api/me/google', ANY, async ({ user, body }) => {
    enabled();
    const g = await verifyGoogle(String(body.credential || ''));
    if (await one('SELECT 1 FROM users WHERE google_sub = $1 AND id <> $2', [g.sub, user.id])) throw new HttpError(409, 'حساب Google هذا مربوط بحساب آخر');
    await pool.query('UPDATE users SET google_sub = $1, google_email = $2 WHERE id = $3', [g.sub, g.email, user.id]);
    return { google_email: g.email };
  });
  route('DELETE', '/api/me/google', ANY, async ({ user }) => {
    await pool.query('UPDATE users SET google_sub = NULL, google_email = NULL WHERE id = $1', [user.id]);
    return { ok: true };
  });
}
