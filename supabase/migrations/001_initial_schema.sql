-- Enable pgvector for semantic job matching
CREATE EXTENSION IF NOT EXISTS vector;

-- Users (extend with Supabase Auth later)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  resume_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Structured profile from NVIDIA NIM
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  skills JSONB NOT NULL DEFAULT '{}',
  intent TEXT,
  technical_skills TEXT[] DEFAULT '{}',
  soft_skills TEXT[] DEFAULT '{}',
  years_experience NUMERIC DEFAULT 0,
  ideal_role TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Job listings
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL DEFAULT 'scraper',
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vector embeddings (NV-Embed-QA = 1024 dimensions)
CREATE TABLE job_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE UNIQUE,
  description_vector vector(1024) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX job_embeddings_vector_idx
  ON job_embeddings
  USING ivfflat (description_vector vector_cosine_ops)
  WITH (lists = 100);

-- User ↔ job interactions
CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  score NUMERIC,
  status TEXT NOT NULL DEFAULT 'suggested',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, job_id)
);

-- Semantic search for dashboard (cosine distance <=> )
CREATE OR REPLACE FUNCTION match_jobs(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id UUID,
  source TEXT,
  title TEXT,
  company TEXT,
  url TEXT,
  description TEXT,
  distance float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    j.id,
    j.source,
    j.title,
    j.company,
    j.url,
    j.description,
    (je.description_vector <=> query_embedding)::float AS distance
  FROM job_embeddings je
  JOIN jobs j ON j.id = je.job_id
  WHERE (je.description_vector <=> query_embedding) < (1 - match_threshold)
  ORDER BY je.description_vector <=> query_embedding
  LIMIT match_count;
$$;

-- Deduplication: find near-duplicate jobs before insert
CREATE OR REPLACE FUNCTION find_similar_jobs(
  query_embedding vector(1024),
  match_threshold float DEFAULT 0.95,
  match_count int DEFAULT 1
)
RETURNS TABLE (
  job_id UUID,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    je.job_id,
    (1 - (je.description_vector <=> query_embedding))::float AS similarity
  FROM job_embeddings je
  WHERE (1 - (je.description_vector <=> query_embedding)) >= match_threshold
  ORDER BY je.description_vector <=> query_embedding
  LIMIT match_count;
$$;
