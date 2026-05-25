import type { ApiProfile, AppSettings, CategoryConfig, InputImage, MaskDraft, TaskParams, TaskRecord } from '../types'
import { callImageApi, type CallApiResult } from '../lib/api'
import type { AgentApiResultImage } from '../lib/agentApi'
import { getActiveApiProfile } from '../lib/apiProfiles'
import { backendAssetToStoredServerAsset, fetchBackendAssetAsDataUrl } from '../lib/backendAssets'
import { cancelBackendTask, createBackendEditTask, createBackendGenerationTask, getAssetRevisedPrompt, getBackendTask, getTaskOutputAssets, mapServerTaskStatus, serverTaskParams } from '../lib/backendTasks'
import { dataUrlToBlob, imageDataUrlToPngBlob, maskDataUrlToPngBlob, validateMaskMatchesImage } from '../lib/canvasImage'
import { orderInputImagesForMask } from '../lib/mask'
import { getChangedParams, normalizeParamsForSettings } from '../lib/paramCompatibility'
import { replaceImageMentionsForApi } from '../lib/promptImageMentions'
import { storeImage } from '../lib/db'
import { canCancelQueuedServerTask, createBackendTaskOutputBasePatch, createBackendTaskOutputImagesPatch, getServerTaskErrorMessage, getServerTaskStatusPatch, SERVER_TASK_CANCELED_MESSAGE } from '../store/backendTaskExecution'
import { cacheImage } from '../store/imageCache'
import { firstActualParams, mapActualParamsByImage, readImageSizeParamsList, resolveImageSizeParamsList, resolveTaskParentFromInputImages } from '../store/taskDomain'
import type { getCustomQueuedImageResult } from '../lib/openaiCompatibleImageApi'
import type { getFalQueuedImageResult } from '../lib/falAiImageApi'

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

export type FalRequestInfo = { requestId: string; endpoint: string }
export type CustomTaskInfo = { taskId: string }

export type ImageApiTaskRequestResult = {
  result: CallApiResult
  maskDataUrl?: string
  falRequestInfo: FalRequestInfo | null
  customTaskInfo: CustomTaskInfo | null
}

export type ImageApiTaskSuccessResult = {
  saved: boolean
  outputIds: string[]
  partialImageIdsToClean: string[]
  promptWasRevised: boolean
  hasRevisedPromptValue: boolean
}

export type SubmitTaskPreparationResult =
  | { status: 'ready'; normalizedParamPatch: Partial<TaskParams> }
  | { status: 'full-mask' }
  | { status: 'error'; message: string; clearMaskDraft: boolean }

export type PersistedTaskInputImagesResult =
  | { status: 'ready'; orderedInputImages: InputImage[]; maskImageId: string | null; maskTargetImageId: string | null }
  | { status: 'full-mask' }
  | { status: 'error'; message: string; clearMaskDraft: boolean }

export async function persistTaskInputImages(inputImages: InputImage[], maskDraft: MaskDraft | null, options: { allowFullMask?: boolean } = {}): Promise<PersistedTaskInputImagesResult> {
  let orderedInputImages = inputImages
  let maskImageId: string | null = null
  let maskTargetImageId: string | null = null

  if (maskDraft) {
    try {
      orderedInputImages = orderInputImagesForMask(inputImages, maskDraft.targetImageId)
      const coverage = await validateMaskMatchesImage(maskDraft.maskDataUrl, orderedInputImages[0].dataUrl)
      if (coverage === 'full' && !options.allowFullMask) {
        return { status: 'full-mask' }
      }
      maskImageId = await storeImage(maskDraft.maskDataUrl, 'mask')
      cacheImage(maskImageId, maskDraft.maskDataUrl)
      maskTargetImageId = maskDraft.targetImageId
    } catch (err) {
      return {
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
        clearMaskDraft: !inputImages.some((img) => img.id === maskDraft.targetImageId),
      }
    }
  }

  for (const img of orderedInputImages) {
    await storeImage(img.dataUrl)
  }

  return { status: 'ready', orderedInputImages, maskImageId, maskTargetImageId }
}

