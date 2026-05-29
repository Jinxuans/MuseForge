import type { StoredImage, TaskRecord } from '../../types'
import type { TaskExecutionContext } from '../../services/taskExecutionContext'
import { createTaskExecutionActions } from '../tasks/taskExecutionActions'
import { createTaskRecoveryActions } from '../tasks/taskRecoveryActions'
import { createTaskReuseActions } from '../tasks/taskReuseActions'
import { createSubmitTaskAction, type SubmitTaskOptions } from '../tasks/taskSubmissionActions'
import { createSupportPromptActions } from '../tasks/supportPromptActions'
import { createTaskExecutionContextFactory } from './actionContexts'
import type { AppState } from '../appState'

type StoreTaskActionsDeps = {
  cacheImage: (id: string, dataUrl: string) => void
  deleteUnreferencedImageIds: (imageIds: Iterable<string>) => Promise<void>
  ensureImageCached: (id: string) => Promise<string | null | undefined>
  getState: () => AppState
  persistTaskStreamPartialImage: (taskId: string, dataUrl: string) => Promise<unknown> | unknown
  putServerAsset: TaskExecutionContext['putServerAsset']
  putTask: (task: TaskRecord) => Promise<unknown>
  storeImage: (dataUrl: string, source?: NonNullable<StoredImage['source']>) => Promise<string>
  uncategorizedCategoryId: string
  updateTask: (taskId: string, patch: Partial<TaskRecord>) => void
}

export function createStoreTaskActions({
  cacheImage,
  deleteUnreferencedImageIds,
  ensureImageCached,
  getState,
  persistTaskStreamPartialImage,
  putServerAsset,
  putTask,
  storeImage,
  uncategorizedCategoryId,
  updateTask,
}: StoreTaskActionsDeps) {
  const createTaskExecutionContext = createTaskExecutionContextFactory({
    cacheImage,
    ensureImageCached,
    getState,
    persistTaskStreamPartialImage,
    putServerAsset,
    putTask,
    storeImage,
    updateTask,
  })

  let taskExecutionActions!: ReturnType<typeof createTaskExecutionActions>

  async function executeTask(taskId: string) {
    await taskExecutionActions.executeTask(taskId)
  }

  const submitTaskAction = createSubmitTaskAction({
    createTaskExecutionContext,
    executeTask,
    getState,
    uncategorizedCategoryId,
  })

  function submitTask(options: SubmitTaskOptions = {}) {
    return submitTaskAction(options)
  }

  const taskReuseActions = createTaskReuseActions({
    createTaskExecutionContext,
    executeTask,
    getState,
    submitTask,
  })

  const taskRecoveryActions = createTaskRecoveryActions({
    createTaskExecutionContext,
    getState,
    updateTask,
  })

  const supportPromptActions = createSupportPromptActions({
    getState,
  })

  const showCodexCliPrompt = supportPromptActions.showCodexCliPrompt
  const scheduleOpenAIWatchdog = taskRecoveryActions.scheduleOpenAIWatchdog
  const scheduleFalRecovery = taskRecoveryActions.scheduleFalRecovery
  const scheduleCustomRecovery = taskRecoveryActions.scheduleCustomRecovery

  taskExecutionActions = createTaskExecutionActions({
    createTaskExecutionContext,
    deleteUnreferencedImageIds,
    getState,
    scheduleCustomRecovery,
    scheduleFalRecovery,
    scheduleOpenAIWatchdog,
    showCodexCliPrompt,
    updateTask,
  })

  return {
    cancelQueuedServerTask: taskReuseActions.cancelQueuedServerTask,
    createTaskExecutionContext,
    editOutputs: taskReuseActions.editOutputs,
    executeTask,
    retryTask: taskReuseActions.retryTask,
    reuseConfig: taskReuseActions.reuseConfig,
    scheduleCustomRecovery,
    scheduleFalRecovery,
    showCodexCliPrompt,
    submitTask,
  }
}
