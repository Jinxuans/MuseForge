import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  TaskRecord,
} from './types'
import {
  putTask as dbPutTask,
  deleteTask as dbDeleteTask,
  replaceAgentConversations as replaceAgentConversationsInDb,
  putServerAsset,
  deleteImage,
  storeImage,
} from './lib/db'
import { getErrorToastMessage } from './store/errorMessages'
import { cacheImage, deleteCachedImageState, ensureImageCached, ensureImageThumbnailCached, getCachedImage, scheduleThumbnailBackfill, subscribeImageThumbnail } from './store/images/imageCache'
import { deleteAgentRoundFromConversation, getActiveAgentRounds, getAgentBranchLeafId, getAgentSiblingRounds, remapAgentRoundMentionsForPathChange } from './store/agent/agentRounds'
import { getPersistableTask } from './store/tasks/taskPersistence'
import { isImageReferencedByState } from './store/images/imageReferences'
import { createStoreAgentActions } from './store/orchestration/agentActions'
import { createStoreBackendSyncActions } from './store/orchestration/backendSyncActions'
import { createStoreDataPortabilityActions } from './store/orchestration/dataPortabilityActions'
import { createStoreImageLifecycleActions } from './store/orchestration/imageLifecycleActions'
import { createStoreInitAction } from './store/orchestration/initStoreActions'
import { connectStorePersistenceBridge, createStorePersistenceBridge } from './store/orchestration/persistenceBridge'
import { createRootStoreSlice } from './store/orchestration/rootStoreSlice'
import { createStoreTaskActions } from './store/orchestration/taskActions'
import { createStoreTaskCleanupActions } from './store/orchestration/taskCleanupActions'
import { createTaskStoreUpdates } from './store/orchestration/taskStoreUpdates'
import type { ExportOptions } from './services/dataPortability'
import type { AppState, SettingsTab } from './store/appState'
import { migratePersistedState } from './store/persistence/persistedState'
import { UNCATEGORIZED_CATEGORY_ID } from './lib/categories'
export { migratePersistedState } from './store/persistence/persistedState'
export { ensureImageCached, ensureImageThumbnailCached, getCachedImage, subscribeImageThumbnail } from './store/images/imageCache'
export { getErrorToastMessage } from './store/errorMessages'
export { deleteAgentRoundFromConversation, getActiveAgentRounds, getAgentBranchLeafId, getAgentRoundPath, getAgentSiblingRounds, remapAgentRoundMentionsForPathChange } from './store/agent/agentRounds'
export { cleanStaleAgentInputDrafts } from './store/agent/agentInputDrafts'
export { getCodexCliPromptKey, getTaskApiProfile, markInterruptedOpenAIRunningTasks } from './store/tasks/taskDomain'
export { canCancelQueuedServerTask } from './store/tasks/backendTaskExecution'
export type { AppState, SettingsTab } from './store/appState'
export type { ClearOptions, ImportOptions } from './store/persistence/dataPortabilityActions'
export type { ExportOptions }

const agentConversationPersistenceBridge = createStorePersistenceBridge({
  replaceAgentConversations: replaceAgentConversationsInDb,
  uncategorizedCategoryId: UNCATEGORIZED_CATEGORY_ID,
})

export function getPersistedState(state: AppState) {
  return agentConversationPersistenceBridge.getPersistedState(state)
}

const replaceStoredAgentConversations = agentConversationPersistenceBridge.replaceStoredAgentConversations

function mergePersistedState(persistedState: unknown, currentState: AppState): AppState {
  return agentConversationPersistenceBridge.mergePersistedState(persistedState, currentState)
}

const taskStoreUpdates = createTaskStoreUpdates({
  getState: () => useStore.getState(),
  putTask,
  setState: (patch) => useStore.setState(patch),
})

const skipSupportPromptForImportedData = taskStoreUpdates.skipSupportPromptForImportedData
const showSupportPromptForExistingLocalData = taskStoreUpdates.showSupportPromptForExistingLocalData
export const updateTaskInStore = taskStoreUpdates.updateTaskInStore

const taskCleanupActions = createStoreTaskCleanupActions({
  deleteImage,
  deleteTask: dbDeleteTask,
  getState: () => useStore.getState(),
  putTask,
  setState: (patch) => useStore.setState(patch),
})

const deleteUnreferencedImageIds = taskCleanupActions.deleteUnreferencedImageIds

const imageLifecycleActions = createStoreImageLifecycleActions({
  cacheImage,
  deleteCachedImageState,
  deleteImage,
  deleteUnreferencedImageIds,
  getState: () => useStore.getState(),
  isImageReferencedByState,
  storeImage,
  updateTask: updateTaskInStore,
})

