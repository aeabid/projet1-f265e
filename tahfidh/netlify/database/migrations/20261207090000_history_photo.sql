-- الصورة الشخصية، ونوع كل مقطع روجع (جيد / يحتاج مراجعة) وقت المراجعة: للسجلّ الشهري والسنوي
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo BYTEA;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_type TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_v INT NOT NULL DEFAULT 0;
ALTER TABLE quran_review_items ADD COLUMN IF NOT EXISTS kind CHAR(1);
