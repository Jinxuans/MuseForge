import type { ApiProfile, AppSettings, CategoryConfig, InputImage, TaskParams, TaskRecord } from '../../types'
import { getActiveApiProfile, getCustomProviderDefinition, normalizeSettings } from '../../lib/apiProfiles'

export const SUPPORT_PROMPT_IMAGE_THRESHOLD = 50
export const OPENAI_INTERRUPTED_ERROR = '请求中断'

const TRASH_RETENTION_MS = 15 * 24 * 60 * 60 * 1000

function isAgentTask(task: TaskRecord) {
  return task.sourceMode === 'agent' || Boolean(task.agentConversationId || task.agentRoundId)
}

export function countSuccessfulOutputImages(tasks: TaskRecord[]) {
  return tasks.reduce((count, task) => count + (task.status === 'done' && !isAgentTask(task) ? task.outputImages.length : 0), 0)
}

export type SupportPromptState = {
  supportPromptDismissed: boolean
  supportPromptOpen: boolean
  supportPromptSkippedForImportedData: boolean
}

export type SupportPromptPatch = Partial<Pick<SupportPromptState, 'supportPromptOpen' | 'supportPromptSkippedForImportedData'>>

export function getImportedDataSupportPromptPatch(tasks: TaskRecord[], state: SupportPromptState): SupportPromptPatch {
  const count = countSuccessfulOutputImages(tasks)
  if (state.supportPromptDismissed) return {}
  if (count <= SUPPORT_PROMPT_IMAGE_THRESHOLD) return { supportPromptSkippedForImportedData: false }
  if (state.supportPromptOpen) return {}
  return { supportPromptSkippedForImportedData: true }
}

export function getExistingLocalDataSupportPromptPatch(tasks: TaskRecord[], state: SupportPromptState): SupportPromptPatch {
  const count = countSuccessfulOutputImages(tasks)
  if (state.supportPromptDismissed || state.supportPromptOpen) return {}
  if (count <= SUPPORT_PROMPT_IMAGE_THRESHOLD) return { supportPromptSkippedForImportedData: false }
  if (state.supportPromptSkippedForImportedData) return {}
  return { supportPromptOpen: true }
}

export function shouldOpenSupportPromptForTaskUpdate(
  previousTasks: TaskRecord[],
  nextTasks: TaskRecord[],
  taskId: string,
  state: SupportPromptState,
) {
  if (state.supportPromptDismissed || state.supportPromptOpen || state.supportPromptSkippedForImportedData) return false

  const previousTask = previousTasks.find((task) => task.id === taskId)
  const nextTask = nextTasks.find((task) => task.id === taskId)
  if (!nextTask || previousTask?.status === 'done' || nextTask.status !== 'done' || nextTask.outputImages.length === 0) return false

  const previousCount = countSuccessfulOutputImages(previousTasks)
  const nextCount = countSuccessfulOutputImages(nextTasks)
  return previousCount <= SUPPORT_PROMPT_IMAGE_THRESHOLD && nextCount > SUPPORT_PROMPT_IMAGE_THRESHOLD
}

export function getTaskApiProfile(settings: AppSettings, task: TaskRecord): ApiProfile | null {
  const normalized = normalizeSettings(settings)
  const provider = task.apiProvider

  if (!task.apiProfileId) return null

  const byId = normalized.profiles.find((profile) => profile.id === task.apiProfileId)
  if (byId && (!provider || byId.provider === provider)) return byId
  return null
}

export function createSettingsForApiProfile(settings: AppSettings, profile: ApiProfile): AppSettings {
  const normalized = normalizeSettings(settings)
  return normalizeSettings({
    ...normalized,
    baseUrl: profile.baseUrl,
    apiKey: profile.apiKey,
    model: profile.model,
    timeout: profile.timeout,
    apiMode: profile.apiMode,
    codexCli: profile.codexCli,
    apiProxy: profile.apiProxy,
    profiles: normalized.profiles.map((item) => item.id === profile.id ? profile : item),
    activeProfileId: profile.id,
  })
}

export function getReusedTaskApiProfile(settings: AppSettings, profileId: string | null): ApiProfile | null {
  if (!profileId) return null
  return normalizeSettings(settings).profiles.find((profile) => profile.id === profileId) ?? null
}

export function getTaskApiProfileName(task: TaskRecord) {
  return task.apiProfileName || task.apiModel || '未知配置'
}

export function getCodexCliPromptKey(settings: AppSettings): string {
  const profile = getActiveApiProfile(settings)
  return `${profile.baseUrl}\n${profile.apiKey}`
}

function hasActualParams(params: Partial<TaskParams> | undefined): params is Partial<TaskParams> {
  return Boolean(params && Object.keys(params).length > 0)
}

export function firstActualParams(paramsList: Array<Partial<TaskParams> | undefined> | undefined): Partial<TaskParams> | undefined {
  return paramsList?.find(hasActualParams)
}