export async function createSubmittedGalleryTask(
  ctx: TaskExecutionContext,
  input: {
    taskId: string
    prompt: string
    params: TaskParams
    inputImages: InputImage[]
    maskDraft: MaskDraft | null
    activeProfile: ApiProfile
    requestSettings: AppSettings
    categories: CategoryConfig[]
    activeCategoryId: string
    uncategorizedCategoryId: string
    allowFullMask?: boolean
  },
): Promise<SubmitTaskPreparationResult> {
  const persistedInputs = await persistTaskInputImages(input.inputImages, input.maskDraft, { allowFullMask: input.allowFullMask })
  if (persistedInputs.status !== 'ready') return persistedInputs

  const { orderedInputImages, maskImageId, maskTargetImageId } = persistedInputs
  const normalizedParams = normalizeParamsForSettings(input.params, input.requestSettings, { hasInputImages: orderedInputImages.length > 0 })
  const selectedCategory = input.activeCategoryId !== 'all' && input.activeCategoryId !== input.uncategorizedCategoryId
    ? input.categories.find((category) => category.id === input.activeCategoryId)
    : null
  const lineage = resolveTaskParentFromInputImages(orderedInputImages)
  const task: TaskRecord = {
    id: input.taskId,
    categoryId: selectedCategory?.id ?? null,
    categoryName: selectedCategory?.name ?? null,
    deletedAt: null,
    parentTaskId: lineage.parentTaskId,
    parentImageId: lineage.parentImageId,
    prompt: input.prompt.trim(),
    params: normalizedParams,
    apiProvider: input.activeProfile.provider,
    apiProfileId: input.activeProfile.id,
    apiProfileName: input.activeProfile.name,
    apiMode: input.activeProfile.apiMode,
    apiModel: input.activeProfile.model,
    inputImageIds: orderedInputImages.map((image) => image.id),
    maskTargetImageId,
    maskImageId,
    outputImages: [],
    status: 'running',
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
    elapsed: null,
  }

  ctx.prependTask(task)
  await ctx.putTask(task)
  return {
    status: 'ready',
    normalizedParamPatch: getChangedParams(input.params, normalizedParams),
  }
}

export async function ensureStreamingAgentTask(
  ctx: TaskExecutionContext,
  taskIdByToolCallId: Map<string, string>,
  input: {
    taskId: string
    toolCallId: string
    prompt: string
    params: TaskParams
    profile: ApiProfile
    inputImageIds: string[]
    maskTargetImageId: string | null
    maskImageId: string | null
    conversationId: string
    roundId: string
    assistantMessageId: string
    createdAt: number
    agentBatchCallId?: string
    attachTask: (taskId: string) => void
  },
) {
  const existingTaskId = taskIdByToolCallId.get(input.toolCallId)
  if (existingTaskId) return existingTaskId

  const existingTask = ctx.getTaskByToolCallId(input.toolCallId)
  if (existingTask) {
    taskIdByToolCallId.set(input.toolCallId, existingTask.id)
    input.attachTask(existingTask.id)
    return existingTask.id
  }

  const task: TaskRecord = {
    id: input.taskId,
    prompt: input.prompt,
    params: { ...input.params, n: 1 },
    apiProvider: input.profile.provider,
    apiProfileId: input.profile.id,
    apiProfileName: input.profile.name,
    apiMode: input.profile.apiMode,
    apiModel: input.profile.model,
    inputImageIds: input.inputImageIds,
    maskTargetImageId: input.maskTargetImageId,
    maskImageId: input.maskImageId,
    outputImages: [],
    status: 'running',
    error: null,
    createdAt: input.createdAt,
    finishedAt: null,
    elapsed: null,
    sourceMode: 'agent',
    agentConversationId: input.conversationId,
    agentRoundId: input.roundId,
    agentMessageId: input.assistantMessageId,
    agentToolCallId: input.toolCallId,
    ...(input.agentBatchCallId ? { agentBatchCallId: input.agentBatchCallId } : {}),
  }

  taskIdByToolCallId.set(input.toolCallId, task.id)
  ctx.prependTask(task)
  input.attachTask(task.id)
  await ctx.putTask(task)
  return task.id
}

