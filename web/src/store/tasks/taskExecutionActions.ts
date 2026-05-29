import type { ApiProfile, TaskRecord } from '../../types'
import { getActiveApiProfile } from '../../lib/apiProfiles'
import { IMAGE_FETCH_CORS_HINT } from '../../lib/imageApiShared'
import { executeBackendTask as executeBackendTaskInService } from '../../services/backendTaskExecution'
import { runImageApiTaskRequest, saveImageApiTaskSuccess } from '../../services/imageApiTaskExecution'
import type { TaskExecutionContext } from '../../services/taskExecutionContext'
import { clearOpenAIWatchdogTimer, isTaskConnectionRecoverableError } from '../../services/taskRecovery'
import { getBackendCapabilitiesCached, getTaskExecutionErrorMessage, shouldUseBackendTaskExecution } from './backendTaskExecution'
import { deleteCachedImage } from '../images/imageCache'
import type { AppState } from '../appState'
import { createTaskErrorDebug, getApiRequestNetworkErrorHint, getRawErrorPayload } from './taskErrorDebug'
import { createSettingsForApiProfile, getTaskApiProfile, isAsyncCustomProviderTask } from './taskDomain'

type TaskExecutionActionState = Pick<
  AppState,
  | 'settings'
  | 'tasks'
  | 'setTaskStreamPreview'
  | 'maskDraft'
  | 'clearMaskDraft'
  | 'setDetailTaskId'
>

type TaskExecutionActionsDeps = {
  createTaskExecutionContext: () => TaskExecutionContext
  deleteUnreferencedImageIds: (imageIds: Iterable<string>) => Promise<void>
  getState: () => TaskExecutionActionState
  scheduleCustomRecovery: (taskId: string, delayMs?: number) => void
  scheduleFalRecovery: (taskId: string, delayMs?: number) => void
  scheduleOpenAIWatchdog: (taskId: string, timeoutSeconds: number, profile?: ApiProfile | null) => void
  showCodexCliPrompt: (force?: boolean, reason?: string) => void
  updateTask: (taskId: string, patch: Partial<TaskRecord>) => void
}

