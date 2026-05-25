import type { ApiProfile, AppSettings, TaskRecord } from '../types'
import { getCustomProviderDefinition } from '../lib/apiProfiles'
import { getFalErrorMessage, getFalQueuedImageResult } from '../lib/falAiImageApi'
import { getCustomQueuedImageResult } from '../lib/openaiCompatibleImageApi'
import { createOpenAITimeoutError, type TimeoutStreamingHintProfile } from '../store/errorMessages'
import { createTaskErrorDebug, getRawErrorPayload } from '../store/taskErrorDebug'
import { getTaskApiProfile, isRunningOpenAITask } from '../store/taskDomain'

const FAL_RECOVERY_POLL_MS = 10_000
const CUSTOM_RECOVERY_POLL_MS = 10_000

const falRecoveryTimers = new Map<string, ReturnType<typeof setTimeout>>()
const customRecoveryTimers = new Map<string, ReturnType<typeof setTimeout>>()
const openAIWatchdogTimers = new Map<string, ReturnType<typeof setTimeout>>()

export type TaskRecoveryContext = {
  getSettings: () => AppSettings
  getTasks: () => TaskRecord[]
  updateTask: (taskId: string, patch: Partial<TaskRecord>) => void
  completeRecoveredFalTask: (task: TaskRecord, result: Awaited<ReturnType<typeof getFalQueuedImageResult>>) => Promise<void>
  completeRecoveredCustomTask: (task: TaskRecord, result: Awaited<ReturnType<typeof getCustomQueuedImageResult>>) => Promise<void>
  showToast: (message: string, type?: 'info' | 'success' | 'error') => void
}

function getFalRecoveryProfile(settings: AppSettings, task: TaskRecord): ApiProfile | null {
  const taskProfile = getTaskApiProfile(settings, task)
  if (taskProfile?.provider === 'fal') return taskProfile
  return null
}

function getCustomRecoveryProfile(settings: AppSettings, task: TaskRecord): ApiProfile | null {
  const provider = task.apiProvider
  if (!provider || provider === 'openai' || provider === 'fal') return null
  const taskProfile = getTaskApiProfile(settings, task)
  if (taskProfile?.provider === provider) return taskProfile
  return null
}

export function isTaskConnectionRecoverableError(err: unknown) {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') return true
  const message = err instanceof Error ? err.message : String(err)
  return /abort|network|failed to fetch|fetch failed|load failed|timeout|连接|断开|中断/i.test(message)
}

export function clearOpenAIWatchdogTimer(taskId: string) {
  const timer = openAIWatchdogTimers.get(taskId)
  if (timer) clearTimeout(timer)
  openAIWatchdogTimers.delete(taskId)
}

function failOpenAITaskIfStillRunning(ctx: TaskRecoveryContext, taskId: string, error: string, now = Date.now()) {
  const task = ctx.getTasks().find((item) => item.id === taskId)
  if (!task || !isRunningOpenAITask(task)) return false

  ctx.updateTask(taskId, {
    status: 'error',
    error,
    falRecoverable: false,
    finishedAt: now,
    elapsed: Math.max(0, now - task.createdAt),
  })
  return true
}

export function scheduleOpenAIWatchdog(
  ctx: TaskRecoveryContext,
  taskId: string,
  timeoutSeconds: number,
  profile?: TimeoutStreamingHintProfile | null,
) {
  clearOpenAIWatchdogTimer(taskId)
  const task = ctx.getTasks().find((item) => item.id === taskId)
  if (!task || !isRunningOpenAITask(task)) return

  const timeoutMs = Math.max(0, timeoutSeconds * 1000)
  const remainingMs = Math.max(0, timeoutMs - (Date.now() - task.createdAt))
  const timer = setTimeout(() => {
    openAIWatchdogTimers.delete(taskId)
    const failed = failOpenAITaskIfStillRunning(ctx, taskId, createOpenAITimeoutError(timeoutSeconds, profile))
    if (failed) ctx.showToast('OpenAI 任务请求超时', 'error')
  }, remainingMs)
  openAIWatchdogTimers.set(taskId, timer)
}

