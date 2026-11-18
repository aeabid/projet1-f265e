-- حالة واحدة للمحفوظ: حذف «يحتاج مراجعة»، كل المحفوظ صار «محفوظ»
UPDATE quran_students
SET memorized = COALESCE((SELECT jsonb_object_agg(key, 's') FROM jsonb_each(memorized)), '{}'::jsonb)
WHERE memorized::text LIKE '%"w"%';
UPDATE quran_review_items SET kind = 's' WHERE kind = 'w';
