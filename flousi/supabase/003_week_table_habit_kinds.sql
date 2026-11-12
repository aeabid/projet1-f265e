-- =====================================================================
-- فلوسي — التحديث 3
-- 1) «يومي» جدول أسبوعي: الجدول الأساسي (week_start = NULL) يُنسخ في كل أسبوع، وكل أسبوع يُعدَّل وحده
-- 2) المواعيد (مرة واحدة بتاريخ ووقت)
-- 3) أنواع العادات: نعم/لا، عدد (أكثر أفضل)، عدد (أقل أفضل)، القرآن (من سورة/آية إلى سورة/آية)
-- يُنفَّذ مرة واحدة بعد 002. لا يحذف شيئًا: الجدول القديم flousi.schedule يُنسخ إلى الجدول الأساسي ويبقى كما هو.
-- الأيام: 0 = الأحد … 6 = السبت (كما في JavaScript). الأسبوع يبدأ يوم الاثنين.
-- =====================================================================

CREATE TABLE flousi.week_items (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES flousi.users(id) ON DELETE CASCADE,
  week_start DATE,                        -- NULL = الجدول الأساسي؛ وإلا يوم الاثنين من الأسبوع
  day SMALLINT NOT NULL CHECK (day BETWEEN 0 AND 6),
  source_id INTEGER REFERENCES flousi.week_items(id) ON DELETE SET NULL,  -- السطر الأساسي الذي نُسخ منه
  title TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '⏰',
  color TEXT NOT NULL DEFAULT '#61038d',
  start_min INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  end_min INTEGER CHECK (end_min BETWEEN 1 AND 1440),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (week_start IS NULL OR extract(isodow FROM week_start) = 1)
);
CREATE INDEX week_items_user ON flousi.week_items (user_id, week_start);

-- أسبوع له نسخته الخاصة (حتى لو أُفرغ)
CREATE TABLE flousi.weeks (
  user_id INTEGER NOT NULL REFERENCES flousi.users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  PRIMARY KEY (user_id, week_start)
);

CREATE TABLE flousi.appointments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES flousi.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  start_min INTEGER NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  end_min INTEGER CHECK (end_min BETWEEN 1 AND 1440),
  title TEXT NOT NULL,
  note TEXT,
  icon TEXT NOT NULL DEFAULT '📌',
  color TEXT NOT NULL DEFAULT '#ef207a',
  done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX appointments_user_date ON flousi.appointments (user_id, date);

ALTER TABLE flousi.week_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE flousi.weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE flousi.appointments ENABLE ROW LEVEL SECURITY;

-- نسخ الجدول القديم (قناع الأيام) إلى الجدول الأساسي: سطر لكل يوم. ما بعد منتصف الليل يتوقّف عند 24:00
INSERT INTO flousi.week_items (user_id, week_start, day, title, icon, color, start_min, end_min)
SELECT s.user_id, NULL, d, s.title, s.icon, s.color, s.start_min,
  CASE WHEN s.end_min IS NULL THEN NULL WHEN s.end_min > s.start_min THEN s.end_min ELSE 1440 END
FROM flousi.schedule s CROSS JOIN generate_series(0, 6) d
WHERE s.days & (1 << d) <> 0
  AND NOT EXISTS (SELECT 1 FROM flousi.week_items w WHERE w.user_id = s.user_id);

-- أنواع العادات
ALTER TABLE flousi.habits ADD COLUMN kind TEXT NOT NULL DEFAULT 'check' CHECK (kind IN ('check', 'more', 'less', 'quran'));
ALTER TABLE flousi.habits ADD COLUMN target INTEGER CHECK (target BETWEEN 0 AND 1000);
ALTER TABLE flousi.habits ADD COLUMN unit TEXT;
ALTER TABLE flousi.habit_logs ADD COLUMN value NUMERIC(10, 2) NOT NULL DEFAULT 1;
ALTER TABLE flousi.habit_logs ADD COLUMN data JSONB;
UPDATE flousi.habits SET kind = 'quran', unit = 'آية' WHERE name LIKE '%قرآن%' AND kind = 'check'
  AND NOT EXISTS (SELECT 1 FROM flousi.habit_logs l WHERE l.habit_id = habits.id);

