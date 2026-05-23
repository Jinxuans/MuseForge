import type { PromptLibraryItem, TaskParams, TaskRecord } from '../types'
import { getImage } from './db'
import type { SquareCreateShareAssetInput, SquareCreateShareInput } from './squareApiClient'

const MAX_TAG_COUNT = 8
const MAX_TAG_LENGTH = 24
const MAX_TITLE_LENGTH = 80
const MAX_PROMPT_LENGTH = 8000
const MAX_TASK_LINEAGE_ITEMS = 12
const MAX_ASSET_COUNT = 24
const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const MAX_THUMB_BYTES = 512 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp'])

type SquareAssetRole = 'output' | 'origin_input'

export interface BuildTaskShareOptions {
  task: TaskRecord
  tasks: TaskRecord[]
  title: string
  tags: string[]
}

export interface BuildPromptShareOptions {
  item?: PromptLibraryItem
  title: string
  content: string
  tags: string[]
}

interface ManifestAsset {
  clientAssetId: string
  role: SquareAssetRole
  localImageId: string
  mimeType: string
  width: number | null
  height: number | null
  byteSize: number
  standaloneShareAllowed: boolean
}

interface ManifestTaskNode {
  localTaskId: string
  status: TaskRecord['status']
  parentTaskId: string | null
  parentImageId: string | null
  prompt: string
  params: TaskParams
  providerName: string | null
  categoryName: string | null
  createdAt: number
  finishedAt: number | null
  elapsed: number | null
  inputAssetRefs: string[]
  outputAssetRefs: string[]
}

function normalizeTitle(value: string, fallback: string) {
  const normalized = value.trim() || fallback.trim() || '未命名分享'
  return normalized.slice(0, MAX_TITLE_LENGTH)
}

function normalizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim().slice(0, MAX_TAG_LENGTH)).filter(Boolean))).slice(0, MAX_TAG_COUNT)
}

function createClientRequestId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
}

function sanitizeAssetKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'asset'
}

function createClientAssetId(localImageId: string, role: SquareAssetRole, index: number) {
  return `asset_${role}_${index}_${sanitizeAssetKey(localImageId)}`
}

function ensureTaskCanBeShared(task: TaskRecord) {
  if (task.deletedAt) throw new Error('回收站中的任务不能分享到广场')
  if (task.status !== 'done') throw new Error('只有成功完成的图任务可以分享到广场')
  if (!task.outputImages.length) throw new Error('任务没有可分享的生成输出图')
  if (task.prompt.trim().length > MAX_PROMPT_LENGTH) throw new Error(`提示词不能超过 ${MAX_PROMPT_LENGTH} 字符`)
}

function resolveLineageTasks(entryTask: TaskRecord, tasks: TaskRecord[]) {
  const lineage: TaskRecord[] = []
  const seen = new Set<string>([entryTask.id])
  let cursorId = entryTask.parentTaskId ?? null
  while (cursorId) {
    if (seen.has(cursorId)) throw new Error('任务链存在循环，无法分享到广场')
    const parent = tasks.find((item) => item.id === cursorId)
    if (!parent) throw new Error('任务链不完整，无法分享到广场')
    seen.add(parent.id)
    lineage.push(parent)
    cursorId = parent.parentTaskId ?? null
    if (lineage.length + 1 > MAX_TASK_LINEAGE_ITEMS) throw new Error(`任务链超过 ${MAX_TASK_LINEAGE_ITEMS} 个节点，暂不支持分享`)
  }
  return [entryTask, ...lineage].reverse()
}

function collectOutputImageIds(entryTask: TaskRecord, lineageTasks: TaskRecord[]) {
  return Array.from(new Set([...(entryTask.outputImages ?? []), ...lineageTasks.flatMap((task) => task.outputImages ?? [])]))
}

function collectOriginInputImageIds(entryTask: TaskRecord, lineageTasks: TaskRecord[], outputImageIds: string[]) {
  const originIds = new Set<string>()
  const outputIds = new Set(outputImageIds)
  for (const task of [entryTask, ...lineageTasks]) {
    for (const imageId of task.inputImageIds ?? []) {
      if (!outputIds.has(imageId)) originIds.add(imageId)
    }
    if (task.maskTargetImageId && !outputIds.has(task.maskTargetImageId)) originIds.add(task.maskTargetImageId)
  }
  return Array.from(originIds)
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl)
  if (!response.ok) throw new Error(`读取图片失败：HTTP ${response.status}`)
  return response.blob()
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('读取图片尺寸失败'))
    image.src = src
  })
}

async function buildThumbnail(dataUrl: string) {
  const image = await loadImage(dataUrl)
  const scale = Math.min(1, 512 / Math.max(image.naturalWidth || 1, image.naturalHeight || 1))
  const width = Math.max(1, Math.round((image.naturalWidth || 1) * scale))
  const height = Math.max(1, Math.round((image.naturalHeight || 1) * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('当前浏览器不支持生成缩略图')
  ctx.drawImage(image, 0, 0, width, height)
  const thumbnail = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('生成缩略图失败')), 'image/webp', 0.76)
  })
  return { thumbnail, width, height }
}

function assertImageBlobAllowed(blob: Blob, mimeType: string) {
  const type = (mimeType || blob.type || 'image/png').toLowerCase()
  if (!ALLOWED_IMAGE_TYPES.has(type)) throw new Error('广场暂只支持 PNG、JPG、JPEG、WebP 图片')
  if (blob.size > MAX_IMAGE_BYTES) throw new Error(`单张图片不能超过 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB`)
}

