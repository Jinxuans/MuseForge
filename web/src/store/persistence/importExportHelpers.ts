import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate'
import type { AppSettings, ExportData, StoredServerAsset, TaskRecord } from '../../types'
import { normalizeSettings } from '../../lib/apiProfiles'

export type ExportZipFiles = Record<string, Uint8Array | [Uint8Array, { mtime: Date }]>

export function formatExportFileTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
}

export function buildExportServerAssets(tasks: TaskRecord[], serverAssets: StoredServerAsset[], exportedAt: number) {
  const byId = new Map(serverAssets.map((asset) => [asset.id, asset]))
  for (const task of tasks) {
    const assetIds = task.serverOutputAssetIds ?? []
    for (let index = 0; index < assetIds.length; index++) {
      const assetId = assetIds[index]
      if (!assetId || byId.has(assetId)) continue
      byId.set(assetId, {
        id: assetId,
        taskId: task.serverTaskId ?? task.id,
        taskType: task.apiMode ?? null,
        prompt: task.prompt,
        storageKey: null,
        publicUrl: task.rawImageUrls?.[index] ?? '',
        mime: 'image/png',
        width: null,
        height: null,
        sizeBytes: null,
        sha256: null,
        kind: 'output',
        visibility: 'private',
        localImageId: task.outputImages?.[index] ?? null,
        createdAt: task.createdAt,
        syncedAt: exportedAt,
      })
    }
  }
  return Array.from(byId.values())
}

export function sanitizeSettingsForExport(settings: AppSettings): AppSettings {
  return normalizeSettings({
    ...settings,
    apiKey: '',
    profiles: settings.profiles.map((profile) => ({ ...profile, apiKey: '' })),
  })
}

export function dataUrlToBytes(dataUrl: string): { ext: string; bytes: Uint8Array } {
  const match = dataUrl.match(/^data:image\/(\w+);base64,/)
  const ext = match?.[1] ?? 'png'
  const b64 = dataUrl.replace(/^data:[^;]+;base64,/, '')
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return { ext, bytes }
}

export function bytesToDataUrl(bytes: Uint8Array, filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'png'
  const mimeMap: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' }
  const mime = mimeMap[ext] ?? 'image/png'
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return `data:${mime};base64,${btoa(binary)}`
}

export function createExportZipBlob(manifest: ExportData, zipFiles: ExportZipFiles, exportedAt: number): Blob {
  zipFiles['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { mtime: new Date(exportedAt) }]
  const zipped = zipSync(zipFiles, { level: 6 })
  return new Blob([zipped.buffer as ArrayBuffer], { type: 'application/zip' })
}

export async function readExportZip(file: File): Promise<{ data: ExportData; files: Record<string, Uint8Array> }> {
  const buffer = await file.arrayBuffer()
  const files = unzipSync(new Uint8Array(buffer))

  const manifestBytes = files['manifest.json']
  if (!manifestBytes) throw new Error('ZIP 中缺少 manifest.json')

  return {
    data: JSON.parse(strFromU8(manifestBytes)),
    files,
  }
}
