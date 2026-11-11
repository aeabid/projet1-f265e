-- المراجعة يختارها الطالب بنفسه: ما راجعه كل يوم (مقاطع من محفوظه)
CREATE TABLE IF NOT EXISTS quran_review_items (
  student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  seg_id SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, date, seg_id)
);
ALTER TABLE quran_review_items ENABLE ROW LEVEL SECURITY;
-- عدد مرات تكرار ما يحتاج مراجعة في الأسبوع (المحفوظ الجيد: مرة واحدة في الأسبوع)
ALTER TABLE quran_students ADD COLUMN IF NOT EXISTS weak_reps SMALLINT NOT NULL DEFAULT 1;
