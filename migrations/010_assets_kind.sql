ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'output';

CREATE INDEX IF NOT EXISTS idx_assets_kind_created_at
  ON assets(kind, created_at DESC);