export async function completeAgentImageTask(
  ctx: TaskExecutionContext,
  taskId: string,
  image: AgentApiResultImage,
  rawResponsePayload: string | undefined,
  startedAt: number,
) {
  const latestTask = ctx.getTask(taskId)
  if (latestTask?.status === 'done' && latestTask.outputImages.length > 0) return taskId

  const imgId = await ctx.storeGeneratedImage(image.dataUrl)
  const actualParams: Partial<TaskParams> = {
    ...(Object.keys(image.actualParams ?? {}).length ? image.actualParams : {}),
    n: 1,
  }
  ctx.updateTask(taskId, {
    prompt: image.revisedPrompt ?? latestTask?.prompt ?? '',
    outputImages: [imgId],
    actualParams,
    actualParamsByImage: { [imgId]: actualParams },
    revisedPromptByImage: image.revisedPrompt ? { [imgId]: image.revisedPrompt } : undefined,
    rawResponsePayload,
    status: 'done',
    error: null,
    finishedAt: Date.now(),
    elapsed: Date.now() - (latestTask?.createdAt ?? startedAt),
    agentToolAction: image.action,
  })
  ctx.setTaskStreamPreview(taskId)
  return taskId
}

export async function createCompletedAgentImageTask(
  ctx: TaskExecutionContext,
  input: {
    taskId: string
    image: AgentApiResultImage
    prompt: string
    params: TaskParams
    profile: ApiProfile
    inputImageIds: string[]
    maskTargetImageId: string | null
    maskImageId: string | null
    conversationId: string
    roundId: string
    assistantMessageId: string
    rawResponsePayload?: string
    startedAt: number
    attachTask: (taskId: string) => void
  },
) {
  const imgId = await ctx.storeGeneratedImage(input.image.dataUrl)
  const actualParams: Partial<TaskParams> = {
    ...(Object.keys(input.image.actualParams ?? {}).length ? input.image.actualParams : {}),
    n: 1,
  }
  const task: TaskRecord = {
    id: input.taskId,
    prompt: input.prompt,
    params: input.params,
    apiProvider: input.profile.provider,
    apiProfileId: input.profile.id,
    apiProfileName: input.profile.name,
    apiMode: input.profile.apiMode,
    apiModel: input.profile.model,
    inputImageIds: input.inputImageIds,
    maskTargetImageId: input.maskTargetImageId,
    maskImageId: input.maskImageId,
    outputImages: [imgId],
    actualParams,
    actualParamsByImage: { [imgId]: actualParams },
    revisedPromptByImage: input.image.revisedPrompt ? { [imgId]: input.image.revisedPrompt } : undefined,
    rawResponsePayload: input.rawResponsePayload,
    status: 'done',
    error: null,
    createdAt: input.startedAt,
    finishedAt: Date.now(),
    elapsed: Date.now() - input.startedAt,
    sourceMode: 'agent',
    agentConversationId: input.conversationId,
    agentRoundId: input.roundId,
    agentMessageId: input.assistantMessageId,
    agentToolCallId: input.image.toolCallId,
    agentToolAction: input.image.action,
  }

  ctx.prependTask(task)
  input.attachTask(task.id)
  await ctx.putTask(task)
  return task.id
}

export async function completeRecoveredFalTask(
  ctx: TaskExecutionContext,
  task: TaskRecord,
  result: Awaited<ReturnType<typeof getFalQueuedImageResult>>,
) {
  const latest = ctx.getTask(task.id)
  if (!latest || latest.status === 'done') return

  const actualParamsList = await resolveImageSizeParamsList(result.images, result.actualParamsList)
  const outputIds: string[] = []
  for (const dataUrl of result.images) {
    outputIds.push(await ctx.storeGeneratedImage(dataUrl))
  }

  ctx.updateTask(task.id, {
    outputImages: outputIds,
    actualParams: firstActualParams(actualParamsList),
    actualParamsByImage: mapActualParamsByImage(outputIds, actualParamsList),
    revisedPromptByImage: undefined,
    status: 'done',
    error: null,
    falRecoverable: false,
    finishedAt: Date.now(),
    elapsed: Date.now() - task.createdAt,
  })
  ctx.showToast(`fal.ai 任务已恢复，共 ${outputIds.length} 张图片`, 'success')
}

