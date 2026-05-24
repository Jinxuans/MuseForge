ALTER TABLE provider_profiles
  ADD COLUMN IF NOT EXISTS provider_config_json JSONB NOT NULL DEFAULT '{}'::jsonb;
