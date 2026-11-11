-- فضاء التحفيظ: الشيخ يتابع حفظ ومراجعة طلبته للقرآن
-- دوران جديدان: شيخ (sheikh) وطالب تحفيظ (talib)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'teacher', 'parent', 'sheikh', 'talib'));

-- المجموعات (الحلقات): ينشئها الشيخ، حسب المستوى، مع يوم اللقاء
CREATE TABLE IF NOT EXISTS quran_groups (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  level TEXT,
  sheikh_id INT REFERENCES users(id) ON DELETE SET NULL,
  meet_day SMALLINT NOT NULL DEFAULT 6 CHECK (meet_day BETWEEN 0 AND 6),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE quran_groups ENABLE ROW LEVEL SECURITY;

-- ملف الطالب: المحفوظ (جيد / يحتاج مراجعة) ونسق المراجعة
CREATE TABLE IF NOT EXISTS quran_students (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  age SMALLINT,
  level TEXT,
  group_id INT REFERENCES quran_groups(id) ON DELETE SET NULL,
  sheikh_id INT REFERENCES users(id) ON DELETE SET NULL,
  week_start SMALLINT NOT NULL DEFAULT 6 CHECK (week_start BETWEEN 0 AND 6),
  solid_days SMALLINT NOT NULL DEFAULT 7 CHECK (solid_days BETWEEN 1 AND 60),
  weak_days SMALLINT NOT NULL DEFAULT 7 CHECK (weak_days BETWEEN 1 AND 60),
  lesson_target INT NOT NULL DEFAULT 70,
  memorized JSONB NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quran_students_group_idx ON quran_students (group_id);
ALTER TABLE quran_students ENABLE ROW LEVEL SECURITY;

-- الدرس الجديد (اللوح): ثمن أو ثمنان، يُقرأ 70 مرة في الأسبوع
CREATE TABLE IF NOT EXISTS quran_lessons (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_on DATE NOT NULL,
  content TEXT NOT NULL,
  athman NUMERIC(4,1) NOT NULL DEFAULT 1,
  target INT NOT NULL DEFAULT 70,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS quran_lessons_student_idx ON quran_lessons (student_id, assigned_on DESC);
ALTER TABLE quran_lessons ENABLE ROW LEVEL SECURITY;

-- عدّاد القراءات: عدد كل يوم
CREATE TABLE IF NOT EXISTS quran_lesson_reps (
  lesson_id INT NOT NULL REFERENCES quran_lessons(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  count INT NOT NULL DEFAULT 0 CHECK (count >= 0),
  PRIMARY KEY (lesson_id, date)
);
ALTER TABLE quran_lesson_reps ENABLE ROW LEVEL SECURITY;

-- المراجعة اليومية: حصة المحفوظ الجيد (solid) وحصة ما يحتاج تثبيتًا (weak)
CREATE TABLE IF NOT EXISTS quran_review_log (
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('solid', 'weak')),
  label TEXT,
  size NUMERIC(6,2),
  done_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, date, kind)
);
ALTER TABLE quran_review_log ENABLE ROW LEVEL SECURITY;

-- اللقاء مع الشيخ: الحضور، تقييم المراجعة، تقييم تسميع الدرس، ملاحظة يراها الطالب
CREATE TABLE IF NOT EXISTS quran_meetings (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  attendance TEXT NOT NULL DEFAULT 'present' CHECK (attendance IN ('present', 'absent', 'excused')),
  review_eval TEXT,
  hifz_eval TEXT,
  ada_eval TEXT,
  tajweed_eval TEXT,
  lesson_id INT REFERENCES quran_lessons(id) ON DELETE SET NULL,
  note TEXT,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, date)
);
ALTER TABLE quran_meetings ENABLE ROW LEVEL SECURITY;
