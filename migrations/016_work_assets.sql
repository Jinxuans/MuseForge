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