-- ---------------------------------------------------------------------
-- كل ما تحتاجه «يومي» و«عاداتي» (يعوّض النسخة السابقة؛ نفس الاسم ونفس المعطيات)
CREATE OR REPLACE FUNCTION public.flousi_life(p_token TEXT) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token);
BEGIN
  RETURN jsonb_build_object(
    'slots', coalesce((SELECT jsonb_agg(flousi.slot_json(w) ORDER BY w.week_start NULLS FIRST, w.day, w.start_min, w.id)
      FROM flousi.week_items w WHERE w.user_id = u.id AND (w.week_start IS NULL OR w.week_start >= current_date - 120)), '[]'),
    'weeks', coalesce((SELECT jsonb_agg(k.week_start::text) FROM flousi.weeks k WHERE k.user_id = u.id AND k.week_start >= current_date - 120), '[]'),
    'appointments', coalesce((SELECT jsonb_agg(flousi.appt_json(a) ORDER BY a.date, a.start_min)
      FROM flousi.appointments a WHERE a.user_id = u.id AND a.date >= current_date - 120), '[]'),
    'habits', coalesce((SELECT jsonb_agg(jsonb_build_object('id', h.id, 'name', h.name, 'icon', h.icon, 'color', h.color,
        'days', h.days, 'kind', h.kind, 'target', h.target, 'unit', h.unit, 'created', h.created_at::date::text) ORDER BY h.sort_order, h.id)
      FROM flousi.habits h WHERE h.user_id = u.id), '[]'),
    'logs', coalesce((SELECT jsonb_agg(jsonb_build_array(l.habit_id, l.date::text, l.value, l.data))
      FROM flousi.habit_logs l JOIN flousi.habits h ON h.id = l.habit_id
      WHERE h.user_id = u.id AND l.date > current_date - 400), '[]'));
END $$;

CREATE FUNCTION flousi.slot_json(w flousi.week_items) RETURNS JSONB
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', w.id, 'week', w.week_start::text, 'day', w.day, 'source', w.source_id, 'title', w.title,
    'icon', w.icon, 'color', w.color, 'start', w.start_min, 'end', w.end_min)
$$;

CREATE FUNCTION flousi.appt_json(a flousi.appointments) RETURNS JSONB
LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object('id', a.id, 'date', a.date::text, 'start', a.start_min, 'end', a.end_min, 'title', a.title,
    'note', a.note, 'icon', a.icon, 'color', a.color, 'done', a.done)
$$;

CREATE FUNCTION flousi.check_week(p_week DATE) RETURNS VOID
LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  IF p_week IS NOT NULL AND extract(isodow FROM p_week) <> 1 THEN RAISE EXCEPTION 'الأسبوع يبدأ يوم الاثنين'; END IF;
END $$;

-- نسخة الأسبوع الخاصة: تُنسخ من الجدول الأساسي أول مرة يُعدَّل فيها الأسبوع
CREATE FUNCTION public.flousi_week_materialize(p_token TEXT, p_week DATE) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token);
BEGIN
  IF p_week IS NULL THEN RAISE EXCEPTION 'اختر الأسبوع'; END IF;
  PERFORM flousi.check_week(p_week);
  INSERT INTO flousi.weeks (user_id, week_start) VALUES (u.id, p_week) ON CONFLICT DO NOTHING;
  IF FOUND THEN
    INSERT INTO flousi.week_items (user_id, week_start, day, source_id, title, icon, color, start_min, end_min)
    SELECT u.id, p_week, b.day, b.id, b.title, b.icon, b.color, b.start_min, b.end_min
    FROM flousi.week_items b WHERE b.user_id = u.id AND b.week_start IS NULL;
  END IF;
  RETURN coalesce((SELECT jsonb_agg(flousi.slot_json(w) ORDER BY w.day, w.start_min, w.id)
    FROM flousi.week_items w WHERE w.user_id = u.id AND w.week_start = p_week), '[]');
END $$;

-- إضافة أو تعديل خانة (في الجدول الأساسي أو في أسبوع). p_also_base: طبّق نفس التغيير على الجدول الأساسي
CREATE FUNCTION public.flousi_slot_save(p_token TEXT, p_id INTEGER, p_week DATE, p_day INTEGER, p_title TEXT, p_icon TEXT,
  p_color TEXT, p_start INTEGER, p_end INTEGER, p_also_base BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token); w flousi.week_items; b flousi.week_items;
