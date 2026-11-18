-- الدرس الجديد: 60 قراءة في الأسبوع دائمًا
ALTER TABLE quran_students ALTER COLUMN lesson_target SET DEFAULT 60;
ALTER TABLE quran_lessons ALTER COLUMN target SET DEFAULT 60;
UPDATE quran_students SET lesson_target = 60 WHERE lesson_target <> 60;
UPDATE quran_lessons SET target = 60 WHERE target <> 60;
