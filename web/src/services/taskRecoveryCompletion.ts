import type { TaskRecord } from '../types'
import type { getFalQueuedImageResult } from '../lib/falAiImageApi'
import type { getCustomQueuedImageResult } from '../lib/openaiCompatibleImageApi'
import { firstActualParams, mapActualParamsByImage, readImageSizeParamsList, resolveImageSizeParamsList } from '../store/tasks/taskDomain'
import type { TaskExecutionContext } from './taskExecutionContext'

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
