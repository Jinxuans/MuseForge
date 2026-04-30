ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS anonymous_token_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_provider_profiles_anonymous_token_hash
  ON provider_profiles(anonymous_token_hash)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_anonymous_token_hash_created_at
  ON tasks(anonymous_token_hash, created_at DESC);
