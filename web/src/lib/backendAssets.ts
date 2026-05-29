import { backendRequest, buildQuery } from './backendClient'
import { getAssetCreatedAt, getAssetPublicUrl, getAssetTaskId, type AssetDTO } from './backendAssetDto'
import type { StoredServerAsset } from '../types'
import { blobToDataUrl, fetchImageUrlAsDataUrl, isDataUrl } from './imageApiShared'

const SERVER_ASSET_CACHE_NAME = 'museforge-server-assets-v1'

export { getAssetCreatedAt, getAssetPublicUrl, getAssetTaskId } from './backendAssetDto'

export interface ListAssetsInput {
  cursor?: string
  limit?: number
  projectId?: string
  taskId?: string
  kind?: string
}

export interface ListAssetsResult {
  assets?: AssetDTO[]
  items?: AssetDTO[]
  nextCursor?: string | null
}

export interface ListAssetsPageResult {
  items: AssetDTO[]
  nextCursor: string | null
}

export function backendAssetToStoredServerAsset(asset: AssetDTO, localImageId?: string | null): StoredServerAsset {
  return {
    id: asset.id,
    taskId: getAssetTaskId(asset) ?? null,
    projectId: asset.projectId ?? asset.project_id ?? null,
    taskType: asset.taskType ?? asset.task_type ?? null,
    prompt: asset.prompt ?? null,
    storageKey: asset.storageKey ?? asset.storage_key ?? null,
    publicUrl: getAssetPublicUrl(asset),
    mime: asset.mime,
    width: asset.width ?? null,
    height: asset.height ?? null,
    sizeBytes: asset.sizeBytes ?? asset.size_bytes ?? null,
    sha256: asset.sha256 ?? null,
    kind: asset.kind ?? null,
    visibility: asset.visibility ?? null,
    localImageId: localImageId ?? null,
    createdAt: getAssetCreatedAt(asset),
    syncedAt: Date.now(),
  }
}

function resolveAssetUrl(pathOrUrl: string): URL | null {
  if (!pathOrUrl || typeof window === 'undefined') return null
  try {
    return new URL(pathOrUrl, window.location.origin)
  } catch {
    return null
  }
}

function shouldCacheServerAssetUrl(pathOrUrl: string): boolean {
  const url = resolveAssetUrl(pathOrUrl)
  return Boolean(url && url.origin === window.location.origin && url.pathname.startsWith('/files/'))
}

async function putServerAssetResponseInCache(url: URL, response: Response) {
  if (!('caches' in globalThis)) return
  try {
    const cache = await caches.open(SERVER_ASSET_CACHE_NAME)
    await cache.put(url.href, response.clone())
  } catch {
    // Cache API is an optimization; image sync can continue without it.
  }
}

async function getCachedServerAssetResponse(url: URL) {
  if (!('caches' in globalThis)) return null
  try {
    const cache = await caches.open(SERVER_ASSET_CACHE_NAME)
    return await cache.match(url.href)
  } catch {
    return null
  }
}

export async function deleteCachedServerAsset(pathOrUrl: string) {
  const url = resolveAssetUrl(pathOrUrl)
  if (!url || !('caches' in globalThis)) return false
  try {
    const cache = await caches.open(SERVER_ASSET_CACHE_NAME)
    return await cache.delete(url.href)
  } catch {
    return false
  }
}

export async function clearCachedServerAssets() {
  if (!('caches' in globalThis)) return false
  try {
    return await caches.delete(SERVER_ASSET_CACHE_NAME)
  } catch {
    return false
  }
}

export async function fetchBackendAssetAsDataUrl(asset: AssetDTO): Promise<string> {
  const publicUrl = getAssetPublicUrl(asset)
  const fallbackMime = asset.mime || 'image/png'
  if (!publicUrl) throw new Error('服务端资产缺少访问地址')
  if (isDataUrl(publicUrl)) return publicUrl
  if (!shouldCacheServerAssetUrl(publicUrl)) return fetchImageUrlAsDataUrl(publicUrl, fallbackMime)

  const resolvedUrl = resolveAssetUrl(publicUrl)
  if (!resolvedUrl) return fetchImageUrlAsDataUrl(publicUrl, fallbackMime)

  const cachedResponse = await getCachedServerAssetResponse(resolvedUrl)
  if (cachedResponse?.ok) return blobToDataUrl(await cachedResponse.blob(), cachedResponse.headers.get('content-type') || fallbackMime)

  const response = await fetch(resolvedUrl.href, { cache: 'no-store' })
  if (!response.ok) throw new Error(`图片 URL 下载失败：HTTP ${response.status}`)
  await putServerAssetResponseInCache(resolvedUrl, response)
  return blobToDataUrl(await response.blob(), response.headers.get('content-type') || fallbackMime)
}

export async function listBackendAssetsPage(input: ListAssetsInput = {}): Promise<ListAssetsPageResult> {
  const result = await backendRequest<ListAssetsResult>(`/api/v1/assets${buildQuery({
    cursor: input.cursor,
    limit: input.limit,
    project_id: input.projectId,
    task_id: input.taskId,
    kind: input.kind,
  })}`)
  return {
    items: result.items ?? result.assets ?? [],
    nextCursor: result.nextCursor ?? null,
  }
}

export async function listBackendAssets(input: ListAssetsInput = {}) {
  const result = await listBackendAssetsPage(input)
  return result.items
}

export async function getBackendAsset(id: string) {
  const result = await backendRequest<{ asset?: AssetDTO } | AssetDTO>(`/api/v1/assets/${encodeURIComponent(id)}`)
  return 'asset' in result && result.asset ? result.asset : result as AssetDTO
}

export async function deleteBackendAsset(id: string) {
  return backendRequest<{ deleted: boolean; asset?: AssetDTO }>(`/api/v1/assets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}
