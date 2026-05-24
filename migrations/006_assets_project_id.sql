ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS project_id TEXT;

CREATE INDEX IF NOT EXISTS idx_assets_project_id_created_at
  ON assets(project_id, created_at DESC);
