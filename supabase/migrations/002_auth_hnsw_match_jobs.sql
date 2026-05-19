-- Link profiles to Supabase Auth users (not legacy public.users)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_user_id_fkey;
ALTER TABLE user_profiles
  ADD CONSTRAINT user_profiles_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS resume_text TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- One profile per auth user
CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_user_id_key ON user_profiles (user_id);

-- HNSW index (run after you have some rows; safe on empty table too)
DROP INDEX IF EXISTS job_embeddings_vector_idx;
CREATE INDEX IF NOT EXISTS job_embeddings_hnsw_idx
  ON job_embeddings
  USING hnsw (description_vector vector_cosine_ops);

-- Slimmer, faster match_jobs with auth-aware dismissal filter
CREATE OR REPLACE FUNCTION match_jobs(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.75,
  match_count int DEFAULT 20,
  p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  source TEXT,
  title TEXT,
  company TEXT,
  url TEXT,
  description TEXT,
  distance float,
  match_score float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    j.id,
    j.source,
    j.title,
    j.company,
    j.url,
    LEFT(j.description, 500) AS description,
    (je.description_vector <=> query_embedding)::float AS distance,
    (1 - (je.description_vector <=> query_embedding))::float AS match_score
  FROM job_embeddings je
  JOIN jobs j ON j.id = je.job_id
  WHERE (je.description_vector <=> query_embedding) < (1 - match_threshold)
    AND (
      p_user_id IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE m.user_id = p_user_id
          AND m.job_id = j.id
          AND m.status = 'dismissed'
      )
    )
  ORDER BY je.description_vector <=> query_embedding
  LIMIT match_count;
$$;

-- RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON user_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users upsert own profile"
  ON user_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own profile"
  ON user_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users read own matches"
  ON matches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own matches"
  ON matches FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own matches"
  ON matches FOR UPDATE
  USING (auth.uid() = user_id);
