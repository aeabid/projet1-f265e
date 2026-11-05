-- فلوسي: المداخيل والمصاريف الشخصية لحسابات الإدارة
-- الأنواع مشتركة وتديرها الإدارة؛ العمليات خاصة بكل حساب
CREATE TABLE flousi_categories (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🏷️',
  color TEXT NOT NULL DEFAULT '#61038d',
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX flousi_categories_name_key ON flousi_categories (type, lower(name)) WHERE NOT archived;

CREATE TABLE flousi_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount NUMERIC(12, 3) NOT NULL CHECK (amount > 0),
  category_id INTEGER NOT NULL REFERENCES flousi_categories(id),
  date DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX flousi_transactions_user_date ON flousi_transactions (user_id, date);

INSERT INTO flousi_categories (type, name, icon, color, sort_order) VALUES
  ('expense', 'أكل ومشتريات', '🛒', '#61038d', 1),
  ('expense', 'نقل وبنزين', '🚗', '#20149a', 2),
  ('expense', 'سكن وكراء', '🏠', '#ef207a', 3),
  ('expense', 'فواتير', '💡', '#f59e0b', 4),
  ('expense', 'صحة', '💊', '#10b981', 5),
  ('expense', 'تعليم', '📚', '#6fb6ff', 6),
  ('expense', 'ملابس', '👕', '#a855f7', 7),
  ('expense', 'عائلة وأولاد', '👨‍👩‍👧', '#f97316', 8),
  ('expense', 'خرجات وترفيه', '☕', '#e11d48', 9),
  ('expense', 'هاتف وأنترنت', '📱', '#0ea5e9', 10),
  ('expense', 'ديون وأقساط', '💳', '#64748b', 11),
  ('expense', 'أخرى', '📦', '#94a3b8', 99),
  ('income', 'أجرة', '💼', '#61038d', 1),
  ('income', 'مشروع / تجارة', '🏪', '#20149a', 2),
  ('income', 'عمل إضافي', '🛠️', '#ef207a', 3),
  ('income', 'هدية / منحة', '🎁', '#10b981', 4),
  ('income', 'استرجاع دين', '🤝', '#6fb6ff', 5),
  ('income', 'أخرى', '💰', '#94a3b8', 99);

ALTER TABLE flousi_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE flousi_transactions ENABLE ROW LEVEL SECURITY;
