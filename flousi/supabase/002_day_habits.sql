-- =====================================================================
-- فلوسي — التحديث 2: جدولي اليومي + متتبّع العادات
-- يُنفَّذ مرة واحدة في SQL Editor بعد schema.sql. لا يحذف ولا يغيّر أي شيء موجود.
-- الأيام: قناع بِتّات، البِت 0 = الأحد … البِت 6 = السبت (127 = كل يوم)
-- =====================================================================

CREATE TABLE flousi.schedule (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES flousi.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '⏰',
  color TEXT NOT NULL DEFAULT '#61038d',
  start_min INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),   -- دقائق منذ منتصف الليل
  end_min INTEGER CHECK (end_min BETWEEN 0 AND 1440),               -- NULL = دون نهاية؛ أصغر من البداية = بعد منتصف الليل
  days SMALLINT NOT NULL DEFAULT 127 CHECK (days BETWEEN 1 AND 127),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX schedule_user ON flousi.schedule (user_id, start_min);

CREATE TABLE flousi.habits (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES flousi.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '✅',
  color TEXT NOT NULL DEFAULT '#61038d',
  days SMALLINT NOT NULL DEFAULT 127 CHECK (days BETWEEN 1 AND 127),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX habits_user ON flousi.habits (user_id, sort_order);

CREATE TABLE flousi.habit_logs (
  habit_id INTEGER NOT NULL REFERENCES flousi.habits(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  PRIMARY KEY (habit_id, date)
);

ALTER TABLE flousi.schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE flousi.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE flousi.habit_logs ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION flousi.clean_color(p TEXT, fallback TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE WHEN p ~* '^#[0-9a-f]{6}$' THEN lower(p) ELSE fallback END
$$;

-- كل ما يحتاجه «يومي» و«عاداتي»: البرنامج، العادات، وسجلّ آخر 400 يوم
CREATE FUNCTION public.flousi_life(p_token TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token);
BEGIN
  RETURN jsonb_build_object(
    'schedule', coalesce((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'icon', s.icon, 'color', s.color,
        'start', s.start_min, 'end', s.end_min, 'days', s.days) ORDER BY s.start_min, s.id)
      FROM flousi.schedule s WHERE s.user_id = u.id), '[]'),
    'habits', coalesce((SELECT jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'icon', h.icon, 'color', h.color,
        'days', h.days, 'created', h.created_at::date::text) ORDER BY h.sort_order, h.id)
      FROM flousi.habits h WHERE h.user_id = u.id), '[]'),
    'logs', coalesce((SELECT jsonb_agg(jsonb_build_array(l.habit_id, l.date::text))
      FROM flousi.habit_logs l JOIN flousi.habits h ON h.id = l.habit_id
      WHERE h.user_id = u.id AND l.date > current_date - 400), '[]'));
END $$;

-- ---------- جدولي اليومي ----------
CREATE FUNCTION public.flousi_plan_save(p_token TEXT, p_id INTEGER, p_title TEXT, p_icon TEXT, p_color TEXT,
  p_start INTEGER, p_end INTEGER, p_days INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token); s flousi.schedule;
BEGIN
  p_title := btrim(coalesce(p_title, ''));
  IF p_title = '' THEN RAISE EXCEPTION 'اكتب اسم النشاط'; END IF;
  IF char_length(p_title) > 60 THEN RAISE EXCEPTION 'الاسم طويل جدًا'; END IF;
  IF p_start IS NULL OR p_start < 0 OR p_start > 1439 THEN RAISE EXCEPTION 'وقت البداية غير صالح'; END IF;
  IF p_end IS NOT NULL AND (p_end < 0 OR p_end > 1440 OR p_end = p_start) THEN RAISE EXCEPTION 'وقت النهاية غير صالح'; END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 127 THEN RAISE EXCEPTION 'اختر يومًا واحدًا على الأقل'; END IF;
  IF p_id IS NULL THEN
    IF (SELECT count(*) FROM flousi.schedule WHERE user_id = u.id) >= 80 THEN RAISE EXCEPTION 'الجدول ممتلئ (80 نشاطًا)'; END IF;
    INSERT INTO flousi.schedule (user_id, title, icon, color, start_min, end_min, days)
    VALUES (u.id, p_title, flousi.clean_icon(p_icon), flousi.clean_color(p_color, '#61038d'), p_start, p_end, p_days)
    RETURNING * INTO s;
  ELSE
    UPDATE flousi.schedule SET title = p_title, icon = flousi.clean_icon(p_icon), color = flousi.clean_color(p_color, color),
      start_min = p_start, end_min = p_end, days = p_days
    WHERE id = p_id AND user_id = u.id RETURNING * INTO s;
    IF s.id IS NULL THEN RAISE EXCEPTION 'النشاط غير موجود'; END IF;
  END IF;
  RETURN jsonb_build_object('id', s.id, 'title', s.title, 'icon', s.icon, 'color', s.color,
    'start', s.start_min, 'end', s.end_min, 'days', s.days);
