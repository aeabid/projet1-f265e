-- ===== التحديات: عادات يومية مع ترتيب =====
-- audience: students = تلاميذ دروس الدعم (يسجّلها الولي) / team = الإطار (المعلمون والإدارة لأنفسهم)
CREATE TABLE challenges (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  audience TEXT NOT NULL DEFAULT 'students' CHECK (audience IN ('students', 'team')),
  start_date DATE NOT NULL,
  end_date DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- يوم منجز = سطر واحد، للتلميذ أو لعضو الإطار
CREATE TABLE challenge_logs (
  id SERIAL PRIMARY KEY,
  challenge_id INTEGER NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((student_id IS NULL) <> (user_id IS NULL))
);
CREATE UNIQUE INDEX challenge_logs_student_key ON challenge_logs (challenge_id, student_id, date) WHERE student_id IS NOT NULL;
CREATE UNIQUE INDEX challenge_logs_user_key ON challenge_logs (challenge_id, user_id, date) WHERE user_id IS NOT NULL;
