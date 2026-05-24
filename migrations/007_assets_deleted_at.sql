ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_assets_deleted_at_created_at
  ON assets(deleted_at, created_at DESC);