export async function completeRecoveredCustomTask(
  ctx: TaskExecutionContext,
  task: TaskRecord,
  result: Awaited<ReturnType<typeof getCustomQueuedImageResult>>,
) {
  const latest = ctx.getTask(task.id)
  if (!latest || latest.status === 'done') return

  const actualParamsList = await readImageSizeParamsList(result.images)
  const outputIds: string[] = []
  for (const dataUrl of result.images) {
    outputIds.push(await ctx.storeGeneratedImage(dataUrl))
  }

  ctx.updateTask(task.id, {
    outputImages: outputIds,
    actualParams: firstActualParams(actualParamsList),
    actualParamsByImage: mapActualParamsByImage(outputIds, actualParamsList),
    revisedPromptByImage: undefined,
    status: 'done',
    error: null,
    customRecoverable: false,
    finishedAt: Date.now(),
    elapsed: Date.now() - task.createdAt,
  })
  ctx.showToast(`自定义异步任务已恢复，共 ${outputIds.length} 张图片`, 'success')
}

export async function runImageApiTaskRequest(
  ctx: TaskExecutionContext,
  taskId: string,
  task: TaskRecord,
  settings: AppSettings,
  initialCustomTaskInfo: CustomTaskInfo | null,
): Promise<ImageApiTaskRequestResult> {
  const inputDataUrls: string[] = []
  for (const imgId of task.inputImageIds) {
    const dataUrl = await ctx.ensureImageCached(imgId)
    if (!dataUrl) throw new Error('输入图片已不存在')
    inputDataUrls.push(dataUrl)
  }

  let maskDataUrl: string | undefined
  if (task.maskImageId) {
    maskDataUrl = await ctx.ensureImageCached(task.maskImageId) ?? undefined
    if (!maskDataUrl) throw new Error('遮罩图片已不存在')
  }

  let falRequestInfo: FalRequestInfo | null = task.falRequestId && task.falEndpoint
    ? { requestId: task.falRequestId, endpoint: task.falEndpoint }
    : null
  let customTaskInfo = initialCustomTaskInfo

  const result = await callImageApi({
    settings,
    prompt: replaceImageMentionsForApi(task.prompt, inputDataUrls.length),
    params: task.params,
    inputImageDataUrls: inputDataUrls,
    maskDataUrl,
    onFalRequestEnqueued: (request) => {
      falRequestInfo = request
      ctx.updateTask(taskId, {
        falRequestId: request.requestId,
        falEndpoint: request.endpoint,
        falRecoverable: false,
      })
    },
    onCustomTaskEnqueued: (request) => {
      customTaskInfo = request
      ctx.updateTask(taskId, {
        customTaskId: request.taskId,
        customRecoverable: false,
      })
    },
    onPartialImage: (partial) => {
      ctx.setTaskStreamPreview(taskId, partial.image, partial.requestIndex)
      void ctx.persistTaskStreamPartialImage(taskId, partial.image)
    },
  })

  return {
    result,
    maskDataUrl,
    falRequestInfo,
    customTaskInfo,
  }
}

