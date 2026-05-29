import type { AppSettings, TaskRecord } from '../types'
import { callImageApi, type CallApiResult } from '../lib/api'
import { replaceImageMentionsForApi } from '../lib/promptImageMentions'
import { firstActualParams, mapActualParamsByImage, readImageSizeParamsList, resolveImageSizeParamsList } from '../store/tasks/taskDomain'
import type { TaskExecutionContext } from './taskExecutionContext'

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