BEGIN
  PERFORM flousi.check_week(p_week);
  p_title := btrim(coalesce(p_title, ''));
  IF p_title = '' THEN RAISE EXCEPTION 'اكتب اسم النشاط'; END IF;
  IF char_length(p_title) > 60 THEN RAISE EXCEPTION 'الاسم طويل جدًا'; END IF;
  IF p_day IS NULL OR p_day < 0 OR p_day > 6 THEN RAISE EXCEPTION 'اليوم غير صالح'; END IF;
  IF p_start IS NULL OR p_start < 0 OR p_start > 1439 THEN RAISE EXCEPTION 'وقت البداية غير صالح'; END IF;
  IF p_end IS NOT NULL AND (p_end <= p_start OR p_end > 1440) THEN RAISE EXCEPTION 'وقت النهاية يجب أن يكون بعد البداية'; END IF;
  IF p_week IS NOT NULL AND NOT EXISTS (SELECT 1 FROM flousi.weeks WHERE user_id = u.id AND week_start = p_week) THEN
    PERFORM public.flousi_week_materialize(p_token, p_week);
  END IF;
  IF p_id IS NULL THEN
    IF (SELECT count(*) FROM flousi.week_items WHERE user_id = u.id AND week_start IS NOT DISTINCT FROM p_week) >= 300 THEN
      RAISE EXCEPTION 'الجدول ممتلئ';
    END IF;
    INSERT INTO flousi.week_items (user_id, week_start, day, title, icon, color, start_min, end_min)
    VALUES (u.id, p_week, p_day, p_title, flousi.clean_icon(p_icon), flousi.clean_color(p_color, '#61038d'), p_start, p_end)
    RETURNING * INTO w;
  ELSE
    UPDATE flousi.week_items SET day = p_day, title = p_title, icon = flousi.clean_icon(p_icon),
      color = flousi.clean_color(p_color, color), start_min = p_start, end_min = p_end
    WHERE id = p_id AND user_id = u.id AND week_start IS NOT DISTINCT FROM p_week RETURNING * INTO w;
    IF w.id IS NULL THEN RAISE EXCEPTION 'الخانة غير موجودة'; END IF;
  END IF;
  IF p_also_base AND p_week IS NOT NULL THEN
    IF w.source_id IS NOT NULL THEN
      UPDATE flousi.week_items SET day = w.day, title = w.title, icon = w.icon, color = w.color, start_min = w.start_min, end_min = w.end_min
      WHERE id = w.source_id AND user_id = u.id AND week_start IS NULL RETURNING * INTO b;
    END IF;
    IF b.id IS NULL THEN
      INSERT INTO flousi.week_items (user_id, week_start, day, title, icon, color, start_min, end_min)
      VALUES (u.id, NULL, w.day, w.title, w.icon, w.color, w.start_min, w.end_min) RETURNING * INTO b;
      UPDATE flousi.week_items SET source_id = b.id WHERE id = w.id RETURNING * INTO w;
    END IF;
  END IF;
  RETURN jsonb_build_object('slot', flousi.slot_json(w), 'base', CASE WHEN b.id IS NULL THEN NULL ELSE flousi.slot_json(b) END);
END $$;

CREATE FUNCTION public.flousi_slot_delete(p_token TEXT, p_id INTEGER, p_also_base BOOLEAN DEFAULT false) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token); w flousi.week_items;
BEGIN
  DELETE FROM flousi.week_items WHERE id = p_id AND user_id = u.id RETURNING * INTO w;
  IF w.id IS NULL THEN RAISE EXCEPTION 'الخانة غير موجودة'; END IF;
  IF p_also_base AND w.source_id IS NOT NULL THEN
    DELETE FROM flousi.week_items WHERE id = w.source_id AND user_id = u.id AND week_start IS NULL;
  END IF;
  RETURN '{"ok":true}'::jsonb;
END $$;

-- إرجاع أسبوع إلى الجدول الأساسي (حذف نسخته الخاصة)
CREATE FUNCTION public.flousi_week_reset(p_token TEXT, p_week DATE) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token);
BEGIN
  IF p_week IS NULL THEN RAISE EXCEPTION 'اختر الأسبوع'; END IF;
  DELETE FROM flousi.week_items WHERE user_id = u.id AND week_start = p_week;
  DELETE FROM flousi.weeks WHERE user_id = u.id AND week_start = p_week;
  RETURN '{"ok":true}'::jsonb;
END $$;