export async function saveImageApiTaskSuccess(
  ctx: TaskExecutionContext,
  taskId: string,
  task: TaskRecord,
  result: CallApiResult,
  options: {
    taskProvider: string
    isAsyncCustomTask: boolean
  },
): Promise<ImageApiTaskSuccessResult> {
  const emptyResult = {
    saved: false,
    outputIds: [],
    partialImageIdsToClean: [],
    promptWasRevised: false,
    hasRevisedPromptValue: false,
  }
  const latestBeforeSuccess = ctx.getTask(taskId)
  if (!latestBeforeSuccess || latestBeforeSuccess.status !== 'running') return emptyResult

  const outputIds: string[] = []
  for (const dataUrl of result.images) {
    outputIds.push(await ctx.storeGeneratedImage(dataUrl))
  }

  const actualParamsList = options.taskProvider === 'fal'
    ? await resolveImageSizeParamsList(result.images, result.actualParamsList)
    : options.isAsyncCustomTask
    ? await readImageSizeParamsList(result.images)
    : result.actualParamsList
  const actualParams = (() => {
    if (options.taskProvider === 'fal') return firstActualParams(actualParamsList)
    if (options.isAsyncCustomTask) return firstActualParams(actualParamsList)
    return { ...result.actualParams, n: outputIds.length }
  })()
  const shouldStoreRevisedPrompts = options.taskProvider !== 'fal' && !options.isAsyncCustomTask
  const actualParamsByImage = mapActualParamsByImage(outputIds, actualParamsList)
  const revisedPromptByImage = shouldStoreRevisedPrompts ? result.revisedPrompts?.reduce<Record<string, string>>((acc, revisedPrompt, index) => {
    const imgId = outputIds[index]
    if (imgId && revisedPrompt && revisedPrompt.trim()) acc[imgId] = revisedPrompt
    return acc
  }, {}) : undefined
  const promptWasRevised = Boolean(shouldStoreRevisedPrompts && result.revisedPrompts?.some(
    (revisedPrompt) => revisedPrompt?.trim() && revisedPrompt.trim() !== task.prompt.trim(),
  ))
  const hasRevisedPromptValue = Boolean(shouldStoreRevisedPrompts && result.revisedPrompts?.some((revisedPrompt) => revisedPrompt?.trim()))

  const latestBeforeUpdate = ctx.getTask(taskId)
  if (!latestBeforeUpdate || latestBeforeUpdate.status !== 'running') {
    return {
      ...emptyResult,
      outputIds,
      promptWasRevised,
      hasRevisedPromptValue,
    }
  }

  const partialImageIdsToClean = latestBeforeUpdate.streamPartialImageIds || []
  ctx.updateTask(taskId, {
    outputImages: outputIds,
    streamPartialImageIds: undefined,
    rawImageUrls: result.rawImageUrls?.length ? result.rawImageUrls : undefined,
    actualParams,
    actualParamsByImage,
    revisedPromptByImage: revisedPromptByImage && Object.keys(revisedPromptByImage).length > 0 ? revisedPromptByImage : undefined,
    status: 'done',
    finishedAt: Date.now(),
    elapsed: Date.now() - task.createdAt,
    falRecoverable: false,
    customRecoverable: false,
  })
  ctx.showToast(`生成完成，共 ${outputIds.length} 张图片`, 'success')

  return {
    saved: true,
    outputIds,
    partialImageIdsToClean,
    promptWasRevised,
    hasRevisedPromptValue,
  }
}

async function saveBackendTaskOutputs(
  ctx: TaskExecutionContext,
  taskId: string,
  task: TaskRecord,
  serverTask: Awaited<ReturnType<typeof getBackendTask>>,
) {
  const outputAssets = getTaskOutputAssets(serverTask)
  const actualParams = serverTaskParams(serverTask)
  ctx.updateTask(taskId, createBackendTaskOutputBasePatch(serverTask, task))

  const outputIds: string[] = []
  const revisedPromptByImage: Record<string, string> = {}
  for (const asset of outputAssets) {
    try {
      const dataUrl = await fetchBackendAssetAsDataUrl(asset)
      const imageId = await ctx.storeGeneratedImage(dataUrl)
      outputIds.push(imageId)
      const revisedPrompt = getAssetRevisedPrompt(asset)
      if (revisedPrompt) revisedPromptByImage[imageId] = revisedPrompt
      await ctx.putServerAsset(backendAssetToStoredServerAsset(asset, imageId))
    } catch {
      await ctx.putServerAsset(backendAssetToStoredServerAsset(asset, null))
    }
  }

  const outputPatch = createBackendTaskOutputImagesPatch(outputIds, actualParams, revisedPromptByImage)
  if (outputPatch) ctx.updateTask(taskId, outputPatch)
  return { outputIds }
}

