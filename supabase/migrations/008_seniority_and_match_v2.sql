-- Career level on profiles, seniority on jobs, improved hybrid match with level penalties

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS career_level TEXT DEFAULT 'mid',
  ADD COLUMN IF NOT EXISTS target_seniority TEXT DEFAULT 'mid',
  ADD COLUMN IF NOT EXISTS experience_summary TEXT,
  ADD COLUMN IF NOT EXISTS graduation_year INT,
  ADD COLUMN IF NOT EXISTS cv_embedding vector(1024),
  ADD COLUMN IF NOT EXISTS role_embedding vector(1024);

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS seniority_level TEXT DEFAULT 'mid';

CREATE INDEX IF NOT EXISTS jobs_seniority_level_idx ON jobs (seniority_level);

-- Seniority compatibility multiplier (1.0 = no penalty)
CREATE OR REPLACE FUNCTION seniority_match_multiplier(
  p_career_level text,
  p_job_level text
)
RETURNS float
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_career_level IN ('intern', 'graduate') AND p_job_level IN ('senior', 'lead', 'executive')
      THEN 0.35::float
    WHEN p_career_level IN ('intern', 'graduate', 'junior') AND p_job_level = 'executive'
      THEN 0.3::float
    WHEN p_career_level IN ('intern', 'graduate', 'junior') AND p_job_level = 'senior'
      THEN 0.45::float
    WHEN p_career_level IN ('intern', 'graduate') AND p_job_level = 'lead'
      THEN 0.4::float
    WHEN p_career_level = 'junior' AND p_job_level = 'lead'
      THEN 0.55::float
    WHEN p_career_level IN ('senior', 'lead', 'executive') AND p_job_level IN ('intern', 'graduate')
      THEN 0.65::float
    ELSE 1.0::float
  END;
$$;

CREATE OR REPLACE FUNCTION match_jobs_hybrid_v2(
  cv_embedding vector(1024) DEFAULT NULL,
  manual_embedding vector(1024) DEFAULT NULL,
  p_career_level text DEFAULT 'mid',
  match_threshold float DEFAULT 0.58,
  limit_count int DEFAULT 30,
  offset_count int DEFAULT 0,
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
  match_score float,
  combined_score float,
  seniority_level TEXT
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  IF cv_embedding IS NULL AND manual_embedding IS NULL THEN
    RAISE EXCEPTION 'At least one of cv_embedding or manual_embedding is required';
  END IF;

  RETURN QUERY
  WITH job_scores AS (
    SELECT
      j.id,
      j.source,
      j.title,
      j.company,
      j.url,
      LEFT(j.description, 500) AS description,
      COALESCE(j.seniority_level, 'mid') AS seniority_level,
      CASE
        WHEN cv_embedding IS NOT NULL
        THEN (je.description_vector <=> cv_embedding)::float
        ELSE 1.0
      END AS cv_distance,
      CASE
        WHEN manual_embedding IS NOT NULL
        THEN (je.description_vector <=> manual_embedding)::float
        ELSE 1.0
      END AS manual_distance,
      CASE
        WHEN cv_embedding IS NOT NULL
        THEN (1 - (je.description_vector <=> cv_embedding))::float
        ELSE 0.0
      END AS cv_score,
      CASE
        WHEN manual_embedding IS NOT NULL
        THEN (1 - (je.description_vector <=> manual_embedding))::float * 1.2
        ELSE 0.0
      END AS manual_score_weighted,
      seniority_match_multiplier(
        COALESCE(p_career_level, 'mid'),
        COALESCE(j.seniority_level, 'mid')
      ) AS level_mult
    FROM job_embeddings je
    JOIN jobs j ON j.id = je.job_id
    WHERE (p_user_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM matches m
      WHERE m.user_id = p_user_id
        AND m.job_id = j.id
        AND m.status = 'dismissed'
    ))
    AND (
      (cv_embedding IS NOT NULL AND (je.description_vector <=> cv_embedding) < (1 - match_threshold))
      OR (manual_embedding IS NOT NULL AND (je.description_vector <=> manual_embedding) < (1 - match_threshold))
    )
  ),
  scored_jobs AS (
    SELECT
      job_scores.id,
      job_scores.source,
      job_scores.title,
      job_scores.company,
      job_scores.url,
      job_scores.description,
      job_scores.seniority_level,
      job_scores.cv_distance,
      CASE
        WHEN manual_embedding IS NOT NULL AND cv_embedding IS NOT NULL
        THEN ((job_scores.cv_score + job_scores.manual_score_weighted) / 2.2) * job_scores.level_mult
        WHEN manual_embedding IS NOT NULL
        THEN (job_scores.manual_score_weighted / 1.2) * job_scores.level_mult
        ELSE job_scores.cv_score * job_scores.level_mult
      END AS combined_score
    FROM job_scores
    WHERE
      (cv_embedding IS NULL OR job_scores.cv_distance < (1 - match_threshold))
      AND (
        manual_embedding IS NULL
        OR job_scores.manual_distance < (1 - match_threshold)
      )
      AND job_scores.level_mult >= 0.4
  )
  SELECT
    scored_jobs.id,
    scored_jobs.source,
    scored_jobs.title,
    scored_jobs.company,
    scored_jobs.url,
    scored_jobs.description,
    scored_jobs.cv_distance,
    (1 - scored_jobs.cv_distance)::float AS match_score,
    scored_jobs.combined_score,
    scored_jobs.seniority_level
  FROM scored_jobs
  ORDER BY scored_jobs.combined_score DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$;
