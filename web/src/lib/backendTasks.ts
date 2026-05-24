import { DEFAULT_PARAMS, type ApiProfile, type TaskParams, type TaskRecord } from '../types'
import { backendRequest, buildQuery } from './backendClient'
import { getAssetPublicUrl } from './backendAssets'

export type ServerTaskStatus = 'draft' | 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | string
export type ServerTaskType = 'generation' | 'edit' | 'image_generation' | 'image_edit' | 'agent' | 'workflow' | string

export interface ResourceOwnerDTO {
  type?: 'anonymous' | 'user' | string
  id?: string
}

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

export interface CreativeTaskDTO {
  id: string
  type: ServerTaskType
  status: ServerTaskStatus
  prompt: string
  model: string
  provider_profile_id?: string | number | null
  providerProfileId?: string | number | null
  provider_base_url_snapshot?: string
  providerBaseUrlSnapshot?: string
  params_json?: Record<string, unknown>
  params?: Record<string, unknown>
  assets?: AssetDTO[]
  inputAssets?: AssetDTO[]
  outputAssets?: AssetDTO[]
  error?: string | null
  last_error?: string | null
  lastError?: string | null
  attempt_count?: number
  attemptCount?: number
  max_attempts?: number
  maxAttempts?: number
  next_run_at?: string | null
  nextRunAt?: string | null
  created_at?: string
  createdAt?: string
  started_at?: string | null
  startedAt?: string | null
  completed_at?: string | null
  completedAt?: string | null
  projectId?: string | null
  owner?: ResourceOwnerDTO
}

export interface ListTasksInput {
  cursor?: string
  limit?: number
}

export interface ListTasksResult {
  tasks?: CreativeTaskDTO[]
  items?: CreativeTaskDTO[]
  nextCursor?: string | null
}

export interface ListTasksPageResult {
  items: CreativeTaskDTO[]
  nextCursor: string | null
}

export interface CreateGenerationTaskInput {
  model: string
  prompt: string
  params: TaskParams
  upstreamBaseUrl?: string
  apiKey?: string
  providerProfileId?: string | number | null
}

export interface CreateEditTaskInput extends CreateGenerationTaskInput {
  images: Blob[]
  mask?: Blob | null
}

function toServerParams(input: CreateGenerationTaskInput) {
  return {
    model: input.model,
    prompt: input.prompt,
    ...input.params,
    ...(input.upstreamBaseUrl ? { __upstream_base_url: input.upstreamBaseUrl } : {}),
    ...(input.apiKey ? { __api_key: input.apiKey } : {}),
    ...(input.providerProfileId ? { __provider_profile_id: input.providerProfileId } : {}),
  }
}

export function mapServerTaskStatus(status: ServerTaskStatus): TaskRecord['status'] {
  if (status === 'succeeded') return 'done'
  if (status === 'failed' || status === 'canceled') return 'error'
  return 'running'
}

export function serverTaskParams(task: CreativeTaskDTO): Partial<TaskParams> {
  const params = task.params ?? task.params_json ?? {}
  return typeof params === 'object' && params ? params as Partial<TaskParams> : {}
}

export function getTaskOutputAssets(task: CreativeTaskDTO): AssetDTO[] {
  if (Array.isArray(task.outputAssets)) return task.outputAssets
  return Array.isArray(task.assets) ? task.assets : []
}

export function getTaskCreatedAt(task: CreativeTaskDTO): number {
  const value = task.createdAt ?? task.created_at
  const timestamp = value ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) ? timestamp : Date.now()
}

export function getTaskCompletedAt(task: CreativeTaskDTO): number | null {
  const value = task.completedAt ?? task.completed_at
  const timestamp = value ? Date.parse(value) : NaN
  return Number.isFinite(timestamp) ? timestamp : null
}

export function backendTaskToTaskRecord(task: CreativeTaskDTO, options: {
  outputImageIds?: string[]
  profile?: ApiProfile
} = {}): TaskRecord {
  const createdAt = getTaskCreatedAt(task)
  const completedAt = getTaskCompletedAt(task)
  const params = { ...DEFAULT_PARAMS, ...serverTaskParams(task) }
  const outputAssets = getTaskOutputAssets(task)
  return {
    id: task.id,
    serverTaskId: task.id,
    serverTaskStatus: task.status,
    categoryId: null,
    categoryName: null,
    deletedAt: null,
    parentTaskId: null,
    parentImageId: null,
    prompt: task.prompt,
    params,
    apiProvider: options.profile?.provider ?? 'openai',
    apiProfileId: options.profile?.id,
    apiProfileName: options.profile?.name,
    apiMode: options.profile?.apiMode ?? 'images',
    apiModel: task.model,
    inputImageIds: [],
    outputImages: options.outputImageIds ?? [],
    serverOutputAssetIds: outputAssets.map((asset) => asset.id).filter(Boolean),
    rawImageUrls: outputAssets.map(getAssetPublicUrl).filter(Boolean),
    status: mapServerTaskStatus(task.status),
    error: task.error ?? task.lastError ?? task.last_error ?? null,
    lastError: task.lastError ?? task.last_error ?? null,
    attemptCount: task.attemptCount ?? task.attempt_count,
    maxAttempts: task.maxAttempts ?? task.max_attempts,
    createdAt,
    finishedAt: completedAt,
    elapsed: completedAt ? Math.max(0, completedAt - createdAt) : null,
  }
}

export async function listBackendTasksPage(input: ListTasksInput = {}): Promise<ListTasksPageResult> {
  const result = await backendRequest<ListTasksResult>(`/api/v1/tasks${buildQuery({
    cursor: input.cursor,
    limit: input.limit,
  })}`)
  return {
    items: result.items ?? result.tasks ?? [],
    nextCursor: result.nextCursor ?? null,
  }
}

export async function listBackendTasks(input: ListTasksInput = {}) {
  const result = await listBackendTasksPage(input)
  return result.items
}

export async function getBackendTask(id: string) {
  const result = await backendRequest<{ task?: CreativeTaskDTO } | CreativeTaskDTO>(`/api/v1/tasks/${encodeURIComponent(id)}`)
  return 'task' in result && result.task ? result.task : result as CreativeTaskDTO
}

export async function createBackendGenerationTask(input: CreateGenerationTaskInput) {
  const result = await backendRequest<{ task?: CreativeTaskDTO } | CreativeTaskDTO>('/api/v1/tasks/generations', {
    method: 'POST',
    body: toServerParams(input),
  })
  return 'task' in result && result.task ? result.task : result as CreativeTaskDTO
}

export async function createBackendEditTask(input: CreateEditTaskInput) {
  const form = new FormData()
  const params = toServerParams(input)
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue
    form.append(key, String(value))
  }
  input.images.forEach((image, index) => {
    const ext = image.type.split('/')[1] || 'png'
    form.append('image[]', image, `input-${index + 1}.${ext}`)
  })
  if (input.mask) form.append('mask', input.mask, 'mask.png')

  const result = await backendRequest<{ task?: CreativeTaskDTO } | CreativeTaskDTO>('/api/v1/tasks/edits', {
    method: 'POST',
    body: form,
  })
  return 'task' in result && result.task ? result.task : result as CreativeTaskDTO
}

export async function cancelBackendTask(id: string) {
  return backendRequest<{ canceled: boolean }>(`/api/v1/tasks/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
  })
}