-- جعل جدول هذا الأسبوع هو الجدول الأساسي للأسابيع القادمة
CREATE FUNCTION public.flousi_week_to_base(p_token TEXT, p_week DATE) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM flousi.weeks WHERE user_id = u.id AND week_start = p_week) THEN
    RETURN '{"ok":true}'::jsonb;  -- الأسبوع نسخة من الأساسي أصلًا
  END IF;
  DELETE FROM flousi.week_items WHERE user_id = u.id AND week_start IS NULL;
  INSERT INTO flousi.week_items (user_id, week_start, day, title, icon, color, start_min, end_min)
  SELECT u.id, NULL, day, title, icon, color, start_min, end_min FROM flousi.week_items WHERE user_id = u.id AND week_start = p_week;
  PERFORM public.flousi_week_reset(p_token, p_week);
  RETURN '{"ok":true}'::jsonb;
END $$;

-- ---------- المواعيد ----------
CREATE FUNCTION public.flousi_appt_save(p_token TEXT, p_id INTEGER, p_date DATE, p_start INTEGER, p_end INTEGER,
  p_title TEXT, p_note TEXT, p_icon TEXT, p_color TEXT, p_done BOOLEAN DEFAULT false)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token); a flousi.appointments;
BEGIN
  p_title := btrim(coalesce(p_title, ''));
  p_note := nullif(btrim(coalesce(p_note, '')), '');
  IF p_title = '' THEN RAISE EXCEPTION 'اكتب الموعد'; END IF;
  IF char_length(p_title) > 80 THEN RAISE EXCEPTION 'الاسم طويل جدًا'; END IF;
  IF char_length(p_note) > 300 THEN RAISE EXCEPTION 'الملاحظة طويلة جدًا'; END IF;
  IF p_date IS NULL OR p_date < '2000-01-01' OR p_date > current_date + 3650 THEN RAISE EXCEPTION 'التاريخ غير صالح'; END IF;
  IF p_start IS NULL OR p_start < 0 OR p_start > 1439 THEN RAISE EXCEPTION 'الوقت غير صالح'; END IF;
  IF p_end IS NOT NULL AND (p_end <= p_start OR p_end > 1440) THEN RAISE EXCEPTION 'وقت النهاية يجب أن يكون بعد البداية'; END IF;
  IF p_id IS NULL THEN
    IF (SELECT count(*) FROM flousi.appointments WHERE user_id = u.id AND date >= current_date) >= 500 THEN RAISE EXCEPTION 'عدد المواعيد كبير'; END IF;
    INSERT INTO flousi.appointments (user_id, date, start_min, end_min, title, note, icon, color, done)
    VALUES (u.id, p_date, p_start, p_end, p_title, p_note, flousi.clean_icon(coalesce(nullif(p_icon, ''), '📌')),
      flousi.clean_color(p_color, '#ef207a'), coalesce(p_done, false))
    RETURNING * INTO a;
  ELSE
    UPDATE flousi.appointments SET date = p_date, start_min = p_start, end_min = p_end, title = p_title, note = p_note,
      icon = flousi.clean_icon(coalesce(nullif(p_icon, ''), '📌')), color = flousi.clean_color(p_color, color), done = coalesce(p_done, done)
    WHERE id = p_id AND user_id = u.id RETURNING * INTO a;
    IF a.id IS NULL THEN RAISE EXCEPTION 'الموعد غير موجود'; END IF;
  END IF;
  RETURN flousi.appt_json(a);
END $$;

CREATE FUNCTION public.flousi_appt_delete(p_token TEXT, p_id INTEGER) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token);
BEGIN
  DELETE FROM flousi.appointments WHERE id = p_id AND user_id = u.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'الموعد غير موجود'; END IF;
  RETURN '{"ok":true}'::jsonb;
END $$;

-- ---------- العادات: الأنواع ----------
CREATE FUNCTION public.flousi_habit_save2(p_token TEXT, p_id INTEGER, p_name TEXT, p_icon TEXT, p_color TEXT, p_days INTEGER,
  p_kind TEXT, p_target INTEGER, p_unit TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token); h flousi.habits;