function clearFalRecoveryTimer(taskId: string) {
  const timer = falRecoveryTimers.get(taskId)
  if (timer) clearTimeout(timer)
  falRecoveryTimers.delete(taskId)
}

function clearCustomRecoveryTimer(taskId: string) {
  const timer = customRecoveryTimers.get(taskId)
  if (timer) clearTimeout(timer)
  customRecoveryTimers.delete(taskId)
}

export function scheduleFalRecovery(ctx: TaskRecoveryContext, taskId: string, delayMs = FAL_RECOVERY_POLL_MS) {
  if (falRecoveryTimers.has(taskId)) return
  const timer = setTimeout(() => {
    falRecoveryTimers.delete(taskId)
    void recoverFalTask(ctx, taskId)
  }, delayMs)
  falRecoveryTimers.set(taskId, timer)
}

export function scheduleCustomRecovery(ctx: TaskRecoveryContext, taskId: string, delayMs = CUSTOM_RECOVERY_POLL_MS) {
  if (customRecoveryTimers.has(taskId)) return
  const timer = setTimeout(() => {
    customRecoveryTimers.delete(taskId)
    void recoverCustomTask(ctx, taskId)
  }, delayMs)
  customRecoveryTimers.set(taskId, timer)
}

async function recoverFalTask(ctx: TaskRecoveryContext, taskId: string) {
  const settings = ctx.getSettings()
  const task = ctx.getTasks().find((item) => item.id === taskId)
  if (!task || task.apiProvider !== 'fal' || !task.falRequestId || !task.falEndpoint || task.status === 'done') return

  const profile = getFalRecoveryProfile(settings, task)
  if (!profile) {
    scheduleFalRecovery(ctx, taskId)
    return
  }

  try {
    const result = await getFalQueuedImageResult(profile, task.falEndpoint, task.falRequestId, task.params)
    clearFalRecoveryTimer(taskId)
    await ctx.completeRecoveredFalTask(task, result)
  } catch (err) {
    if (isTaskConnectionRecoverableError(err)) {
      scheduleFalRecovery(ctx, taskId)
      return
    }

    clearFalRecoveryTimer(taskId)
    const rawPayload = getRawErrorPayload(err)
    const errorMessage = getFalErrorMessage(err) ?? (err instanceof Error ? err.message : String(err))
    ctx.updateTask(taskId, {
      status: 'error',
      error: errorMessage,
      ...rawPayload,
      errorDebug: createTaskErrorDebug(task, errorMessage, rawPayload),
      falRecoverable: false,
      finishedAt: Date.now(),
      elapsed: Date.now() - task.createdAt,
    })
  }
}

async function recoverCustomTask(ctx: TaskRecoveryContext, taskId: string) {
  const settings = ctx.getSettings()
  const task = ctx.getTasks().find((item) => item.id === taskId)
  if (!task || !task.customTaskId || task.status === 'done') return

  const profile = getCustomRecoveryProfile(settings, task)
  const customProvider = task.apiProvider ? getCustomProviderDefinition(settings, task.apiProvider) : null
  if (!profile || !customProvider?.poll) {
    scheduleCustomRecovery(ctx, taskId)
    return
  }

  try {
    const result = await getCustomQueuedImageResult(profile, customProvider, task.customTaskId, task.params)
    clearCustomRecoveryTimer(taskId)
    await ctx.completeRecoveredCustomTask(task, result)
  } catch (err) {
    clearCustomRecoveryTimer(taskId)
    const rawPayload = getRawErrorPayload(err)
    const errorMessage = err instanceof Error ? err.message : String(err)
    ctx.updateTask(taskId, {
      status: 'error',
      error: errorMessage,
      ...rawPayload,
      errorDebug: createTaskErrorDebug(task, errorMessage, rawPayload),
      customRecoverable: false,
      finishedAt: Date.now(),
      elapsed: Date.now() - task.createdAt,
    })
  }
}
