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
