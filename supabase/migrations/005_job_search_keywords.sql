-- User-defined job search keywords (paired with resume for live scraping)
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS job_search_keywords TEXT,
  ADD COLUMN IF NOT EXISTS last_scrape_at TIMESTAMPTZ;
