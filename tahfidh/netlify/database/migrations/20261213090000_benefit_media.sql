-- الفوائد: صور وروابط يوتيوب
ALTER TABLE quran_benefits ADD COLUMN IF NOT EXISTS youtube JSONB NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS quran_benefit_images (
  id SERIAL PRIMARY KEY,
  benefit_id INT NOT NULL REFERENCES quran_benefits(id) ON DELETE CASCADE,
  data BYTEA NOT NULL,
  type TEXT NOT NULL,
  position SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS quran_benefit_images_idx ON quran_benefit_images (benefit_id, position);
ALTER TABLE quran_benefit_images ENABLE ROW LEVEL SECURITY;