export function mapActualParamsByImage(outputIds: string[], paramsList: Array<Partial<TaskParams> | undefined> | undefined) {
  const mapped = paramsList?.reduce<Record<string, Partial<TaskParams>>>((acc, params, index) => {
    const imgId = outputIds[index]
    if (imgId && hasActualParams(params)) acc[imgId] = params
    return acc
  }, {})
  return mapped && Object.keys(mapped).length > 0 ? mapped : undefined
}

async function readImageSizeParam(dataUrl: string): Promise<Partial<TaskParams> | undefined> {
  if (typeof Image === 'undefined') return undefined

  return new Promise((resolve) => {
    let settled = false
    const image = new Image()
    const finish = (params: Partial<TaskParams> | undefined) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(params)
    }
    const timer = setTimeout(() => finish(undefined), 2000)
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        finish({ size: `${image.naturalWidth}x${image.naturalHeight}` })
      } else {
        finish(undefined)
      }
    }
    image.onerror = () => finish(undefined)
    image.src = dataUrl
    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      finish({ size: `${image.naturalWidth}x${image.naturalHeight}` })
    }
  })
}

export async function readImageSizeParamsList(images: string[]): Promise<Array<Partial<TaskParams> | undefined>> {
  return Promise.all(images.map((image) => readImageSizeParam(image)))
}

export async function resolveImageSizeParamsList(
  images: string[],
  preferred?: Array<Partial<TaskParams> | undefined>,
): Promise<Array<Partial<TaskParams> | undefined>> {
  if (preferred?.length === images.length && preferred.every(hasActualParams)) return preferred
  const fallback = await readImageSizeParamsList(images)
  return images.map((_, index) => hasActualParams(preferred?.[index]) ? preferred?.[index] : fallback[index])
}

export function updateTaskListItem(tasks: TaskRecord[], taskId: string, patch: Partial<TaskRecord>) {
  return tasks.map((task) =>
    task.id === taskId ? { ...task, ...patch } : task,
  )
}

export function setTaskListState(tasks: TaskRecord[]) {
  return {
    tasks,
    ...(countSuccessfulOutputImages(tasks) <= SUPPORT_PROMPT_IMAGE_THRESHOLD
      ? { supportPromptSkippedForImportedData: false }
      : {}),
  }
}

export function renameTaskCategory(tasks: TaskRecord[], categoryId: string, categoryName: string) {
  return tasks.map((task) => task.categoryId === categoryId ? { ...task, categoryName } : task)
}

export function clearTaskCategory(tasks: TaskRecord[], categoryId: string) {
  return tasks.map((task) => task.categoryId === categoryId ? { ...task, categoryId: null, categoryName: null } : task)
}

export function applyTaskCategory(tasks: TaskRecord[], taskIds: string[], category: CategoryConfig | null) {
  const ids = new Set(taskIds)
  return tasks.map((task) => ids.has(task.id)
    ? { ...task, categoryId: category?.id ?? null, categoryName: category?.name ?? null }
    : task,
  )
}

export function markTasksDeleted(tasks: TaskRecord[], taskIds: string[], now = Date.now()) {
  const ids = new Set(taskIds)
  return tasks.map((task) => ids.has(task.id) ? { ...task, deletedAt: task.deletedAt ?? now } : task)
}

export function restoreDeletedTasks(tasks: TaskRecord[], taskIds: string[]) {
  const ids = new Set(taskIds)
  return tasks.map((task) => ids.has(task.id) ? { ...task, deletedAt: null } : task)
}

export function getExpiredTrashTaskIds(tasks: TaskRecord[], now = Date.now()) {
  return tasks
    .filter((task) => task.deletedAt && now - task.deletedAt > TRASH_RETENTION_MS)
    .map((task) => task.id)
}

export function resolveTaskParentFromInputImages(inputImages: InputImage[]) {
  const source = inputImages.find((img) => img.sourceTaskId && img.sourceImageId)
  return {
    parentTaskId: source?.sourceTaskId ?? null,
    parentImageId: source?.sourceImageId ?? null,
  }
}

function isOpenAITask(task: TaskRecord) {
  return (task.apiProvider ?? 'openai') !== 'fal'
}

export function isRunningOpenAITask(task: TaskRecord) {
  return task.status === 'running' && isOpenAITask(task)
}

export function isAsyncCustomProviderTask(settings: AppSettings, provider: string, hasInputImages: boolean) {
  const customProvider = getCustomProviderDefinition(settings, provider)
  if (!customProvider?.poll) return false
  const submitMapping = hasInputImages && customProvider.editSubmit ? customProvider.editSubmit : customProvider.submit
  return Boolean(submitMapping.taskIdPath)
}

export function markInterruptedOpenAIRunningTasks(tasks: TaskRecord[], now = Date.now()) {
  const interruptedTasks: TaskRecord[] = []
  const updatedTasks = tasks.map((task) => {
    if (!isRunningOpenAITask(task) || task.customTaskId) return task

    const updated: TaskRecord = {
      ...task,
      status: 'error',
      error: OPENAI_INTERRUPTED_ERROR,
      falRecoverable: false,
      finishedAt: now,
      elapsed: Math.max(0, now - task.createdAt),
    }
    interruptedTasks.push(updated)
    return updated
  })

  return { tasks: updatedTasks, interruptedTasks }
}
