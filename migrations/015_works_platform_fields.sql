ALTER TABLE works
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN cover_asset_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anonymous_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_works_status'
  ) THEN
    ALTER TABLE works
      ADD CONSTRAINT chk_works_status
      CHECK (status IN ('draft', 'published', 'archived', 'deleted'));
  END IF;
END $$;

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
