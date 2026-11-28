-- ملفات الفوائد: الشيخ ينظّم الفوائد في ملفات حسب المواضيع
CREATE TABLE IF NOT EXISTS quran_benefit_folders (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📁',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE quran_benefit_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE quran_benefits ADD COLUMN IF NOT EXISTS folder_id INT REFERENCES quran_benefit_folders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS quran_benefits_folder_idx ON quran_benefits (folder_id);
