-- =====================================================================
-- فلوسي — قاعدة البيانات (Supabase)، مستقلة عن أي تطبيق آخر
-- الجداول في المخطط الخاص flousi (غير مفتوح للـ API).
-- الواجهة لا تصل إلا إلى الدوال public.flousi_* (SECURITY DEFINER) بمفتاح Supabase العمومي.
-- كل دالة تتحقق من رمز الجلسة؛ كل حساب يرى عملياته فقط؛ المسؤول يدير الأنواع.
-- يُنفَّذ مرة واحدة في SQL Editor (يتطلب pgcrypto في المخطط extensions، موجودة افتراضيًا في Supabase).
-- =====================================================================

CREATE SCHEMA IF NOT EXISTS flousi;
REVOKE ALL ON SCHEMA flousi FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON SCHEMA flousi FROM anon, authenticated';
  END IF;
END $$;

CREATE TABLE flousi.users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  failed INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_key ON flousi.users (lower(username));

-- يُحفظ بصمة الرمز (sha256) فقط، لا الرمز نفسه
CREATE TABLE flousi.sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES flousi.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE flousi.settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  signup_open BOOLEAN NOT NULL DEFAULT true
);
INSERT INTO flousi.settings DEFAULT VALUES;

CREATE TABLE flousi.categories (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🏷️',
  color TEXT NOT NULL DEFAULT '#61038d',
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX categories_name_key ON flousi.categories (type, lower(name)) WHERE NOT archived;

CREATE TABLE flousi.transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES flousi.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(12, 3) NOT NULL CHECK (amount > 0),
  category_id INTEGER NOT NULL REFERENCES flousi.categories(id),
  date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user_date ON flousi.transactions (user_id, date);

ALTER TABLE flousi.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE flousi.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE flousi.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE flousi.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE flousi.transactions ENABLE ROW LEVEL SECURITY;

INSERT INTO flousi.categories (type, name, icon, color, sort_order) VALUES
  ('expense', 'أكل ومشتريات', '🛒', '#61038d', 1),
  ('expense', 'نقل وبنزين', '🚗', '#20149a', 2),
  ('expense', 'سكن وكراء', '🏠', '#ef207a', 3),
  ('expense', 'فواتير', '💡', '#f59e0b', 4),
  ('expense', 'صحة', '💊', '#10b981', 5),
  ('expense', 'تعليم', '📚', '#6fb6ff', 6),
  ('expense', 'ملابس', '👕', '#a855f7', 7),
  ('expense', 'عائلة وأولاد', '👨‍👩‍👧', '#f97316', 8),
  ('expense', 'خرجات وترفيه', '☕', '#e11d48', 9),
  ('expense', 'هاتف وأنترنت', '📱', '#0ea5e9', 10),
  ('expense', 'ديون وأقساط', '💳', '#64748b', 11),
  ('expense', 'أخرى', '📦', '#94a3b8', 99),
  ('income', 'أجرة', '💼', '#61038d', 1),
  ('income', 'مشروع / تجارة', '🏪', '#20149a', 2),
  ('income', 'عمل إضافي', '🛠️', '#ef207a', 3),
  ('income', 'هدية / منحة', '🎁', '#10b981', 4),
  ('income', 'استرجاع دين', '🤝', '#6fb6ff', 5),
  ('income', 'أخرى', '💰', '#94a3b8', 99);

-- ---------------------------------------------------------------------
-- دوال داخلية (غير مفتوحة)
-- ---------------------------------------------------------------------
CREATE FUNCTION flousi.hash_token(p_token TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

CREATE FUNCTION flousi.auth(p_token TEXT) RETURNS flousi.users
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users;
BEGIN
  SELECT us.* INTO u FROM flousi.sessions s JOIN flousi.users us ON us.id = s.user_id
  WHERE s.token_hash = flousi.hash_token(p_token) AND s.expires_at > now();
  IF u.id IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول' USING HINT = 'auth'; END IF;
  RETURN u;
END $$;

CREATE FUNCTION flousi.admin(p_token TEXT) RETURNS flousi.users
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token);
BEGIN
  IF NOT u.is_admin THEN RAISE EXCEPTION 'هذا للمسؤول فقط'; END IF;
  RETURN u;
END $$;

CREATE FUNCTION flousi.user_json(u flousi.users) RETURNS JSONB
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', u.id, 'username', u.username, 'full_name', u.full_name, 'is_admin', u.is_admin)
$$;

CREATE FUNCTION flousi.new_session(p_user INTEGER) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t TEXT := encode(extensions.gen_random_bytes(32), 'hex');
BEGIN
  DELETE FROM flousi.sessions WHERE expires_at <= now();
  INSERT INTO flousi.sessions (token_hash, user_id, expires_at) VALUES (flousi.hash_token(t), p_user, now() + interval '60 days');
  RETURN t;
END $$;

CREATE FUNCTION flousi.cat_json(c flousi.categories) RETURNS JSONB
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', c.id, 'type', c.type, 'name', c.name, 'icon', c.icon, 'color', c.color,
    'sort_order', c.sort_order, 'archived', c.archived)
