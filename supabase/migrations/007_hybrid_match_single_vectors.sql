-- Fix hybrid match: PostgREST cannot serialize vector(1024)[] from JS number[][].
-- Replace array-of-vectors params with one cv + optional manual embedding.

DROP FUNCTION IF EXISTS match_jobs_hybrid(
  vector(1024)[],
  vector(1024)[],
  float,
  int,
  int,
  uuid
);

CREATE OR REPLACE FUNCTION match_jobs_hybrid(
  cv_embedding vector(1024) DEFAULT NULL,
  manual_embedding vector(1024) DEFAULT NULL,
  match_threshold float DEFAULT 0.62,
  limit_count int DEFAULT 10,
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
  combined_score float
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
      END AS manual_score_weighted
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
      job_scores.cv_distance,
      CASE
        WHEN manual_embedding IS NOT NULL AND cv_embedding IS NOT NULL
        THEN (job_scores.cv_score + job_scores.manual_score_weighted) / 2.2
        WHEN manual_embedding IS NOT NULL
        THEN job_scores.manual_score_weighted / 1.2
        ELSE job_scores.cv_score
      END AS combined_score
    FROM job_scores
    WHERE
      (cv_embedding IS NULL OR job_scores.cv_distance < (1 - match_threshold))
      AND (
        manual_embedding IS NULL
        OR job_scores.manual_distance < (1 - match_threshold)
      )
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
    scored_jobs.combined_score
  FROM scored_jobs
  ORDER BY scored_jobs.combined_score DESC
  LIMIT limit_count
  OFFSET offset_count;
END;
$$;
