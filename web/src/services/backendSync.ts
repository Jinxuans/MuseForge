import type { AppSettings, TaskRecord } from '../types'
import { getActiveApiProfile } from '../lib/apiProfiles'
import { backendAssetToStoredServerAsset, deleteCachedServerAsset, fetchBackendAssetAsDataUrl, getAssetPublicUrl, listBackendAssetsPage, type ListAssetsInput } from '../lib/backendAssets'
import { backendTaskToTaskRecord, getTaskOutputAssets, listBackendTasksPage, type CreativeTaskDTO } from '../lib/backendTasks'
import { mapServerTaskStatus } from '../lib/backendTaskStatus'
import { deleteServerAsset, getAllServerAssets, putServerAsset, storeImage } from '../lib/db'
import { getBackendCapabilitiesCached, mergeBackendTaskRecord } from '../store/tasks/backendTaskExecution'
import { cacheImage, scheduleThumbnailBackfill } from '../store/images/imageCache'

export type BackendSyncContext = {
  settings: AppSettings
  tasks: TaskRecord[]
  setTasks: (tasks: TaskRecord[]) => void
  putTask: (task: TaskRecord) => Promise<unknown>
  deleteUnreferencedImageIds: (imageIds: Iterable<string>) => Promise<void>
}

export async function syncBackendTasksToStore(ctx: BackendSyncContext) {
  const capabilities = await getBackendCapabilitiesCached()
  if (!capabilities?.asyncTasks) return

  const profile = getActiveApiProfile(ctx.settings)
  let serverTasks: CreativeTaskDTO[] = []
  try {
    let cursor: string | null = null
    do {
      const page = await listBackendTasksPage({ limit: 50, cursor: cursor ?? undefined })
      serverTasks.push(...page.items)
      cursor = page.nextCursor
    } while (cursor)
  } catch {
    return
  }
  if (!serverTasks.length) return

  const existingByServerId = new Map(ctx.tasks.map((task) => [task.serverTaskId ?? task.id, task]))
  const nextById = new Map(ctx.tasks.map((task) => [task.id, task]))

  for (const serverTask of serverTasks) {
    const current = existingByServerId.get(serverTask.id)
    const outputImageIds = await cacheServerTaskOutputImages(serverTask, current?.outputImages ?? [])
    const mapped = backendTaskToTaskRecord(serverTask, { outputImageIds, profile })
    const merged = mergeBackendTaskRecord(current, mapped, outputImageIds)
    nextById.set(merged.id, merged)
  }

  const mergedTasks = Array.from(nextById.values()).sort((a, b) => b.createdAt - a.createdAt)
  ctx.setTasks(mergedTasks)
  await Promise.all(mergedTasks.map((task) => ctx.putTask(task)))
}

async function cacheServerTaskOutputImages(serverTask: CreativeTaskDTO, fallbackIds: string[]) {
  if (mapServerTaskStatus(serverTask.status) !== 'done') return fallbackIds
  const outputIds: string[] = []
  for (const asset of getTaskOutputAssets(serverTask)) {
    const url = getAssetPublicUrl(asset)
    if (!url) continue
    try {
      const dataUrl = await fetchBackendAssetAsDataUrl(asset)
      const imageId = await storeImage(dataUrl, 'generated')
      cacheImage(imageId, dataUrl)
      outputIds.push(imageId)
    } catch {
      // Keep server sync best-effort; task metadata still updates if image caching fails.
    }
  }
  return outputIds.length ? outputIds : fallbackIds
}

export async function syncBackendAssetsToLocalCache(
  ctx: Pick<BackendSyncContext, 'deleteUnreferencedImageIds'>,
  input: ListAssetsInput = { limit: 100 },
) {
  const capabilities = await getBackendCapabilitiesCached()
  if (!capabilities?.assets) {
    await refreshServerAssetMetadataOnly()
    return
  }

  let assets: Awaited<ReturnType<typeof listBackendAssetsPage>>['items'] = []
  try {
    let cursor: string | null = input.cursor ?? null
    do {
      const page = await listBackendAssetsPage({ ...input, cursor: cursor ?? undefined })
      assets.push(...page.items)
      cursor = page.nextCursor
    } while (cursor)
  } catch {
    await refreshServerAssetMetadataOnly()
    return
  }

  const existingAssets = await getAllServerAssets()
  const existingAssetsById = new Map(existingAssets.map((asset) => [asset.id, asset]))
  const remainingIds = new Set(existingAssets.map((asset) => asset.id))
  const cachedIds: string[] = []
  for (const asset of assets) {
    remainingIds.delete(asset.id)
    const publicUrl = getAssetPublicUrl(asset)
    if (!publicUrl) {
      await putServerAsset(backendAssetToStoredServerAsset(asset, null))
      continue
    }
    try {
      const dataUrl = await fetchBackendAssetAsDataUrl(asset)
      const imageId = await storeImage(dataUrl, 'generated')
      cacheImage(imageId, dataUrl)
      cachedIds.push(imageId)
      await putServerAsset(backendAssetToStoredServerAsset(asset, imageId))
    } catch {
      // Asset cache warmup is best-effort; task sync remains the source of visible records.
      await putServerAsset(backendAssetToStoredServerAsset(asset, null))
    }
  }
  const canPruneMissingAssets = !input.cursor && !input.kind && !input.projectId && !input.taskId
  if (canPruneMissingAssets) {
    for (const assetId of remainingIds) {
      const existing = existingAssetsById.get(assetId)
      if (!existing) continue
      await deleteServerAsset(assetId)
      if (existing.publicUrl) await deleteCachedServerAsset(existing.publicUrl)
      if (existing.localImageId) await ctx.deleteUnreferencedImageIds([existing.localImageId])
    }
  }
  if (cachedIds.length) scheduleThumbnailBackfill(cachedIds)
}

async function refreshServerAssetMetadataOnly() {
  const assets = await getAllServerAssets()
  if (!assets.length) return
  const localImageIds = assets.map((asset) => asset.localImageId).filter((id): id is string => Boolean(id))
  if (localImageIds.length) scheduleThumbnailBackfill(localImageIds)
}
