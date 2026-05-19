-- Username login + sync email on profile
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS user_profiles_username_key
  ON user_profiles (LOWER(username));

-- matches.user_id must reference auth.users (not legacy public.users)
ALTER TABLE matches DROP CONSTRAINT IF EXISTS matches_user_id_fkey;
ALTER TABLE matches
  ADD CONSTRAINT matches_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Allow status: suggested | saved | dismissed | applied
COMMENT ON COLUMN matches.status IS 'suggested, saved, dismissed, or applied';