$$;

CREATE FUNCTION flousi.tx_json(t flousi.transactions) RETURNS JSONB
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', t.id, 'type', t.type, 'amount', t.amount, 'category_id', t.category_id,
    'date', t.date::text, 'note', t.note)
$$;

CREATE FUNCTION flousi.clean_icon(p TEXT) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  p := btrim(coalesce(p, ''));
  IF char_length(p) > 8 THEN RAISE EXCEPTION 'الرمز طويل جدًا'; END IF;
  RETURN coalesce(nullif(p, ''), '🏷️');
END $$;

-- ---------------------------------------------------------------------
-- الدوال المفتوحة للواجهة
-- ---------------------------------------------------------------------

-- قبل الدخول: هل التسجيل مفتوح؟ هل يوجد حساب؟
CREATE FUNCTION public.flousi_info() RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'signup_open', (SELECT signup_open FROM flousi.settings) OR NOT EXISTS (SELECT 1 FROM flousi.users),
    'has_users', EXISTS (SELECT 1 FROM flousi.users))
$$;

-- أول حساب يُنشأ يصبح المسؤول
CREATE FUNCTION public.flousi_signup(p_username TEXT, p_password TEXT, p_full_name TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users; first BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(917311);
  first := NOT EXISTS (SELECT 1 FROM flousi.users);
  IF NOT first AND NOT (SELECT signup_open FROM flousi.settings) THEN RAISE EXCEPTION 'إنشاء الحسابات مغلق'; END IF;
  p_username := btrim(coalesce(p_username, ''));
  p_full_name := btrim(coalesce(p_full_name, ''));
  IF p_username !~ '^[A-Za-z0-9._-]{3,30}$' THEN
    RAISE EXCEPTION 'اسم المستخدم: من 3 إلى 30 حرفًا لاتينيًا أو أرقامًا (دون فراغ)';
  END IF;
  IF char_length(coalesce(p_password, '')) < 6 THEN RAISE EXCEPTION 'كلمة السر: 6 أحرف على الأقل'; END IF;
  IF p_full_name = '' OR char_length(p_full_name) > 60 THEN RAISE EXCEPTION 'اكتب اسمك'; END IF;
  IF EXISTS (SELECT 1 FROM flousi.users WHERE lower(username) = lower(p_username)) THEN
    RAISE EXCEPTION 'اسم المستخدم مستعمل';
  END IF;
  INSERT INTO flousi.users (username, pass_hash, full_name, is_admin)
  VALUES (p_username, extensions.crypt(p_password, extensions.gen_salt('bf', 10)), p_full_name, first)
  RETURNING * INTO u;
  RETURN jsonb_build_object('token', flousi.new_session(u.id), 'user', flousi.user_json(u));
END $$;

-- الدخول: يُرجع {error} بدل الخطأ حتى يُحفظ عدد المحاولات الفاشلة (10 محاولات ثم انتظار 15 دقيقة)
CREATE FUNCTION public.flousi_login(p_username TEXT, p_password TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users;
BEGIN
  SELECT * INTO u FROM flousi.users WHERE lower(username) = lower(btrim(coalesce(p_username, '')));
  IF u.id IS NULL THEN RETURN jsonb_build_object('error', 'اسم المستخدم أو كلمة السر غير صحيحة'); END IF;
  IF u.locked_until > now() THEN RETURN jsonb_build_object('error', 'محاولات كثيرة. حاول بعد ربع ساعة'); END IF;
  IF u.pass_hash <> extensions.crypt(coalesce(p_password, ''), u.pass_hash) THEN
    UPDATE flousi.users SET failed = CASE WHEN failed >= 9 THEN 0 ELSE failed + 1 END,
      locked_until = CASE WHEN failed >= 9 THEN now() + interval '15 minutes' ELSE locked_until END
    WHERE id = u.id;
    RETURN jsonb_build_object('error', 'اسم المستخدم أو كلمة السر غير صحيحة');
  END IF;
  UPDATE flousi.users SET failed = 0, locked_until = NULL WHERE id = u.id;
  RETURN jsonb_build_object('token', flousi.new_session(u.id), 'user', flousi.user_json(u));
END $$;

CREATE FUNCTION public.flousi_logout(p_token TEXT) RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM flousi.sessions WHERE token_hash = flousi.hash_token(p_token);
  SELECT '{"ok":true}'::jsonb
$$;

CREATE FUNCTION public.flousi_password(p_token TEXT, p_current TEXT, p_next TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token);
BEGIN
  IF u.pass_hash <> extensions.crypt(coalesce(p_current, ''), u.pass_hash) THEN RAISE EXCEPTION 'كلمة السر الحالية غير صحيحة'; END IF;
  IF char_length(coalesce(p_next, '')) < 6 THEN RAISE EXCEPTION 'كلمة السر: 6 أحرف على الأقل'; END IF;
  UPDATE flousi.users SET pass_hash = extensions.crypt(p_next, extensions.gen_salt('bf', 10)) WHERE id = u.id;
  DELETE FROM flousi.sessions WHERE user_id = u.id AND token_hash <> flousi.hash_token(p_token);
  RETURN '{"ok":true}'::jsonb;
END $$;

-- كل ما تحتاجه الواجهة: الحساب، الأنواع، عمليات هذا الحساب فقط
CREATE FUNCTION public.flousi_state(p_token TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token);
BEGIN
  RETURN jsonb_build_object(
    'user', flousi.user_json(u),
    'categories', coalesce((SELECT jsonb_agg(flousi.cat_json(c) ORDER BY c.type, c.archived, c.sort_order, c.id) FROM flousi.categories c), '[]'),
    'transactions', coalesce((SELECT jsonb_agg(flousi.tx_json(t) ORDER BY t.date DESC, t.id DESC) FROM flousi.transactions t WHERE t.user_id = u.id), '[]'),
    'settings', CASE WHEN u.is_admin THEN jsonb_build_object(
      'signup_open', (SELECT signup_open FROM flousi.settings),
      'users', (SELECT jsonb_agg(jsonb_build_object('id', x.id, 'username', x.username, 'full_name', x.full_name, 'is_admin', x.is_admin) ORDER BY x.id) FROM flousi.users x))
    END);
END $$;

-- إضافة (p_id = null) أو تعديل عملية
CREATE FUNCTION public.flousi_tx_save(p_token TEXT, p_id INTEGER, p_type TEXT, p_amount NUMERIC, p_category_id INTEGER, p_date DATE, p_note TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token); c flousi.categories; old flousi.transactions; t flousi.transactions;
BEGIN
  IF p_type NOT IN ('income', 'expense') OR p_type IS NULL THEN RAISE EXCEPTION 'اختر مدخول أو مصروف'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 100000000 THEN RAISE EXCEPTION 'المبلغ غير صالح'; END IF;
  IF p_date IS NULL OR p_date < '1990-01-01' OR p_date > current_date + 3650 THEN RAISE EXCEPTION 'التاريخ غير صالح'; END IF;
  p_note := nullif(btrim(coalesce(p_note, '')), '');
  IF char_length(p_note) > 200 THEN RAISE EXCEPTION 'الملاحظة طويلة جدًا'; END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO old FROM flousi.transactions WHERE id = p_id AND user_id = u.id;
    IF old.id IS NULL THEN RAISE EXCEPTION 'العملية غير موجودة'; END IF;
  END IF;
  SELECT * INTO c FROM flousi.categories WHERE id = p_category_id;
  IF c.id IS NULL OR c.type <> p_type THEN RAISE EXCEPTION 'اختر النوع'; END IF;
  IF c.archived AND old.category_id IS DISTINCT FROM c.id THEN RAISE EXCEPTION 'هذا النوع لم يعد مستعملًا'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO flousi.transactions (user_id, type, amount, category_id, date, note)
    VALUES (u.id, p_type, round(p_amount, 3), c.id, p_date, p_note) RETURNING * INTO t;
  ELSE
    UPDATE flousi.transactions SET type = p_type, amount = round(p_amount, 3), category_id = c.id, date = p_date, note = p_note
    WHERE id = p_id RETURNING * INTO t;
  END IF;
  RETURN flousi.tx_json(t);
END $$;

CREATE FUNCTION public.flousi_tx_delete(p_token TEXT, p_id INTEGER) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token);
BEGIN
  DELETE FROM flousi.transactions WHERE id = p_id AND user_id = u.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'العملية غير موجودة'; END IF;
  RETURN '{"ok":true}'::jsonb;
END $$;

-- نقل العمليات المحفوظة في الهاتف (النسخة الأولى): النوع حسب الاسم، وإلا «أخرى»
CREATE FUNCTION public.flousi_import(p_token TEXT, p_items JSONB) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token); n INTEGER; total INTEGER;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'لا توجد عمليات'; END IF;
  total := jsonb_array_length(p_items);
  IF total = 0 THEN RAISE EXCEPTION 'لا توجد عمليات'; END IF;
  IF total > 5000 THEN RAISE EXCEPTION 'عدد العمليات كبير جدًا'; END IF;
  WITH items AS (
    SELECT x->>'type' AS type, x->>'amount' AS amount, btrim(coalesce(x->>'category', '')) AS cat, x->>'date' AS d,
      nullif(left(btrim(coalesce(x->>'note', '')), 200), '') AS note
    FROM jsonb_array_elements(p_items) x WHERE jsonb_typeof(x) = 'object'
  ), valid AS (
    SELECT i.type, i.amount::numeric AS amount, i.cat, i.d::date AS d, i.note FROM items i
    WHERE i.type IN ('income', 'expense') AND i.amount ~ '^\d+(\.\d+)?$' AND i.d ~ '^\d{4}-\d{2}-\d{2}$'
  )
  INSERT INTO flousi.transactions (user_id, type, amount, category_id, date, note)
  SELECT u.id, v.type, round(v.amount, 3),
    coalesce(
      (SELECT id FROM flousi.categories c WHERE c.type = v.type AND NOT c.archived AND c.name = v.cat LIMIT 1),
      (SELECT id FROM flousi.categories c WHERE c.type = v.type AND NOT c.archived AND c.name = 'أخرى' LIMIT 1),
      (SELECT id FROM flousi.categories c WHERE c.type = v.type AND NOT c.archived ORDER BY sort_order DESC LIMIT 1)),
    v.d, v.note
  FROM valid v WHERE v.amount > 0 AND v.amount <= 100000000;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'لا توجد عمليات صالحة'; END IF;
  RETURN jsonb_build_object('imported', n, 'skipped', total - n);
