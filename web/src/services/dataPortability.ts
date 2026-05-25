import type { AgentConversation, AppSettings, CategoryConfig, ExportData, PromptLibraryItem, TaskRecord } from '../types'
import { clearAgentConversations, clearImages, clearServerAssets, clearTasks, getAllImages, getAllServerAssets, getAllTasks, getImageThumbnail, putImage, putImageThumbnail, putServerAsset } from '../lib/db'
import { clearCachedServerAssets } from '../lib/backendAssets'
import { getPersistableAgentConversations, normalizeAgentConversations } from '../store/agentConversationPersistence'
import { cacheImage, cacheThumbnail, clearImageCaches } from '../store/imageCache'
import {
  buildExportServerAssets,
  bytesToDataUrl,
  createExportZipBlob,
  dataUrlToBytes,
  formatExportFileTime,
  readExportZip,
  sanitizeSettingsForExport,
  type ExportZipFiles,
} from '../store/importExportHelpers'

export type ExportOptions = {
  exportConfig?: boolean
  exportTasks?: boolean
}

export type DataExportContext = {
  settings: AppSettings
  agentConversations: AgentConversation[]
  categories: CategoryConfig[]
  promptLibrary: PromptLibraryItem[]
}

export type DataImportOptions = {
  importConfig?: boolean
  importTasks?: boolean
}

export type ClearDataOptions = {
  clearConfig?: boolean
  clearTasks?: boolean
}

export type DataImportResult = {
  data: ExportData
  tasks: TaskRecord[]
  importedAgentConversations: AgentConversation[]
  importedImageIds: string[]
}

export async function createExportDataZip(ctx: DataExportContext, options: ExportOptions = { exportConfig: true, exportTasks: true }) {
  const tasks = options.exportTasks ? await getAllTasks() : []
  const images = options.exportTasks ? await getAllImages() : []
  const exportedAt = Date.now()
  const serverAssets = options.exportTasks ? buildExportServerAssets(tasks, await getAllServerAssets(), exportedAt) : []
  const imageCreatedAtFallback = new Map<string, number>()

  if (options.exportTasks) {
    for (const task of tasks) {
      for (const id of [
        ...(task.inputImageIds || []),
        ...(task.maskImageId ? [task.maskImageId] : []),
        ...(task.outputImages || []),
        ...(task.streamPartialImageIds || []),
      ]) {
        const prev = imageCreatedAtFallback.get(id)
        if (prev == null || task.createdAt < prev) imageCreatedAtFallback.set(id, task.createdAt)
      }
    }
  }

  const imageFiles: ExportData['imageFiles'] = {}
  const thumbnailFiles: NonNullable<ExportData['thumbnailFiles']> = {}
  const zipFiles: ExportZipFiles = {}

  if (options.exportTasks) {
    for (const img of images) {
      const { ext, bytes } = dataUrlToBytes(img.dataUrl)
      const path = `images/${img.id}.${ext}`
      const createdAt = img.createdAt ?? imageCreatedAtFallback.get(img.id) ?? exportedAt
      imageFiles[img.id] = {
        path,
        createdAt,
        source: img.source,
        width: img.width,
        height: img.height,
      }
      zipFiles[path] = [bytes, { mtime: new Date(createdAt) }]

      const thumbnail = await getImageThumbnail(img.id)
      if (thumbnail?.thumbnailDataUrl) {
        const { ext: thumbnailExt, bytes: thumbnailBytes } = dataUrlToBytes(thumbnail.thumbnailDataUrl)
        const thumbnailPath = `thumbnails/${img.id}.${thumbnailExt}`
        imageFiles[img.id].width = imageFiles[img.id].width ?? thumbnail.width
        imageFiles[img.id].height = imageFiles[img.id].height ?? thumbnail.height
        thumbnailFiles[img.id] = {
          path: thumbnailPath,
          width: thumbnail.width,
          height: thumbnail.height,
          thumbnailVersion: thumbnail.thumbnailVersion,
        }
        zipFiles[thumbnailPath] = [thumbnailBytes, { mtime: new Date(createdAt) }]
        cacheThumbnail(img.id, {
          dataUrl: thumbnail.thumbnailDataUrl,
          width: thumbnail.width,
          height: thumbnail.height,
          thumbnailVersion: thumbnail.thumbnailVersion,
        })
      }
    }
  }

  const manifest: ExportData = {
    version: 4,
    exportedAt: new Date(exportedAt).toISOString(),
  }

  if (options.exportConfig) manifest.settings = sanitizeSettingsForExport(ctx.settings)
  if (options.exportConfig || options.exportTasks) {
    manifest.categories = ctx.categories
    manifest.promptLibrary = ctx.promptLibrary
  }
  if (options.exportTasks) {
    manifest.tasks = tasks
    manifest.agentConversations = getPersistableAgentConversations(ctx.agentConversations)
    manifest.imageFiles = imageFiles
    manifest.thumbnailFiles = thumbnailFiles
    manifest.serverAssets = serverAssets
  }

  return {
    blob: createExportZipBlob(manifest, zipFiles, exportedAt),
    fileName: `museforge-backup_${formatExportFileTime(new Date(exportedAt))}.zip`,
  }
}

