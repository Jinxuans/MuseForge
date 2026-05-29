import type { TaskRecord } from '../types'
import { backendAssetToStoredServerAsset } from '../lib/backendAssets'

export type TaskExecutionContext = {
  ensureImageCached: (id: string) => Promise<string | null | undefined>
  storeGeneratedImage: (dataUrl: string) => Promise<string>
  putServerAsset: (asset: ReturnType<typeof backendAssetToStoredServerAsset>) => Promise<unknown>
  putTask: (task: TaskRecord) => Promise<unknown>
  prependTask: (task: TaskRecord) => void
  updateTask: (taskId: string, patch: Partial<TaskRecord>) => void
  getTask: (taskId: string) => TaskRecord | undefined
  getTaskByToolCallId: (toolCallId: string) => TaskRecord | undefined
  setTaskStreamPreview: (taskId: string, image?: string, requestIndex?: number) => void
  persistTaskStreamPartialImage: (taskId: string, dataUrl: string) => Promise<unknown> | unknown
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void
}
