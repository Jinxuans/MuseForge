import type { ApiProfile, TaskRecord } from '../types'
import { backendAssetToStoredServerAsset, fetchBackendAssetAsDataUrl } from '../lib/backendAssets'
import {
  cancelBackendTask,
  createBackendEditTask,
  createBackendGenerationTask,
  getAssetRevisedPrompt,
  getBackendTask,
  getTaskOutputAssets,
  serverTaskParams,
} from '../lib/backendTasks'
import { dataUrlToBlob, imageDataUrlToPngBlob, maskDataUrlToPngBlob } from '../lib/canvasImage'
import { replaceImageMentionsForApi } from '../lib/promptImageMentions'
import {
  canCancelQueuedServerTask,
  createBackendTaskOutputBasePatch,
  createBackendTaskOutputImagesPatch,
  getServerTaskErrorMessage,
  getServerTaskStatusPatch,
  SERVER_TASK_CANCELED_MESSAGE,
} from '../store/tasks/backendTaskExecution'
import { isBackendTaskDone, waitForBackendTaskCompletion } from './backendTaskPolling'
import type { TaskExecutionContext } from './taskExecutionContext'

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

  const latest = await waitForBackendTaskCompletion(serverTask.id, {
    initialTask: serverTask,
    onPoll: (task) => ctx.updateTask(taskId, {
      ...getServerTaskStatusPatch(task),
    }),
  })

  if (!isBackendTaskDone(latest)) {
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
