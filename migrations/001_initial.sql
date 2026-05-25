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
  anonymous_token_hash TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  base_url TEXT NOT NULL,
  api_key_plaintext TEXT,
  api_key_hint TEXT,
  default_model TEXT,
  api_mode TEXT NOT NULL DEFAULT 'images',
  provider_config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_provider_profiles_anonymous_token_hash
  ON provider_profiles(anonymous_token_hash)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS anonymous_identities (
  id BIGSERIAL PRIMARY KEY,
  anonymous_token_hash TEXT NOT NULL UNIQUE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_anonymous_identities_user_id
  ON anonymous_identities(user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  anonymous_identity_id BIGINT REFERENCES anonymous_identities(id) ON DELETE SET NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash_active
  ON sessions(token_hash)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_user_id_created_at
  ON sessions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  anonymous_token_hash TEXT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_projects_visibility
    CHECK (visibility IN ('private', 'unlisted', 'public')),
  CONSTRAINT chk_projects_owner
    CHECK (user_id IS NOT NULL OR anonymous_token_hash IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_projects_user_id_created_at
  ON projects(user_id, created_at DESC)
  WHERE user_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_anonymous_token_hash_created_at
  ON projects(anonymous_token_hash, created_at DESC)
  WHERE anonymous_token_hash IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_visibility_created_at
  ON projects(visibility, created_at DESC)
  WHERE archived_at IS NULL;

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
  attempt_count INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tasks_status_created_at ON tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_queue_next_run_at ON tasks(status, next_run_at, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_anonymous_token_hash_created_at
  ON tasks(anonymous_token_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_project_id_created_at
  ON tasks(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS assets (
  id UUID PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  project_id TEXT,
  kind TEXT NOT NULL DEFAULT 'output',
  storage_key TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assets_task_id ON assets(task_id);
CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_visibility_created_at
  ON assets(visibility, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_project_id_created_at
  ON assets(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_deleted_at_created_at
  ON assets(deleted_at, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_assets_kind_created_at
  ON assets(kind, created_at DESC);

CREATE TABLE IF NOT EXISTS works (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
  cover_asset_id UUID REFERENCES assets(id) ON DELETE RESTRICT,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  anonymous_token_hash TEXT,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility TEXT NOT NULL DEFAULT 'private',
  prompt_visible BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  CONSTRAINT chk_works_status
    CHECK (status IN ('draft', 'published', 'archived', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_works_project_id_updated_at
  ON works(project_id, updated_at DESC)
  WHERE project_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_works_user_id_updated_at
  ON works(user_id, updated_at DESC)
  WHERE user_id IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_works_anonymous_token_hash_updated_at
  ON works(anonymous_token_hash, updated_at DESC)
  WHERE anonymous_token_hash IS NOT NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_works_status_updated_at
  ON works(status, updated_at DESC)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS shares (
  id UUID PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  anonymous_token_hash TEXT,
  claimed_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  prompt TEXT NOT NULL DEFAULT '',
  manifest_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'published',
  review_status TEXT NOT NULL DEFAULT 'none',
  report_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_shares_status
    CHECK (status IN ('published', 'pending_review', 'hidden', 'deleted', 'rejected')),
  CONSTRAINT chk_shares_review_status
    CHECK (review_status IN ('none', 'pending', 'approved', 'rejected')),
  CONSTRAINT chk_shares_owner
    CHECK (user_id IS NOT NULL OR anonymous_token_hash IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_shares_status_created_at
  ON shares(status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_shares_user_id_created_at
  ON shares(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shares_anonymous_token_hash_created_at
  ON shares(anonymous_token_hash, created_at DESC)
  WHERE anonymous_token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_shares_claimed_by_user_id
  ON shares(claimed_by_user_id)
  WHERE claimed_by_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS share_assets (
  id UUID PRIMARY KEY,
  share_id UUID NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
  source_asset_id UUID REFERENCES assets(id) ON DELETE SET NULL,
  storage_key TEXT NOT NULL,
  public_url TEXT NOT NULL,
  mime TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  size_bytes BIGINT NOT NULL,
  sha256 TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'image',
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_assets_share_id_sort_order
  ON share_assets(share_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_share_assets_source_asset_id
  ON share_assets(source_asset_id)
  WHERE source_asset_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  anonymous_token_hash TEXT,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_workflow_runs_owner
    CHECK (user_id IS NOT NULL OR anonymous_token_hash IS NOT NULL),
  CONSTRAINT chk_workflow_runs_status
    CHECK (status IN ('draft', 'queued', 'running', 'succeeded', 'failed', 'canceled'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_project_id_created_at
  ON workflow_runs(project_id, created_at DESC)
  WHERE project_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_id_created_at
  ON workflow_runs(user_id, created_at DESC)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_runs_anonymous_token_hash_created_at
  ON workflow_runs(anonymous_token_hash, created_at DESC)
  WHERE anonymous_token_hash IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_runs_status_created_at
  ON workflow_runs(status, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS workflow_steps (
  id UUID PRIMARY KEY,
  workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  step_key TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sort_order INTEGER NOT NULL DEFAULT 0,
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT chk_workflow_steps_status
    CHECK (status IN ('pending', 'queued', 'running', 'succeeded', 'failed', 'skipped', 'canceled')),
  CONSTRAINT uq_workflow_steps_run_step_key
    UNIQUE (workflow_run_id, step_key)
);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_run_sort_order
  ON workflow_steps(workflow_run_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_workflow_steps_task_id
  ON workflow_steps(task_id)
  WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_workflow_steps_status_created_at
  ON workflow_steps(status, created_at);

CREATE TABLE IF NOT EXISTS work_assets (
  id UUID PRIMARY KEY,
  work_id BIGINT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  role TEXT NOT NULL DEFAULT 'output',
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_work_assets_role
    CHECK (role IN ('cover', 'output', 'input', 'reference', 'mask', 'thumbnail', 'variant'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_work_assets_work_id_asset_id_role
  ON work_assets(work_id, asset_id, role);

CREATE INDEX IF NOT EXISTS idx_work_assets_work_id_sort_order
  ON work_assets(work_id, sort_order, created_at);

CREATE INDEX IF NOT EXISTS idx_work_assets_asset_id
  ON work_assets(asset_id);

CREATE INDEX IF NOT EXISTS idx_work_assets_task_id
  ON work_assets(task_id)
  WHERE task_id IS NOT NULL;

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
