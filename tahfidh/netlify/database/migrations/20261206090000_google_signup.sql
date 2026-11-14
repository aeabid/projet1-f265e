-- الدخول بحساب Google، وطلبات تسجيل الطلبة (يؤكدها المشرف)
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_email TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_idx ON users (google_sub) WHERE google_sub IS NOT NULL;

CREATE TABLE IF NOT EXISTS quran_signups (
  id SERIAL PRIMARY KEY,
  google_sub TEXT NOT NULL UNIQUE,
  google_email TEXT NOT NULL,
  google_name TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT,
  age SMALLINT,
  phone TEXT,
  group_id INT REFERENCES quran_groups(id) ON DELETE SET NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  handled_by INT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE quran_signups ENABLE ROW LEVEL SECURITY;
