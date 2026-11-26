-- تفاعل الطلبة مع فوائد الشيخ (تفاعل واحد لكل مستخدم على كل فائدة)
CREATE TABLE IF NOT EXISTS quran_benefit_reactions (
  benefit_id INT NOT NULL REFERENCES quran_benefits(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (benefit_id, user_id)
);
ALTER TABLE quran_benefit_reactions ENABLE ROW LEVEL SECURITY;
