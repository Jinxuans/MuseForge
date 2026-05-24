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