END $$;

CREATE FUNCTION public.flousi_plan_delete(p_token TEXT, p_id INTEGER) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token);
BEGIN
  DELETE FROM flousi.schedule WHERE id = p_id AND user_id = u.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'النشاط غير موجود'; END IF;
  RETURN '{"ok":true}'::jsonb;
END $$;

-- ---------- العادات ----------
CREATE FUNCTION public.flousi_habit_save(p_token TEXT, p_id INTEGER, p_name TEXT, p_icon TEXT, p_color TEXT, p_days INTEGER)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token); h flousi.habits;
BEGIN
  p_name := btrim(coalesce(p_name, ''));
  IF p_name = '' THEN RAISE EXCEPTION 'اكتب اسم العادة'; END IF;
  IF char_length(p_name) > 50 THEN RAISE EXCEPTION 'الاسم طويل جدًا'; END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 127 THEN RAISE EXCEPTION 'اختر يومًا واحدًا على الأقل'; END IF;
  IF p_id IS NULL THEN
    IF (SELECT count(*) FROM flousi.habits WHERE user_id = u.id) >= 40 THEN RAISE EXCEPTION 'عدد العادات كبير (40)'; END IF;
    INSERT INTO flousi.habits (user_id, name, icon, color, days, sort_order)
    VALUES (u.id, p_name, flousi.clean_icon(p_icon), flousi.clean_color(p_color, '#61038d'), p_days,
      (SELECT coalesce(max(sort_order), 0) + 1 FROM flousi.habits WHERE user_id = u.id))
    RETURNING * INTO h;
  ELSE
    UPDATE flousi.habits SET name = p_name, icon = flousi.clean_icon(p_icon), color = flousi.clean_color(p_color, color), days = p_days
    WHERE id = p_id AND user_id = u.id RETURNING * INTO h;
    IF h.id IS NULL THEN RAISE EXCEPTION 'العادة غير موجودة'; END IF;
  END IF;
  RETURN jsonb_build_object('id', h.id, 'name', h.name, 'icon', h.icon, 'color', h.color, 'days', h.days, 'created', h.created_at::date::text);
END $$;

CREATE FUNCTION public.flousi_habit_delete(p_token TEXT, p_id INTEGER) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token);
BEGIN
  DELETE FROM flousi.habits WHERE id = p_id AND user_id = u.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'العادة غير موجودة'; END IF;
  RETURN '{"ok":true}'::jsonb;
END $$;

CREATE FUNCTION public.flousi_habit_order(p_token TEXT, p_ids INTEGER[]) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token);
BEGIN
  UPDATE flousi.habits h SET sort_order = o.pos FROM unnest(p_ids) WITH ORDINALITY AS o(id, pos)
  WHERE h.id = o.id AND h.user_id = u.id;
  RETURN '{"ok":true}'::jsonb;
END $$;

-- تمّت / لم تتمّ في يوم (اليوم أو يوم سابق)
CREATE FUNCTION public.flousi_habit_check(p_token TEXT, p_habit_id INTEGER, p_date DATE, p_done BOOLEAN) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM flousi.habits WHERE id = p_habit_id AND user_id = u.id) THEN RAISE EXCEPTION 'العادة غير موجودة'; END IF;
  IF p_date IS NULL OR p_date > current_date + 1 OR p_date < current_date - 400 THEN RAISE EXCEPTION 'التاريخ غير صالح'; END IF;
  IF p_done THEN
    INSERT INTO flousi.habit_logs (habit_id, date) VALUES (p_habit_id, p_date) ON CONFLICT DO NOTHING;
  ELSE
    DELETE FROM flousi.habit_logs WHERE habit_id = p_habit_id AND date = p_date;
  END IF;
  RETURN '{"ok":true}'::jsonb;
END $$;

-- الصلاحيات: الدوال الجديدة مفتوحة للمفتاح العمومي، والداخلية مغلقة
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig, n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE (n.nspname = 'public' AND p.proname IN ('flousi_life', 'flousi_plan_save', 'flousi_plan_delete',
                   'flousi_habit_save', 'flousi_habit_delete', 'flousi_habit_order', 'flousi_habit_check'))
              OR (n.nspname = 'flousi' AND p.proname = 'clean_color') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    IF f.nspname = 'public' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
    END IF;
  END LOOP;
END $$;