export async function importDataFromZip(
  file: File,
  options: DataImportOptions = { importConfig: true, importTasks: true },
  putTask: (task: TaskRecord) => Promise<unknown>,
): Promise<DataImportResult> {
  const { data, files: unzipped } = await readExportZip(file)
  const importedImageIds: string[] = []

  if (options.importTasks && data.tasks && data.imageFiles) {
    for (const [id, info] of Object.entries(data.imageFiles)) {
      const bytes = unzipped[info.path]
      if (!bytes) continue
      const dataUrl = bytesToDataUrl(bytes, info.path)
      await putImage({
        id,
        dataUrl,
        createdAt: info.createdAt,
        source: info.source,
        width: info.width,
        height: info.height,
      })
      cacheImage(id, dataUrl)
      importedImageIds.push(id)
    }

    for (const [id, info] of Object.entries(data.thumbnailFiles ?? {})) {
      const bytes = unzipped[info.path]
      if (!bytes) continue
      const thumbnailDataUrl = bytesToDataUrl(bytes, info.path)
      await putImageThumbnail({
        id,
        thumbnailDataUrl,
        width: info.width,
        height: info.height,
        thumbnailVersion: info.thumbnailVersion,
      })
      cacheThumbnail(id, {
        dataUrl: thumbnailDataUrl,
        width: info.width,
        height: info.height,
        thumbnailVersion: info.thumbnailVersion,
      })
    }

    const importedImageIdSet = new Set(importedImageIds)
    for (const asset of data.serverAssets ?? []) {
      await putServerAsset({
        ...asset,
        localImageId: asset.localImageId && importedImageIdSet.has(asset.localImageId) ? asset.localImageId : null,
        syncedAt: Date.now(),
      })
    }

    for (const task of data.tasks) {
      await putTask(task)
    }
  }

  return {
    data,
    tasks: options.importTasks && data.tasks ? await getAllTasks() : [],
    importedAgentConversations: normalizeAgentConversations(data.agentConversations)
      .filter((conversation) => !isEmptyAgentConversation(conversation)),
    importedImageIds,
  }
}

export async function clearLocalDataStorage(options: ClearDataOptions = { clearConfig: true, clearTasks: true }) {
  if (!options.clearTasks) return

  await clearTasks()
  await clearAgentConversations()
  await clearImages()
  await clearServerAssets()
  await clearCachedServerAssets()
  clearImageCaches()
}

function isEmptyAgentConversation(conversation: AgentConversation) {
  return conversation.rounds.length === 0 && conversation.messages.length === 0 && !conversation.activeRoundId
}
