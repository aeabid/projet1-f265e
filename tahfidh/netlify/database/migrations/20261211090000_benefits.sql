-- ركن الفوائد: فوائد يكتبها الشيخ لمجموعة (أو لكل الطلبة)، وملاحظات يكتبها الطالب لنفسه
CREATE TABLE IF NOT EXISTS quran_benefits (
  id SERIAL PRIMARY KEY,
  group_id INT REFERENCES quran_groups(id) ON DELETE CASCADE, -- NULL = كل الطلبة
  title TEXT,
  body TEXT NOT NULL,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS quran_benefits_group_idx ON quran_benefits (group_id, created_at DESC);
ALTER TABLE quran_benefits ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS quran_student_notes (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS quran_student_notes_idx ON quran_student_notes (student_id, created_at DESC);
ALTER TABLE quran_student_notes ENABLE ROW LEVEL SECURITY;
