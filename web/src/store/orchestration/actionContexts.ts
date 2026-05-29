import type { BackendSyncContext } from '../../services/backendSync'
import type { TaskCleanupContext } from '../../services/taskCleanup'
import type { TaskExecutionContext } from '../../services/taskExecutionContext'
import type { StoredImage, TaskRecord } from '../../types'
import type { AppState } from '../appState'

type StoreSetState = (patch: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void

type TaskExecutionContextFactoryDeps = {
  cacheImage: (id: string, dataUrl: string) => void
  ensureImageCached: TaskExecutionContext['ensureImageCached']
  getState: () => AppState
  persistTaskStreamPartialImage: TaskExecutionContext['persistTaskStreamPartialImage']
  putServerAsset: TaskExecutionContext['putServerAsset']
  putTask: TaskExecutionContext['putTask']
  storeImage: (dataUrl: string, source?: NonNullable<StoredImage['source']>) => Promise<string>
  updateTask: TaskExecutionContext['updateTask']
}

export function createTaskExecutionContextFactory({
  cacheImage,
  ensureImageCached,
  getState,
  persistTaskStreamPartialImage,
  putServerAsset,
  putTask,
  storeImage,
  updateTask,
}: TaskExecutionContextFactoryDeps) {
  return function createTaskExecutionContext(): TaskExecutionContext {
    return {
      ensureImageCached,
      storeGeneratedImage: async (dataUrl) => {
        const imageId = await storeImage(dataUrl, 'generated')
        cacheImage(imageId, dataUrl)
        return imageId
      },
      putServerAsset,
      putTask,
      prependTask: (task) => getState().setTasks([task, ...getState().tasks]),
      updateTask,
      getTask: (taskId) => getState().tasks.find((item) => item.id === taskId),
      getTaskByToolCallId: (toolCallId) => getState().tasks.find((task) => task.agentToolCallId === toolCallId),
      setTaskStreamPreview: (taskId, image, requestIndex) => getState().setTaskStreamPreview(taskId, image, requestIndex),
      persistTaskStreamPartialImage,
      showToast: (message, type = 'info') => getState().showToast(message, type),
    }
  }
}

type BackendSyncContextFactoryDeps = {
  deleteUnreferencedImageIds: BackendSyncContext['deleteUnreferencedImageIds']
  getState: () => AppState
  putTask: BackendSyncContext['putTask']
}

export function createBackendSyncContextFactory({
  deleteUnreferencedImageIds,
  getState,
  putTask,
}: BackendSyncContextFactoryDeps) {
  return function createBackendSyncContext(): BackendSyncContext {
    const state = getState()
    return {
      settings: state.settings,
      tasks: state.tasks,
      setTasks: state.setTasks,
      putTask,
      deleteUnreferencedImageIds,
    }
  }
}

type TaskCleanupContextFactoryDeps = {
  deleteImage: TaskCleanupContext['deleteImage']
  deleteTask: TaskCleanupContext['deleteTask']
  getState: () => AppState
  putTask: TaskCleanupContext['putTask']
  setState: StoreSetState
}

export function createTaskCleanupContextFactory({
  deleteImage,
  deleteTask,
  getState,
  putTask,
  setState,
}: TaskCleanupContextFactoryDeps) {
  return function createTaskCleanupContext(): TaskCleanupContext {
    const state = getState()
    return {
      tasks: state.tasks,
      inputImages: state.inputImages,
      galleryInputDraft: state.galleryInputDraft,
      agentConversations: state.agentConversations,
      agentInputDrafts: state.agentInputDrafts,
      selectedTaskIds: state.selectedTaskIds,
      setTasks: state.setTasks,
      setAgentConversations: (agentConversations) => setState({ agentConversations }),
      setMoveCategoryTaskIds: (updater) => setState((current) => ({ moveCategoryTaskIds: updater(current.moveCategoryTaskIds) })),
      setSelectedTaskIds: state.setSelectedTaskIds,
      putTask,
      deleteTask,
      deleteImage,
      showToast: state.showToast,
    }
  }
}
