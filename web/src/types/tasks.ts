import type { ApiMode, ApiProvider, AppMode } from './settings'
import type { AgentConversation } from './agent'

export interface TaskParams {
  size: string
  quality: 'auto' | 'low' | 'medium' | 'high'
  output_format: 'png' | 'jpeg' | 'webp'
  output_compression: number | null
  moderation: 'auto' | 'low'
  n: number
}

export const DEFAULT_PARAMS: TaskParams = {
  size: 'auto',
  quality: 'auto',
  output_format: 'png',
  output_compression: null,
  moderation: 'auto',
  n: 1,
}

export interface InputImage {
  /** IndexedDB image store 的 id（SHA-256 hash） */
  id: string
  /** data URL，用于预览 */
  dataUrl: string
  /** 从历史任务输出继续编辑时保留来源任务 */
  sourceTaskId?: string | null
  /** 从历史任务输出继续编辑时保留来源图片 */
  sourceImageId?: string | null
}

export interface MaskDraft {
  targetImageId: string
  maskDataUrl: string
  updatedAt: number
}

export type TaskStatus = 'running' | 'done' | 'error'
export type TaskView = 'gallery' | 'trash'

export interface CategoryConfig {
  id: string
  name: string
  createdAt: number
}

export interface PromptLibraryItem {
  id: string
  title: string
  content: string
  createdAt: number
  updatedAt: number
}

export interface TaskErrorDebugInfo {
  createdAt: number
  message: string
  requestId?: string
  apiProvider?: ApiProvider
  apiProfileName?: string
  apiMode?: ApiMode
  apiModel?: string
  params?: TaskParams
  rawImageUrls?: string[]
  rawResponsePayload?: string
}

export interface TaskRecord {
  id: string
  /** 所属分类 */
  categoryId?: string | null
  /** 任务提交时的分类名称快照 */
  categoryName?: string | null
  /** 移入回收站时间；空值表示仍在画廊 */
  deletedAt?: number | null
  /** 来源任务，用于展示编辑/复用链路 */
  parentTaskId?: string | null
  /** 来源任务中的图片 */
  parentImageId?: string | null
  prompt: string
  params: TaskParams
  /** 生成时使用的 Provider 类型 */
  apiProvider?: ApiProvider
  /** 生成时使用的 API 配置 ID */
  apiProfileId?: string
  /** 生成时使用的 Provider 名称 */
  apiProfileName?: string
  /** 生成时使用的 API 模式 */
  apiMode?: ApiMode
  /** 生成时使用的模型 ID */
  apiModel?: string
  /** fal.ai 队列请求 ID，用于连接断开后的结果恢复 */
  falRequestId?: string
  /** fal.ai 队列 endpoint，用于连接断开后的状态和结果查询 */
  falEndpoint?: string
  /** fal.ai 任务连接断开后是否等待自动恢复 */
  falRecoverable?: boolean
  /** 自定义异步服务商任务 ID，用于重启后继续查询结果 */
  customTaskId?: string
  /** 自定义异步任务是否等待自动恢复 */
  customRecoverable?: boolean
  /** API 返回的实际生效参数，用于标记与请求值不一致的情况 */
  actualParams?: Partial<TaskParams>
  /** 服务端异步任务 ID；为空表示纯本地/同步任务 */
  serverTaskId?: string
  /** 服务端异步任务状态快照，用于区分 queued/running/canceled 等后端状态 */
  serverTaskStatus?: string
  /** 服务端输出资产 ID 列表 */
  serverOutputAssetIds?: string[]
  /** 服务端任务重试信息 */
  attemptCount?: number
  maxAttempts?: number
  lastError?: string | null
  lastRequestId?: string
  /** 输出图片对应的实际生效参数，key 为 outputImages 中的图片 id */
  actualParamsByImage?: Record<string, Partial<TaskParams>>
  /** 输出图片对应的 API 改写提示词，key 为 outputImages 中的图片 id */
  revisedPromptByImage?: Record<string, string>
  /** 输入图片的 image store id 列表 */
  inputImageIds: string[]
  maskTargetImageId?: string | null
  maskImageId?: string | null
  /** 输出图片的 image store id 列表 */
  outputImages: string[]
  /** 流式生成的中间步骤图片 id 列表，仅失败时保留供排查/下载 */
  streamPartialImageIds?: string[]
  /** API 返回的原始图片 HTTP URL（非 base64 时记录） */
  rawImageUrls?: string[]
  /** 发生解析错误时的原始响应 JSON */
  rawResponsePayload?: string
  /** 失败时保留的排查快照 */
  errorDebug?: TaskErrorDebugInfo | null
  status: TaskStatus
  error: string | null
  createdAt: number
  finishedAt: number | null
  /** 总耗时毫秒 */
  elapsed: number | null
  /** 是否收藏 */
  isFavorite?: boolean
  /** 来源模式：画廊 / Agent */
  sourceMode?: AppMode
  /** Agent 对话 ID */
  agentConversationId?: string
  /** Agent 轮次 ID */
  agentRoundId?: string
  /** Agent 消息 ID */
  agentMessageId?: string
  /** Agent 图像工具调用 ID */
  agentToolCallId?: string
  /** Agent 批量图像工具调用 ID */
  agentBatchCallId?: string
  /** Agent 图像工具实际动作 */
  agentToolAction?: 'generate' | 'edit' | 'auto' | string
}

export interface StoredImage {
  id: string
  dataUrl: string
  /** 图片首次存储时间（ms） */
  createdAt?: number
  /** 图片来源：用户上传 / API 生成 / 遮罩 */
  source?: 'upload' | 'generated' | 'mask'
  /** 原图宽度 */
  width?: number
  /** 原图高度 */
  height?: number
}

export interface StoredImageThumbnail {
  id: string
  /** 列表缩略图，用于避免卡片页解码完整 4K 原图 */
  thumbnailDataUrl: string
  /** 原图宽度 */
  width?: number
  /** 原图高度 */
  height?: number
  /** 缩略图生成参数版本 */
  thumbnailVersion?: number
}

export interface StoredServerAsset {
  id: string
  taskId?: string | null
  projectId?: string | null
  taskType?: string | null
  prompt?: string | null
  storageKey?: string | null
  publicUrl: string
  mime: string
  width?: number | null
  height?: number | null
  sizeBytes?: number | null
  sha256?: string | null
  kind?: string | null
  visibility?: string | null
  localImageId?: string | null
  createdAt?: number | null
  syncedAt: number
}

/** ZIP manifest.json 格式 */
export interface ExportData {
  version: number
  exportedAt: string
  settings?: import('./settings').AppSettings
  tasks?: TaskRecord[]
  agentConversations?: AgentConversation[]
  categories?: CategoryConfig[]
  promptLibrary?: PromptLibraryItem[]
  /** imageId → 图片信息 */
  imageFiles?: Record<string, {
    path: string
    createdAt?: number
    source?: 'upload' | 'generated' | 'mask'
    width?: number
    height?: number
  }>
  /** imageId → 缩略图信息 */
  thumbnailFiles?: Record<string, {
    path: string
    width?: number
    height?: number
    thumbnailVersion?: number
  }>
  /** 服务端资产元数据；publicUrl 可用于恢复，localImageId 指向 ZIP 内本地兜底图片 */
  serverAssets?: StoredServerAsset[]
}
