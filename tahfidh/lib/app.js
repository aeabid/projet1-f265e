// تطبيقة التحفيظ — واجهة REST: الحسابات والدخول، ثم مسارات المتابعة (quran.js)
// createHandler(pool) يرجع دالة: (Request) => Promise<Response>
import crypto from 'node:crypto';
import { registerQuranRoutes } from './quran.js';
import { registerGoogleRoutes, verifyGoogleToken } from './google.js';

const SESSION_COOKIE = 'tsid';
const SESSION_TTL_S = 60 * 24 * 60 * 60;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && crypto.timingSafeEqual(candidate, expected);
}
// علامات الاتجاه الخفية والفراغات (تأتي مع النسخ واللصق)
const clean = (v) => String(v ?? '').replace(/[‎‏‪-‮⁦-⁩﻿ ]/g, '').trim();

function text(value, { required = false, max = 2000, name = 'الحقل' } = {}) {
  const v = typeof value === 'string' ? value.trim() : '';
  if (required && !v) throw new HttpError(400, `${name} إجباري`);
  if (v.length > max) throw new HttpError(400, `${name} طويل جدًا`);
  return v || null;
}
function date(value, name = 'التاريخ') {
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) throw new HttpError(400, `${name} غير صالح`);
  return value;
}
function password(value) {
  const v = typeof value === 'string' ? clean(value) : '';
  if (v.length < 6) throw new HttpError(400, 'كلمة السر يجب أن تحتوي على 6 أحرف على الأقل');
  return v;
}
// اليوم بتوقيت تونس
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: process.env.TZ_APP || 'Africa/Tunis' });
const ROLE_LABELS = { admin: 'مشرف', talib: 'طالب' };

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function createHandler(pool, {
  adminPassword = process.env.ADMIN_PASSWORD,
  adminUsername = process.env.ADMIN_USERNAME || 'admin',
  adminName = process.env.ADMIN_NAME || 'المشرف',
  adminEmail = process.env.ADMIN_EMAIL || null,
  googleClientId = process.env.GOOGLE_CLIENT_ID || '',
  verifyGoogle = (credential) => verifyGoogleToken(credential, googleClientId, HttpError),
} = {}) {
  const all = async (sql, params = []) => (await pool.query(sql, params)).rows;
  const one = async (sql, params = []) => (await pool.query(sql, params)).rows[0] || null;

  // أول حساب للمشرف يُنشأ من المتغيرات ADMIN_PASSWORD (وADMIN_USERNAME، ADMIN_NAME، ADMIN_EMAIL)
  let bootstrapped = null;
  const bootstrap = () =>
    (bootstrapped ??= (async () => {
      if (!adminPassword) return;
      await pool.query(
        `INSERT INTO users (username, email, password_hash, full_name, role)
         SELECT $1, $2, $3, $4, 'admin' WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')`,
        [adminUsername, adminEmail, hashPassword(adminPassword), adminName]
      );
    })().catch((err) => {
      bootstrapped = null;
      throw err;
    }));

  const userById = (id) => one('SELECT id, username, email, full_name, role, phone, disabled, last_seen, google_email, photo IS NOT NULL AS has_photo, photo_v FROM users WHERE id = $1', [id]);
  const withLabel = (u) => u && { ...u, role_label: ROLE_LABELS[u.role] };

  async function startSession(userId, setSession) {
    const token = crypto.randomBytes(32).toString('hex');
    await pool.query('DELETE FROM sessions WHERE expires_at <= now()');
    await pool.query('INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, now() + make_interval(secs => $3))', [token, userId, SESSION_TTL_S]);
    await pool.query('UPDATE users SET last_seen = now() WHERE id = $1', [userId]);
    setSession(token, SESSION_TTL_S);
    return withLabel(await userById(userId));
  }

  const routes = [];
  const route = (method, path, roles, handler) => {
    const keys = [];
    const re = new RegExp('^' + path.replace(/:(\w+)/g, (_, k) => (keys.push(k), '(\\d{1,9})')) + '$');
    routes.push({ method, re, keys, roles, handler });
  };
  const ANY = [];

  // ---------- الدخول ----------
  route('POST', '/api/login', null, async ({ body, setSession }) => {
    const login = clean(text(body.username, { required: true, name: 'اسم المستخدم' }));
    const row = await one('SELECT id, password_hash, disabled FROM users WHERE lower(username) = lower($1) OR lower(email) = lower($1) ORDER BY id LIMIT 1', [login]);
    const raw = String(body.password ?? '');
    if (!row || !(verifyPassword(raw, row.password_hash) || verifyPassword(clean(raw), row.password_hash))) {
      throw new HttpError(401, 'اسم المستخدم أو كلمة السر غير صحيحة');
    }
    if (row.disabled) throw new HttpError(403, 'حسابك موقوف حاليًا');
    return { user: await startSession(row.id, setSession) };
  });
  route('POST', '/api/logout', null, async ({ token, setSession }) => {
    if (token) await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
    setSession('', 0);
    return { ok: true };
  });
  route('GET', '/api/me', ANY, async ({ user }) => ({ user: withLabel(user) }));
  route('POST', '/api/me/password', ANY, async ({ user, body, token }) => {
    const row = await one('SELECT password_hash FROM users WHERE id = $1', [user.id]);
    if (!verifyPassword(String(body.current ?? ''), row.password_hash) && !verifyPassword(clean(body.current), row.password_hash)) {
      throw new HttpError(400, 'كلمة السر الحالية غير صحيحة');
    }
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(password(body.next)), user.id]);
    await pool.query('DELETE FROM sessions WHERE user_id = $1 AND token <> $2', [user.id, token]);
    return { ok: true };
  });
  // بياناتي: الطالب (الاسم، اللقب، العمر، الهاتف) والمشرف (الاسم، الهاتف، البريد)
  route('PUT', '/api/me', ANY, async ({ user, body }) => {
    const phone = text(body.phone, { max: 30, name: 'الهاتف' });
    if (user.role === 'talib') {
      const first = text(body.first_name, { required: true, max: 60, name: 'الاسم' });
      const last = text(body.last_name, { max: 60, name: 'اللقب' });
      const age = body.age === '' || body.age === undefined || body.age === null ? null : Number(body.age);
      if (age !== null && !(Number.isInteger(age) && age >= 3 && age <= 99)) throw new HttpError(400, 'العمر غير صالح');
      await pool.query('UPDATE quran_students SET first_name = $1, last_name = $2, age = $3 WHERE user_id = $4', [first, last, age, user.id]);
      await pool.query('UPDATE users SET full_name = $1, phone = $2 WHERE id = $3', [[first, last].filter(Boolean).join(' '), phone, user.id]);
    } else {
      const email = text(body.email, { max: 120, name: 'البريد الإلكتروني' });
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'البريد الإلكتروني غير صالح');
      await pool.query('UPDATE users SET full_name = $1, phone = $2, email = $3 WHERE id = $4', [
        text(body.full_name, { required: true, max: 120, name: 'الاسم' }), phone, email, user.id,
      ]);
    }
    return { user: withLabel(await userById(user.id)) };
  });
  route('GET', '/api/me/profile', ANY, async ({ user }) => ({
    profile: user.role === 'talib' ? await one('SELECT first_name, last_name, age FROM quran_students WHERE user_id = $1', [user.id]) : null,
  }));

  // الصورة الشخصية: صورة مصغّرة (JPEG/PNG/WebP) يرسلها الهاتف
  route('PUT', '/api/me/photo', ANY, async ({ user, body }) => {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.image || ''));
    if (!m) throw new HttpError(400, 'الصورة غير صالحة');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 400 * 1024) throw new HttpError(400, 'الصورة كبيرة جدًا');
    await pool.query('UPDATE users SET photo = $1, photo_type = $2, photo_v = photo_v + 1 WHERE id = $3', [buf, m[1], user.id]);
    return { user: withLabel(await userById(user.id)) };
  });
  route('DELETE', '/api/me/photo', ANY, async ({ user }) => {
    await pool.query('UPDATE users SET photo = NULL, photo_type = NULL, photo_v = photo_v + 1 WHERE id = $1', [user.id]);
    return { user: withLabel(await userById(user.id)) };
  });
  route('GET', '/api/users/:id/photo', ANY, async ({ params }) => {
    const row = await one('SELECT photo, photo_type FROM users WHERE id = $1 AND photo IS NOT NULL', [params.id]);
    if (!row) throw new HttpError(404, 'لا توجد صورة');
    return new Response(row.photo, { status: 200, headers: { 'Content-Type': row.photo_type, 'Cache-Control': 'private, max-age=31536000' } });
  });

  // ---------- Google: الدخول، وتسجيل الطلبة الجدد (يؤكده المشرف) ----------
  registerGoogleRoutes({ route, pool, all, one, HttpError, text, hashPassword, today, startSession, googleClientId, verifyGoogle, ANY });

  // ---------- المشرفون: الشيخ والإدارة، بنفس الصلاحيات ----------
  route('GET', '/api/admins', ['admin'], async () => ({
    admins: await all(`SELECT id, username, email, full_name, phone, last_seen, photo IS NOT NULL AS has_photo, photo_v FROM users WHERE role = 'admin' ORDER BY id`),
  }));
  route('POST', '/api/admins', ['admin'], async ({ body }) => {
    const username = clean(text(body.username, { required: true, max: 50, name: 'اسم المستخدم' }));
    if (await one('SELECT 1 FROM users WHERE lower(username) = lower($1)', [username])) throw new HttpError(409, 'اسم المستخدم مستعمل');
    const admin = await one(
      `INSERT INTO users (username, password_hash, full_name, role, phone) VALUES ($1, $2, $3, 'admin', $4) RETURNING id, username, full_name, phone`,
      [username, hashPassword(password(body.password)), text(body.full_name, { required: true, max: 120, name: 'الاسم' }), text(body.phone, { max: 30, name: 'الهاتف' })]
    );
    return [201, { admin }];
  });
  route('PUT', '/api/admins/:id', ['admin'], async ({ params, body }) => {
    const a = await one(`SELECT id FROM users WHERE id = $1 AND role = 'admin'`, [params.id]);
    if (!a) throw new HttpError(404, 'الحساب غير موجود');
    await pool.query('UPDATE users SET full_name = $1, phone = $2 WHERE id = $3', [
      text(body.full_name, { required: true, max: 120, name: 'الاسم' }), text(body.phone, { max: 30, name: 'الهاتف' }), a.id,
    ]);
    if (body.password) {
      await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hashPassword(password(body.password)), a.id]);
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [a.id]);
    }
    return { ok: true };
  });
  route('DELETE', '/api/admins/:id', ['admin'], async ({ user, params }) => {
    if (params.id === user.id) throw new HttpError(400, 'لا يمكنك حذف حسابك');
    const { rowCount } = await pool.query(`DELETE FROM users WHERE id = $1 AND role = 'admin'`, [params.id]);
    if (!rowCount) throw new HttpError(404, 'الحساب غير موجود');
    return { ok: true };
  });

  // ---------- المتابعة ----------
  registerQuranRoutes({ route, pool, all, one, HttpError, text, date, hashPassword, password, today });

  return async function handle(request) {
    const url = new URL(request.url);
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
    const cookies = [];
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    const setSession = (token, maxAge) => cookies.push(`${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`);
    const respond = (status, data) => {
      const res = new Response(JSON.stringify(data), { status, headers });
      for (const c of cookies) res.headers.append('Set-Cookie', c);
      return res;
    };
    try {
      await bootstrap();
      const match = routes.filter((r) => r.re.test(url.pathname)).find((r) => r.method === request.method);
      if (!match) throw new HttpError(404, 'غير موجود');
      const token = parseCookies(request.headers.get('cookie') || '')[SESSION_COOKIE] || null;
      let user = null;
      if (token) {
        const row = await one('SELECT user_id FROM sessions WHERE token = $1 AND expires_at > now()', [token]);
        if (row) user = await userById(row.user_id);
        if (user?.disabled) user = null;
        if (user && (!user.last_seen || Date.now() - new Date(user.last_seen).getTime() > 300000)) {
          pool.query('UPDATE users SET last_seen = now() WHERE id = $1', [user.id]).catch(() => {});
        }
      }
      if (match.roles) {
        if (!user) throw new HttpError(401, 'يجب تسجيل الدخول');
        if (match.roles.length && !match.roles.includes(user.role)) throw new HttpError(403, 'ليس لديك صلاحية');
      }
      let body = {};
      if (!['GET', 'HEAD'].includes(request.method)) {
        const raw = await request.text();
        if (raw) {
          try {
            body = JSON.parse(raw);
          } catch {
            throw new HttpError(400, 'طلب غير صالح');
          }
          if (!body || typeof body !== 'object') body = {};
        }
      }
      const m = url.pathname.match(match.re);
      const params = Object.fromEntries(match.keys.map((k, i) => [k, Number(m[i + 1])]));
      const result = await match.handler({ user, params, query: url.searchParams, body, token, setSession });
      if (result instanceof Response) return result;
      return Array.isArray(result) ? respond(result[0], result[1]) : respond(200, result);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status === 500) console.error(err);
      return respond(status, { error: status === 500 ? 'خطأ في الخادم' : err.message });
    }
  };
}