export const deleteImageIfUnreferenced = imageLifecycleActions.deleteImageIfUnreferenced
const persistTaskStreamPartialImage = imageLifecycleActions.persistTaskStreamPartialImage

export const useStore = create<AppState>()(
  persist(
    (set, get) => createRootStoreSlice(set, get, {
      openApiSettings: () => useStore.getState().setShowSettings(true, 'api'),
      deleteImageIfUnreferenced,
      putTask,
    }),
    {
      name: 'museforge',
      version: 2,
      migrate: (persistedState) => migratePersistedState(persistedState),
      partialize: getPersistedState,
      merge: mergePersistedState,
    },
  ),
)

connectStorePersistenceBridge(agentConversationPersistenceBridge, {
  getState: () => useStore.getState(),
  setState: (patch) => useStore.setState(patch),
}, useStore.subscribe)

const finalizeAgentConversationPersistence = agentConversationPersistenceBridge.finalizeAgentConversationPersistence

// ===== Actions =====

function putTask(task: TaskRecord): Promise<IDBValidKey> {
  return dbPutTask(getPersistableTask(task))
}

const dataPortabilityActions = createStoreDataPortabilityActions({
  getState: () => useStore.getState(),
  setState: (patch) => useStore.setState(patch),
  putTask,
  replaceStoredAgentConversations,
  scheduleThumbnailBackfill,
  skipSupportPromptForImportedData,
  uncategorizedCategoryId: UNCATEGORIZED_CATEGORY_ID,
})

export const clearData = dataPortabilityActions.clearData
export const exportData = dataPortabilityActions.exportData
export const importData = dataPortabilityActions.importData
export const addImageFromFile = dataPortabilityActions.addImageFromFile
export const createInputImageFromFile = dataPortabilityActions.createInputImageFromFile
export const addImageFromUrl = dataPortabilityActions.addImageFromUrl

const taskActions = createStoreTaskActions({
  cacheImage,
  deleteUnreferencedImageIds,
  ensureImageCached,
  getState: () => useStore.getState(),
  persistTaskStreamPartialImage,
  putServerAsset,
  putTask,
  storeImage,
  uncategorizedCategoryId: UNCATEGORIZED_CATEGORY_ID,
  updateTask: updateTaskInStore,
})

const createTaskExecutionContext = taskActions.createTaskExecutionContext
const scheduleFalRecovery = taskActions.scheduleFalRecovery
const scheduleCustomRecovery = taskActions.scheduleCustomRecovery
const executeTask = taskActions.executeTask
export const submitTask = taskActions.submitTask
export const cancelQueuedServerTask = taskActions.cancelQueuedServerTask
export const retryTask = taskActions.retryTask
export const reuseConfig = taskActions.reuseConfig
export const editOutputs = taskActions.editOutputs

const backendSyncActions = createStoreBackendSyncActions({
  deleteUnreferencedImageIds,
  getState: () => useStore.getState(),
  putTask,
})

export const moveTasksToCategory = taskCleanupActions.moveTasksToCategory
export const moveTasksToTrash = taskCleanupActions.moveTasksToTrash
export const restoreTasksFromTrash = taskCleanupActions.restoreTasksFromTrash
export const removeMultipleTasks = taskCleanupActions.removeMultipleTasks
export const removeTask = taskCleanupActions.removeTask
export const emptyTrash = taskCleanupActions.emptyTrash
export const cleanupExpiredTrashTasks = taskCleanupActions.cleanupExpiredTrashTasks

export const showCodexCliPrompt = taskActions.showCodexCliPrompt

export const initStore = createStoreInitAction({
  backendSyncActions,
  cleanupExpiredTrashTasks,
  finalizeAgentConversationPersistence,
  getState: () => useStore.getState(),
  putTask,
  replaceStoredAgentConversations,
  scheduleCustomRecovery,
  scheduleFalRecovery,
  setState: (patch) => useStore.setState(patch),
  showSupportPromptForExistingLocalData,
})

const agentActions = createStoreAgentActions({
  createTaskExecutionContext,
  getState: () => useStore.getState(),
  persistTaskStreamPartialImage,
  setState: (patch) => useStore.setState(patch),
  updateTask: updateTaskInStore,
})

export const stopAgentResponse = agentActions.stopAgentResponse
export const submitAgentMessage = agentActions.submitAgentMessage
export const regenerateAgentAssistantMessage = agentActions.regenerateAgentAssistantMessage
