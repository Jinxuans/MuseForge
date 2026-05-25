export type SquareShareKind = 'image' | 'task' | 'prompt'
export type SquareShareStatus = 'published' | 'pending_review' | 'hidden' | 'deleted' | 'rejected'

export interface SquareShareAssetSummary {
  assetId: string
  clientAssetId?: string | null
  role?: 'output' | 'origin_input' | null
  thumbUrl?: string | null
  originalUrl?: string | null
  width?: number | null
  height?: number | null
}

export interface SquareShareSummary {
  id: string
  kind: SquareShareKind
  title: string
  prompt: string
  coverAsset?: SquareShareAssetSummary | null
  tags: string[]
  status?: SquareShareStatus
  createdAt: number
  viewCount?: number
}

export interface SquareShareDetail extends SquareShareSummary {
  manifest?: unknown
  assets?: SquareShareAssetSummary[]
}

export interface SquareListInput {
  kind: SquareShareKind
  sort?: 'latest'
  q?: string
  cursor?: string
  limit?: number
}

export interface SquareListResult {
  items: SquareShareSummary[]
  nextCursor: string | null
}

export interface SquareMySharesInput {
  q?: string
  cursor?: string
  limit?: number
}

export interface SquareIdentity {
  publisherId: string
  token: string
}

export interface SquarePromptShareTarget {
  kind: 'prompt'
  title?: string
  content: string
}

export interface SquareTaskShareTarget {
  kind: 'task'
  taskId: string
}

export type SquareShareTarget = SquarePromptShareTarget | SquareTaskShareTarget