export function createTaskExecutionActions({
  createTaskExecutionContext,
  deleteUnreferencedImageIds,
  getState,
  scheduleCustomRecovery,
  scheduleFalRecovery,
  scheduleOpenAIWatchdog,
  showCodexCliPrompt,
  updateTask,
}: TaskExecutionActionsDeps) {
  async function executeBackendTask(taskId: string, task: TaskRecord, profile: ApiProfile) {
    await executeBackendTaskInService(createTaskExecutionContext(), taskId, task, profile)
  }

  async function executeTask(taskId: string) {
    const { settings } = getState()
    const task = getState().tasks.find((item) => item.id === taskId)
    if (!task) return

    const taskProfile = getTaskApiProfile(settings, task)
    if (!taskProfile && task.apiProfileId) {
      updateTask(taskId, {
        status: 'error',
        error: '找不到此任务所使用的 API 配置。',
        falRecoverable: false,
        customRecoverable: false,
        finishedAt: Date.now(),
        elapsed: Date.now() - task.createdAt,
      })
      return
    }

    const activeProfile = taskProfile ?? getActiveApiProfile(settings)
    const requestSettings = createSettingsForApiProfile(settings, activeProfile)
    const taskProvider = task.apiProvider ?? activeProfile.provider
    let falRequestInfo: { requestId: string; endpoint: string } | null = task.falRequestId && task.falEndpoint
      ? { requestId: task.falRequestId, endpoint: task.falEndpoint }
      : null
    let customTaskInfo: { taskId: string } | null = task.customTaskId
      ? { taskId: task.customTaskId }
      : null

    if (taskProvider !== 'fal' && !isAsyncCustomProviderTask(requestSettings, taskProvider, task.inputImageIds.length > 0)) {
      scheduleOpenAIWatchdog(taskId, activeProfile.timeout, activeProfile)
    }

    try {
      const backendCapabilities = await getBackendCapabilitiesCached()
      if (shouldUseBackendTaskExecution(activeProfile, task, backendCapabilities)) {
        await executeBackendTask(taskId, task, activeProfile)
        return
      }

      const requestResult = await runImageApiTaskRequest(createTaskExecutionContext(), taskId, task, requestSettings, customTaskInfo)
      const { result, maskDataUrl } = requestResult
      falRequestInfo = requestResult.falRequestInfo
      customTaskInfo = requestResult.customTaskInfo
      const isAsyncCustomTask = taskProvider !== 'fal' && taskProvider !== 'openai' && Boolean(customTaskInfo)
      const success = await saveImageApiTaskSuccess(createTaskExecutionContext(), taskId, task, result, {
        taskProvider,
        isAsyncCustomTask,
      })
      if (!success.saved) {
        getState().setTaskStreamPreview(taskId)
        return
      }

      if (taskProvider === 'openai' && activeProfile.apiMode === 'responses' && !activeProfile.codexCli) {
        if (success.promptWasRevised) {
          showCodexCliPrompt()
        } else if (!success.hasRevisedPromptValue) {
          showCodexCliPrompt(false, '接口没有返回官方 API 会返回的部分信息')
        }
      }

      clearOpenAIWatchdogTimer(taskId)
      getState().setTaskStreamPreview(taskId)
      void deleteUnreferencedImageIds(success.partialImageIdsToClean)
      const currentMask = getState().maskDraft
      if (
        maskDataUrl &&
        currentMask &&
        currentMask.targetImageId === task.maskTargetImageId &&
        currentMask.maskDataUrl === maskDataUrl
      ) {
        getState().clearMaskDraft()
      }
    } catch (err) {
      clearOpenAIWatchdogTimer(taskId)
      const latestTask = getState().tasks.find((item) => item.id === taskId) ?? task
      if (latestTask.status !== 'running') return
      getState().setTaskStreamPreview(taskId)
      const latestFalRequestInfo = falRequestInfo ?? (latestTask.falRequestId && latestTask.falEndpoint
        ? { requestId: latestTask.falRequestId, endpoint: latestTask.falEndpoint }
        : null)
      const latestCustomTaskInfo = customTaskInfo ?? (latestTask.customTaskId ? { taskId: latestTask.customTaskId } : null)
      if (latestTask.apiProvider === 'fal' && latestFalRequestInfo && isTaskConnectionRecoverableError(err)) {
        updateTask(taskId, {
          status: 'error',
          error: '与 fal.ai 的连接已断开，之后会继续查询任务结果。',
          falRequestId: latestFalRequestInfo.requestId,
          falEndpoint: latestFalRequestInfo.endpoint,
          falRecoverable: true,
          finishedAt: Date.now(),
          elapsed: Date.now() - task.createdAt,
        })
        scheduleFalRecovery(taskId)
      } else if (latestCustomTaskInfo && isTaskConnectionRecoverableError(err)) {
        updateTask(taskId, {
          status: 'error',
          error: '与自定义异步任务的连接已断开，之后会继续查询任务结果。',
          customTaskId: latestCustomTaskInfo.taskId,
          customRecoverable: true,
          finishedAt: Date.now(),
          elapsed: Date.now() - task.createdAt,
        })
        scheduleCustomRecovery(taskId)
      } else {
        let errorMessage = getTaskExecutionErrorMessage(err)
        const settings = getState().settings
        const profile = getTaskApiProfile(settings, latestTask)
        const usesApiProxy = profile?.apiProxy ?? settings.apiProxy
        const activeProfile = getActiveApiProfile(settings)
        const hintProfile = profile ?? {
          provider: latestTask.apiProvider ?? activeProfile.provider,
          apiMode: settings.apiMode,
          streamImages: activeProfile.streamImages,
          streamPartialImages: activeProfile.streamPartialImages,
        }
        const networkErrorHint = getApiRequestNetworkErrorHint(err, latestTask.createdAt, usesApiProxy, hintProfile)
        if (networkErrorHint && !errorMessage.includes(IMAGE_FETCH_CORS_HINT)) {
          errorMessage += `\n${networkErrorHint}`
        }
        const rawPayload = getRawErrorPayload(err)
        updateTask(taskId, {
          status: 'error',
          error: errorMessage,
          ...rawPayload,
          errorDebug: createTaskErrorDebug(latestTask, errorMessage, rawPayload),
          falRecoverable: false,
          customRecoverable: false,
          finishedAt: Date.now(),
          elapsed: Date.now() - task.createdAt,
        })
        getState().setDetailTaskId(taskId)
      }
    } finally {
      for (const imgId of task.inputImageIds) {
        deleteCachedImage(imgId)
      }
    }
  }

  return { executeTask }
}
