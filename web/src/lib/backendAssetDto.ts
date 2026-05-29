export interface AssetDTO {
  id: string
  task_id?: string
  taskId?: string
  project_id?: string | null
  projectId?: string | null
  task_type?: string
  taskType?: string
  prompt?: string
  storage_key?: string
  storageKey?: string
  public_url?: string
  publicUrl?: string
  thumbnailUrl?: string | null
  mime: string
  width?: number | null
  height?: number | null
  size_bytes?: number
  sizeBytes?: number
  sha256?: string
  kind?: 'input' | 'output' | 'mask' | 'reference' | 'thumbnail' | string
  visibility?: 'private' | 'unlisted' | 'public' | string
  metadata?: Record<string, unknown>
  created_at?: string
  createdAt?: string
}

export function getAssetPublicUrl(asset: AssetDTO): string {
  return asset.publicUrl ?? asset.public_url ?? ''
}

export function getAssetTaskId(asset: AssetDTO): string | undefined {
  return asset.taskId ?? asset.task_id
}

export function getAssetCreatedAt(asset: AssetDTO): number {
  const value = asset.createdAt ?? asset.created_at
  const timestamp = value ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}
