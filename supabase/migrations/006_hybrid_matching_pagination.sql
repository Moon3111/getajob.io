-- Add manual top keywords column to user_profiles
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS manual_top_keywords TEXT[] DEFAULT '{}';

-- Hybrid matching RPC with pagination support
-- Accepts AI keywords from CV and manual user keywords separately
-- Weights manual keywords slightly higher (1.2x multiplier)
-- Returns paginated results with limit and offset
CREATE OR REPLACE FUNCTION match_jobs_hybrid(
  cv_keywords_embeddings vector(1024)[],
  manual_keywords_embeddings vector(1024)[],
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
  RETURN QUERY
  WITH job_scores AS (
    SELECT
      j.id,
      j.source,
      j.title,
      j.company,
      j.url,
      LEFT(j.description, 500) AS description,
      MIN(je.description_vector <=> ANY(cv_keywords_embeddings))::float AS cv_distance,
      CASE
        WHEN array_length(manual_keywords_embeddings, 1) > 0
        THEN MIN(je.description_vector <=> ANY(manual_keywords_embeddings))::float
        ELSE 1.0
      END AS manual_distance,
      (1 - MIN(je.description_vector <=> ANY(cv_keywords_embeddings))::float) AS cv_score,
      CASE
        WHEN array_length(manual_keywords_embeddings, 1) > 0
        THEN (1 - MIN(je.description_vector <=> ANY(manual_keywords_embeddings))::float) * 1.2
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
    GROUP BY j.id, j.source, j.title, j.company, j.url, j.description
  ),
  scored_jobs AS (
    SELECT
      id,
      source,
      title,
      company,
      url,
      description,
      cv_distance,
      CASE
        WHEN array_length(manual_keywords_embeddings, 1) > 0
        THEN (cv_score + manual_score_weighted) / 2.2
        ELSE cv_score
      END AS combined_score
    FROM job_scores
    WHERE cv_distance < (1 - match_threshold)
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

-- Simpler version that accepts pre-computed embeddings directly
-- For cases where frontend pre-computes the embeddings
CREATE OR REPLACE FUNCTION match_jobs_hybrid_single(
  query_embedding vector(1024),
  manual_weight_boost float DEFAULT 1.2,
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
  LIMIT limit_count
  OFFSET offset_count;
$$;
