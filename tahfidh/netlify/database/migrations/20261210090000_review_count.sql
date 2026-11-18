-- الورد: يمكن قراءة السورة الواحدة أكثر من مرة في اليوم
ALTER TABLE quran_review_items ADD COLUMN IF NOT EXISTS count SMALLINT NOT NULL DEFAULT 1;