BEGIN
  p_name := btrim(coalesce(p_name, ''));
  p_unit := nullif(left(btrim(coalesce(p_unit, '')), 20), '');
  IF p_name = '' THEN RAISE EXCEPTION 'اكتب اسم العادة'; END IF;
  IF char_length(p_name) > 50 THEN RAISE EXCEPTION 'الاسم طويل جدًا'; END IF;
  IF p_days IS NULL OR p_days < 1 OR p_days > 127 THEN RAISE EXCEPTION 'اختر يومًا واحدًا على الأقل'; END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('check', 'more', 'less', 'quran') THEN RAISE EXCEPTION 'اختر نوع العادة'; END IF;
  IF p_kind = 'more' AND (p_target IS NULL OR p_target < 1 OR p_target > 1000) THEN RAISE EXCEPTION 'حدّد الهدف (مثلاً 5)'; END IF;
  IF p_kind = 'less' AND p_target IS NOT NULL AND (p_target < 0 OR p_target > 1000) THEN RAISE EXCEPTION 'الحدّ غير صالح'; END IF;
  IF p_kind IN ('check', 'quran') THEN p_target := NULL; END IF;
  IF p_id IS NULL THEN
    IF (SELECT count(*) FROM flousi.habits WHERE user_id = u.id) >= 40 THEN RAISE EXCEPTION 'عدد العادات كبير (40)'; END IF;
    INSERT INTO flousi.habits (user_id, name, icon, color, days, kind, target, unit, sort_order)
    VALUES (u.id, p_name, flousi.clean_icon(p_icon), flousi.clean_color(p_color, '#61038d'), p_days, p_kind, p_target, p_unit,
      (SELECT coalesce(max(sort_order), 0) + 1 FROM flousi.habits WHERE user_id = u.id))
    RETURNING * INTO h;
  ELSE
    UPDATE flousi.habits SET name = p_name, icon = flousi.clean_icon(p_icon), color = flousi.clean_color(p_color, color),
      days = p_days, kind = p_kind, target = p_target, unit = p_unit
    WHERE id = p_id AND user_id = u.id RETURNING * INTO h;
    IF h.id IS NULL THEN RAISE EXCEPTION 'العادة غير موجودة'; END IF;
  END IF;
  RETURN jsonb_build_object('id', h.id, 'name', h.name, 'icon', h.icon, 'color', h.color, 'days', h.days,
    'kind', h.kind, 'target', h.target, 'unit', h.unit, 'created', h.created_at::date::text);
END $$;

-- تسجيل يوم: p_value = العدد (أو 1 لـ نعم)، p_data = تفاصيل (القرآن: من/إلى، الصلوات: أيّها). NULL = حذف التسجيل
CREATE FUNCTION public.flousi_habit_log(p_token TEXT, p_habit_id INTEGER, p_date DATE, p_value NUMERIC, p_data JSONB DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE u flousi.users := flousi.auth(p_token);
BEGIN
  IF NOT EXISTS (SELECT 1 FROM flousi.habits WHERE id = p_habit_id AND user_id = u.id) THEN RAISE EXCEPTION 'العادة غير موجودة'; END IF;
  IF p_date IS NULL OR p_date > current_date + 1 OR p_date < current_date - 400 THEN RAISE EXCEPTION 'التاريخ غير صالح'; END IF;
  IF p_value IS NOT NULL AND (p_value < 0 OR p_value > 100000) THEN RAISE EXCEPTION 'القيمة غير صالحة'; END IF;
  IF p_data IS NOT NULL AND (jsonb_typeof(p_data) <> 'object' OR length(p_data::text) > 500) THEN RAISE EXCEPTION 'معطيات غير صالحة'; END IF;
  IF p_value IS NULL THEN
    DELETE FROM flousi.habit_logs WHERE habit_id = p_habit_id AND date = p_date;
  ELSE
    INSERT INTO flousi.habit_logs (habit_id, date, value, data) VALUES (p_habit_id, p_date, p_value, p_data)
    ON CONFLICT (habit_id, date) DO UPDATE SET value = EXCLUDED.value, data = EXCLUDED.data;
  END IF;
  RETURN '{"ok":true}'::jsonb;
END $$;

-- الصلاحيات: الدوال الجديدة مفتوحة للمفتاح العمومي، والداخلية مغلقة
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig, n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE (n.nspname = 'public' AND p.proname IN ('flousi_life', 'flousi_week_materialize', 'flousi_slot_save', 'flousi_slot_delete',
                   'flousi_week_reset', 'flousi_week_to_base', 'flousi_appt_save', 'flousi_appt_delete', 'flousi_habit_save2', 'flousi_habit_log'))
              OR (n.nspname = 'flousi' AND p.proname IN ('slot_json', 'appt_json', 'check_week')) LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f.sig);
    IF f.nspname = 'public' AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', f.sig);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
    END IF;
  END LOOP;
END $$;
