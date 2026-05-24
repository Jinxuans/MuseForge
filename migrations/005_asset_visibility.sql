ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'private';

CREATE INDEX IF NOT EXISTS idx_assets_visibility_created_at
  ON assets(visibility, created_at DESC);
