CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT,
  username TEXT,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_plaintext TEXT,
  api_key_hint TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  anonymous_token_hash TEXT,
  provider_profile_id BIGINT REFERENCES provider_profiles(id) ON DELETE SET NULL,
  provider_base_url_snapshot TEXT NOT NULL,
  provider_api_key_plaintext TEXT,
  type TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt TEXT NOT NULL,
  params_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL,
  error TEXT,
  cost_estimate NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_created_at ON tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assets_task_id ON assets(task_id);
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at DESC);

CREATE TABLE IF NOT EXISTS works (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cover_asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private',
  prompt_visible BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS usage_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  amount NUMERIC,
  raw_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
