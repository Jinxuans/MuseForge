import type { AppSettings, TaskRecord } from '../types'
import { getActiveApiProfile } from '../lib/apiProfiles'
import { normalizeParamsForSettings } from '../lib/paramCompatibility'
import type { TaskExecutionContext } from './taskExecutionContext'

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
