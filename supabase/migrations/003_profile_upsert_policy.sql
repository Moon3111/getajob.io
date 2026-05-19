-- Run if profile save fails after sign-in (upsert needs INSERT + UPDATE policies)
DROP POLICY IF EXISTS "Users upsert own profile" ON user_profiles;

CREATE POLICY "Users upsert own profile"
  ON user_profiles FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