export async function executeBackendTask(
  ctx: TaskExecutionContext,
  taskId: string,
  task: TaskRecord,
  profile: ApiProfile,
) {
  const inputDataUrls: string[] = []
  for (const imgId of task.inputImageIds) {
    const dataUrl = await ctx.ensureImageCached(imgId)
    if (!dataUrl) throw new Error('输入图片已不存在')
    inputDataUrls.push(dataUrl)
  }

  let maskBlob: Blob | null = null
  if (task.maskImageId) {
    const maskDataUrl = await ctx.ensureImageCached(task.maskImageId)
    if (!maskDataUrl) throw new Error('遮罩图片已不存在')
    maskBlob = await maskDataUrlToPngBlob(maskDataUrl)
  }

  const generationInput = {
    model: task.apiModel || profile.model,
    prompt: replaceImageMentionsForApi(task.prompt, inputDataUrls.length),
    params: task.params,
    upstreamBaseUrl: profile.serverProfileId ? undefined : profile.baseUrl,
    apiKey: profile.serverProfileId ? undefined : profile.apiKey,
    providerProfileId: profile.serverProfileId ?? null,
  }

  const serverTask = inputDataUrls.length > 0 || maskBlob
    ? await createBackendEditTask({
        ...generationInput,
        images: await Promise.all(inputDataUrls.map((dataUrl, index) => index === 0 && maskBlob ? imageDataUrlToPngBlob(dataUrl) : dataUrlToBlob(dataUrl))),
        mask: maskBlob,
      })
    : await createBackendGenerationTask(generationInput)

  ctx.updateTask(taskId, {
    ...getServerTaskStatusPatch(serverTask),
  })

  let latest = serverTask
  while (mapServerTaskStatus(latest.status) === 'running') {
    await new Promise((resolve) => setTimeout(resolve, 1500))
    latest = await getBackendTask(serverTask.id)
    ctx.updateTask(taskId, {
      ...getServerTaskStatusPatch(latest),
    })
  }

  if (mapServerTaskStatus(latest.status) !== 'done') {
    throw new Error(getServerTaskErrorMessage(latest) ?? '后端任务失败')
  }

  const { outputIds } = await saveBackendTaskOutputs(ctx, taskId, task, latest)
  const outputCount = outputIds.length || getTaskOutputAssets(latest).length
  ctx.showToast(`生成完成，共 ${outputCount} 张图片`, 'success')
}

export async function cancelQueuedBackendTask(ctx: TaskExecutionContext, task: TaskRecord) {
  const current = ctx.getTask(task.id) ?? task
  if (!current.serverTaskId) {
    ctx.showToast('这条任务没有服务端任务 ID，无法取消', 'error')
    return false
  }
  if (!canCancelQueuedServerTask(current)) {
    ctx.showToast('任务已开始执行或已结束，无法取消排队', 'info')
    return false
  }

  try {
    const result = await cancelBackendTask(current.serverTaskId)
    if (!result.canceled) {
      try {
        const latest = await getBackendTask(current.serverTaskId)
        ctx.updateTask(current.id, getServerTaskStatusPatch(latest))
      } catch {
        // 状态刷新失败不影响取消结果提示。
      }
      ctx.showToast('任务已开始执行，无法取消排队', 'info')
      return false
    }

    const now = Date.now()
    ctx.updateTask(current.id, {
      serverTaskStatus: 'canceled',
      status: 'error',
      error: SERVER_TASK_CANCELED_MESSAGE,
      lastError: null,
      falRecoverable: false,
      customRecoverable: false,
      streamPartialImageIds: undefined,
      finishedAt: now,
      elapsed: now - current.createdAt,
    })
    ctx.setTaskStreamPreview(current.id)
    ctx.showToast('已取消排队任务', 'success')
    return true
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    ctx.showToast(`取消任务失败：${message}`, 'error')
    return false
  }
}

export async function createRetryTask(ctx: TaskExecutionContext, task: TaskRecord, settings: AppSettings, taskId: string) {
  const activeProfile = getActiveApiProfile(settings)
  const normalizedParams = normalizeParamsForSettings(task.params, settings, { hasInputImages: task.inputImageIds.length > 0 })
  const newTask: TaskRecord = {
    id: taskId,
    categoryId: task.categoryId ?? null,
    categoryName: task.categoryName ?? null,
    deletedAt: null,
    parentTaskId: task.id,
    parentImageId: task.outputImages[0] ?? task.parentImageId ?? null,
    prompt: task.prompt,
    params: normalizedParams,
    apiProvider: activeProfile.provider,
    apiProfileId: activeProfile.id,
    apiProfileName: activeProfile.name,
    apiMode: activeProfile.apiMode,
    apiModel: activeProfile.model,
    inputImageIds: [...task.inputImageIds],
    maskTargetImageId: task.maskTargetImageId ?? null,
    maskImageId: task.maskImageId ?? null,
    outputImages: [],
    status: 'running',
    error: null,
    createdAt: Date.now(),
    finishedAt: null,
    elapsed: null,
  }

  ctx.prependTask(newTask)
  await ctx.putTask(newTask)
  return newTask
}
