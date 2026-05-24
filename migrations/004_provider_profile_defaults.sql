ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS default_model TEXT,
  ADD COLUMN IF NOT EXISTS api_mode TEXT NOT NULL DEFAULT 'images';
