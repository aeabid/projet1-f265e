-- سبر الآراء والتقييمات: استبيان يعدّه المشرف (لمجموعة أو لكل الطلبة) وأجوبة الطلبة
CREATE TABLE IF NOT EXISTS quran_polls (
  id SERIAL PRIMARY KEY,
  group_id INT REFERENCES quran_groups(id) ON DELETE CASCADE, -- NULL = كل الطلبة
  title TEXT NOT NULL,
  description TEXT,
  questions JSONB NOT NULL DEFAULT '[]',
  anonymous BOOLEAN NOT NULL DEFAULT false,
  closed BOOLEAN NOT NULL DEFAULT false,
  created_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ
);
ALTER TABLE quran_polls ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS quran_poll_answers (
  poll_id INT NOT NULL REFERENCES quran_polls(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (poll_id, student_id)
);
ALTER TABLE quran_poll_answers ENABLE ROW LEVEL SECURITY;
