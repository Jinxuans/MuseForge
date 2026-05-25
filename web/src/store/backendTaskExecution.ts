import type { ApiProfile, TaskRecord } from '../types'
import { getBackendCapabilities } from '../lib/backendCapabilities'
import { getTaskOutputAssets, mapServerTaskStatus, serverTaskParams, type CreativeTaskDTO } from '../lib/backendTasks'
import { getAssetPublicUrl } from '../lib/backendAssets'

export const SERVER_TASK_CANCELED_MESSAGE = '任务已取消。'

let backendCapabilitiesPromise: Promise<Awaited<ReturnType<typeof getBackendCapabilities>> | null> | null = null

export async function getBackendCapabilitiesCached() {
  if (!backendCapabilitiesPromise) {
    backendCapabilitiesPromise = getBackendCapabilities().catch(() => {
      backendCapabilitiesPromise = null
      return null
    })
  }
  return backendCapabilitiesPromise
}

export function shouldUseBackendTaskExecution(
  profile: ApiProfile,
  task: TaskRecord,
  capabilities: { asyncTasks?: boolean } | null,
) {
  if (!capabilities?.asyncTasks) return false
  if (task.apiProvider !== 'openai') return false
  if (profile.apiMode !== 'images') return false
  return true
}

export function canCancelQueuedServerTask(task: TaskRecord) {
  return Boolean(task.serverTaskId && task.status === 'running' && task.serverTaskStatus === 'queued')
}

export function getServerTaskErrorMessage(serverTask: CreativeTaskDTO) {
  if (serverTask.status === 'canceled') return SERVER_TASK_CANCELED_MESSAGE
  return serverTask.error ?? serverTask.lastError ?? serverTask.last_error ?? null
}

export function getTaskExecutionErrorMessage(err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  if (/provider profile not found/i.test(message)) {
    return '服务端渠道配置不存在或已删除，请在设置中重新保存 API 配置。'
  }
  return message
}

export function getServerTaskStatusPatch(serverTask: CreativeTaskDTO): Partial<TaskRecord> {
  const serverStatus = mapServerTaskStatus(serverTask.status)
  return {
    serverTaskId: serverTask.id,
    serverTaskStatus: serverTask.status,
    status: serverStatus,
    error: serverStatus === 'done' ? null : getServerTaskErrorMessage(serverTask),
    lastError: serverTask.lastError ?? serverTask.last_error ?? null,
    attemptCount: serverTask.attemptCount ?? serverTask.attempt_count ?? undefined,
    maxAttempts: serverTask.maxAttempts ?? serverTask.max_attempts ?? undefined,
  }
}

export function mergeBackendTaskRecord(current: TaskRecord | undefined, mapped: TaskRecord, outputImageIds: string[]) {
  if (!current) return mapped
  return {
    ...current,
    ...mapped,
    id: current.id,
    categoryId: current.categoryId,
    categoryName: current.categoryName,
    deletedAt: current.deletedAt,
    parentTaskId: current.parentTaskId,
    parentImageId: current.parentImageId,
    inputImageIds: current.inputImageIds,
    maskTargetImageId: current.maskTargetImageId,
    maskImageId: current.maskImageId,
    outputImages: outputImageIds.length ? outputImageIds : current.outputImages,
  }
}

export function createBackendTaskOutputBasePatch(serverTask: CreativeTaskDTO, task: TaskRecord): Partial<TaskRecord> {
  const outputAssets = getTaskOutputAssets(serverTask)
  const serverOutputAssetIds = outputAssets.map((asset) => asset.id).filter(Boolean)
  const rawImageUrls = outputAssets.map(getAssetPublicUrl).filter(Boolean)
  const actualParams = serverTaskParams(serverTask)
  const serverStatus = mapServerTaskStatus(serverTask.status)
  return {
    serverTaskId: serverTask.id,
    serverTaskStatus: serverTask.status,
    serverOutputAssetIds,
    rawImageUrls: rawImageUrls.length ? rawImageUrls : undefined,
    status: serverStatus,
    error: serverStatus === 'done' ? null : getServerTaskErrorMessage(serverTask),
    lastError: serverTask.lastError ?? serverTask.last_error ?? null,
    actualParams,
    finishedAt: serverStatus === 'done' ? Date.now() : task.finishedAt ?? null,
    elapsed: serverStatus === 'done' ? Date.now() - task.createdAt : task.elapsed,
    streamPartialImageIds: undefined,
  }
}

export function createBackendTaskOutputImagesPatch(outputIds: string[], actualParams: Partial<TaskRecord['params']>, revisedPromptByImage: Record<string, string>): Partial<TaskRecord> | null {
  if (!outputIds.length) return null
  return {
    outputImages: outputIds,
    actualParamsByImage: outputIds.reduce<Record<string, Partial<TaskRecord['params']>>>((acc, imgId) => {
      acc[imgId] = actualParams
      return acc
    }, {}),
    revisedPromptByImage: Object.keys(revisedPromptByImage).length > 0 ? revisedPromptByImage : undefined,
  }
}