END $$;

-- ---------- المسؤول: الأنواع ----------
CREATE FUNCTION public.flousi_cat_save(p_token TEXT, p_id INTEGER, p_type TEXT, p_name TEXT, p_icon TEXT, p_color TEXT, p_archived BOOLEAN DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.admin(p_token); c flousi.categories; nm TEXT; col TEXT; arch BOOLEAN;
BEGIN
  IF p_id IS NOT NULL THEN
    SELECT * INTO c FROM flousi.categories WHERE id = p_id;
    IF c.id IS NULL THEN RAISE EXCEPTION 'النوع غير موجود'; END IF;
    p_type := c.type;
  ELSIF p_type NOT IN ('income', 'expense') OR p_type IS NULL THEN
    RAISE EXCEPTION 'اختر مصاريف أو مداخيل';
  END IF;
  nm := btrim(coalesce(p_name, c.name, ''));
  IF nm = '' THEN RAISE EXCEPTION 'اكتب اسم النوع'; END IF;
  IF char_length(nm) > 40 THEN RAISE EXCEPTION 'الاسم طويل جدًا'; END IF;
  col := CASE WHEN p_color ~* '^#[0-9a-f]{6}$' THEN lower(p_color) ELSE coalesce(c.color, '#61038d') END;
  arch := coalesce(p_archived, c.archived, false);
  IF NOT arch AND EXISTS (SELECT 1 FROM flousi.categories WHERE type = p_type AND lower(name) = lower(nm) AND NOT archived AND id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'هذا النوع موجود';
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO flousi.categories (type, name, icon, color, sort_order)
    VALUES (p_type, nm, flousi.clean_icon(p_icon), col,
      (SELECT coalesce(max(sort_order), 0) + 1 FROM flousi.categories WHERE type = p_type AND sort_order < 99))
    RETURNING * INTO c;
  ELSE
    UPDATE flousi.categories SET name = nm, icon = CASE WHEN p_icon IS NULL THEN icon ELSE flousi.clean_icon(p_icon) END,
      color = col, archived = arch WHERE id = p_id RETURNING * INTO c;
  END IF;
  RETURN flousi.cat_json(c);
END $$;

CREATE FUNCTION public.flousi_cat_order(p_token TEXT, p_ids INTEGER[]) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.admin(p_token);
BEGIN
  UPDATE flousi.categories c SET sort_order = o.pos FROM unnest(p_ids) WITH ORDINALITY AS o(id, pos) WHERE c.id = o.id;
  RETURN '{"ok":true}'::jsonb;
END $$;

-- نوع غير مستعمل يُحذف؛ نوع فيه عمليات يُوقف (يبقى في الإحصائيات القديمة)
CREATE FUNCTION public.flousi_cat_delete(p_token TEXT, p_id INTEGER) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.admin(p_token); c flousi.categories; used INTEGER;
BEGIN
  SELECT * INTO c FROM flousi.categories WHERE id = p_id;
  IF c.id IS NULL THEN RAISE EXCEPTION 'النوع غير موجود'; END IF;
  SELECT count(*) INTO used FROM flousi.transactions WHERE category_id = c.id;
  IF used = 0 THEN
    DELETE FROM flousi.categories WHERE id = c.id;
    RETURN '{"deleted":true}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM flousi.categories WHERE type = c.type AND NOT archived AND id <> c.id) THEN
    RAISE EXCEPTION 'يجب أن يبقى نوع واحد على الأقل';
  END IF;
  UPDATE flousi.categories SET archived = true WHERE id = c.id;
  RETURN jsonb_build_object('archived', true, 'used', used);
END $$;

-- ---------- المسؤول: الحسابات ----------
CREATE FUNCTION public.flousi_admin_settings(p_token TEXT, p_signup_open BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.admin(p_token);
BEGIN
  UPDATE flousi.settings SET signup_open = coalesce(p_signup_open, signup_open);
  RETURN '{"ok":true}'::jsonb;
END $$;

CREATE FUNCTION public.flousi_admin_user(p_token TEXT, p_user_id INTEGER, p_is_admin BOOLEAN DEFAULT NULL, p_delete BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.admin(p_token);
BEGIN
  IF p_user_id = u.id THEN RAISE EXCEPTION 'لا يمكنك تغيير حسابك أنت'; END IF;
  IF p_delete THEN
    DELETE FROM flousi.users WHERE id = p_user_id;
  ELSE
    UPDATE flousi.users SET is_admin = coalesce(p_is_admin, is_admin) WHERE id = p_user_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'الحساب غير موجود'; END IF;
  RETURN '{"ok":true}'::jsonb;
END $$;

-- الصلاحيات: الدوال المفتوحة فقط، للمفتاح العمومي
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig, n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE (n.nspname = 'public' AND p.proname LIKE 'flousi\_%') OR n.nspname = 'flousi' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    IF f.nspname = 'public' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
    END IF;
  END LOOP;
END $$;
