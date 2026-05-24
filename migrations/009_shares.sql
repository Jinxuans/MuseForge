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