async function buildUploadAsset(localImageId: string, role: SquareAssetRole, index: number): Promise<{ manifestAsset: ManifestAsset; uploadAsset: SquareCreateShareAssetInput }> {
  const record = await getImage(localImageId)
  if (!record) throw new Error(`找不到图片资产：${localImageId}`)
  if (role === 'output' && record.source && record.source !== 'generated') throw new Error('只能分享大模型生成的输出图')

  const original = await dataUrlToBlob(record.dataUrl)
  const mimeType = original.type || record.dataUrl.match(/^data:([^;,]+)/)?.[1] || 'image/png'
  assertImageBlobAllowed(original, mimeType)
  const { thumbnail, width, height } = await buildThumbnail(record.dataUrl)
  if (thumbnail.size > MAX_THUMB_BYTES) throw new Error(`缩略图不能超过 ${Math.round(MAX_THUMB_BYTES / 1024)} KB`)

  const clientAssetId = createClientAssetId(localImageId, role, index)
  return {
    manifestAsset: {
      clientAssetId,
      role,
      localImageId,
      mimeType,
      width: record.width ?? width,
      height: record.height ?? height,
      byteSize: original.size,
      standaloneShareAllowed: role === 'output',
    },
    uploadAsset: { clientAssetId, original: new Blob([original], { type: mimeType }), thumbnail },
  }
}

export async function buildMuseForgeTaskShareInput(options: BuildTaskShareOptions): Promise<SquareCreateShareInput> {
  ensureTaskCanBeShared(options.task)

  const lineageTasks = resolveLineageTasks(options.task, options.tasks)
  const outputImageIds = collectOutputImageIds(options.task, lineageTasks)
  const originInputImageIds = collectOriginInputImageIds(options.task, lineageTasks, outputImageIds)
  const allAssetRefs = [...outputImageIds, ...originInputImageIds]
  if (allAssetRefs.length > MAX_ASSET_COUNT) throw new Error(`单次分享最多包含 ${MAX_ASSET_COUNT} 个图片资产`)

  const manifestAssets: ManifestAsset[] = []
  const uploadAssets: SquareCreateShareAssetInput[] = []
  const localImageIdToClientAssetId = new Map<string, string>()
  let assetIndex = 0

  for (const imageId of outputImageIds) {
    const asset = await buildUploadAsset(imageId, 'output', assetIndex++)
    manifestAssets.push(asset.manifestAsset)
    uploadAssets.push(asset.uploadAsset)
    localImageIdToClientAssetId.set(imageId, asset.manifestAsset.clientAssetId)
  }
  for (const imageId of originInputImageIds) {
    const asset = await buildUploadAsset(imageId, 'origin_input', assetIndex++)
    manifestAssets.push(asset.manifestAsset)
    uploadAssets.push(asset.uploadAsset)
    localImageIdToClientAssetId.set(imageId, asset.manifestAsset.clientAssetId)
  }

  const nodes: ManifestTaskNode[] = lineageTasks.map((task) => ({
    localTaskId: task.id,
    status: task.status,
    parentTaskId: task.parentTaskId ?? null,
    parentImageId: task.parentImageId ?? null,
    prompt: task.prompt,
    params: task.params,
    providerName: task.apiProfileName ?? task.apiProvider ?? null,
    categoryName: task.categoryName ?? null,
    createdAt: task.createdAt,
    finishedAt: task.finishedAt ?? null,
    elapsed: task.elapsed ?? null,
    inputAssetRefs: task.inputImageIds.map((imageId) => localImageIdToClientAssetId.get(imageId)).filter((assetId): assetId is string => Boolean(assetId)),
    outputAssetRefs: task.outputImages.map((imageId) => localImageIdToClientAssetId.get(imageId)).filter((assetId): assetId is string => Boolean(assetId)),
  }))

  return {
    manifest: {
      kind: 'task',
      clientRequestId: createClientRequestId('task'),
      title: normalizeTitle(options.title, options.task.prompt.slice(0, MAX_TITLE_LENGTH)),
      prompt: options.task.prompt.trim(),
      tags: normalizeTags(options.tags),
      source: { app: 'MuseForge', schemaVersion: 1 },
      taskShare: {
        entryTaskId: options.task.id,
        entryOutputImageIds: options.task.outputImages.map((imageId) => localImageIdToClientAssetId.get(imageId)).filter((assetId): assetId is string => Boolean(assetId)),
        lineage: nodes,
        originAssets: manifestAssets.filter((asset) => asset.role === 'origin_input').map((asset) => ({
          clientAssetId: asset.clientAssetId,
          role: asset.role,
          standaloneShareAllowed: false,
        })),
      },
      assets: manifestAssets,
    },
    assets: uploadAssets,
  }
}

export function buildMuseForgePromptShareInput(options: BuildPromptShareOptions): SquareCreateShareInput {
  const content = options.content.trim()
  if (!content) throw new Error('提示词内容不能为空')
  if (content.length > MAX_PROMPT_LENGTH) throw new Error(`提示词不能超过 ${MAX_PROMPT_LENGTH} 字符`)

  return {
    manifest: {
      kind: 'prompt',
      clientRequestId: createClientRequestId('prompt'),
      title: normalizeTitle(options.title, options.item?.title ?? content.slice(0, MAX_TITLE_LENGTH)),
      prompt: content,
      tags: normalizeTags(options.tags),
      source: { app: 'MuseForge', schemaVersion: 1 },
      promptShare: {
        localPromptId: options.item?.id ?? null,
        createdAt: options.item?.createdAt ?? Date.now(),
        updatedAt: options.item?.updatedAt ?? Date.now(),
      },
      assets: [],
    },
    assets: [],
  }
}

export const buildTaskShareInput = buildMuseForgeTaskShareInput
export const buildPromptShareInput = buildMuseForgePromptShareInput
