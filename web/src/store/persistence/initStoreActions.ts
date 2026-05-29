import type { TaskRecord } from '../../types'
import { getAllAgentConversations, getAllTasks } from '../../lib/db'
import {
  cleanupBootstrapImageReferences,
  restorePersistedAgentInputDrafts,
  restorePersistedGalleryDraft,
  restorePersistedInputImages,
} from '../../services/storeBootstrap'
import type { AppState } from '../appState'
import {
  cleanStaleAgentInputDrafts,
  normalizeAgentInputDrafts,
  restoreAgentInputDraftState,
  restoreGalleryInputDraftState,
} from '../agent/agentInputDrafts'
import {
  mergeAgentConversationsForStorage,
  normalizeAgentConversations,
} from '../agent/agentConversationPersistence'
import { getPersistableTask } from '../tasks/taskPersistence'
import { markInterruptedOpenAIRunningTasks } from '../tasks/taskDomain'

type StoreSetState = (patch: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void

type InitStoreState = Pick<
  AppState,
  | 'agentConversations'
  | 'activeAgentConversationId'
  | 'setTasks'
  | 'inputImages'
  | 'galleryInputDraft'
  | 'agentInputDrafts'
  | 'setInputImages'
  | 'appMode'
>

type BackendSyncActions = {
  syncBackendTasksToStore: () => Promise<void>
  syncBackendAssetsToLocalCache: () => Promise<void>
}

type InitStoreDeps = {
  backendSyncActions: BackendSyncActions
  cleanupExpiredTrashTasks: () => Promise<number>
  finalizeAgentConversationPersistence: () => Promise<void>
  getState: () => InitStoreState
  putTask: (task: TaskRecord) => Promise<unknown>
  replaceStoredAgentConversations: (conversations: AppState['agentConversations']) => Promise<void>
  scheduleCustomRecovery: (taskId: string, delayMs?: number) => void
  scheduleFalRecovery: (taskId: string, delayMs?: number) => void
  setState: StoreSetState
  showSupportPromptForExistingLocalData: (tasks: TaskRecord[]) => void
}

export function createInitStoreAction({
  backendSyncActions,
  cleanupExpiredTrashTasks,
  finalizeAgentConversationPersistence,
  getState,
  putTask,
  replaceStoredAgentConversations,
  scheduleCustomRecovery,
  scheduleFalRecovery,
  setState,
  showSupportPromptForExistingLocalData,
}: InitStoreDeps) {
  return async function initStore() {
    const legacyAgentConversations = normalizeAgentConversations(getState().agentConversations)
    const storedTasks = await getAllTasks()
    const storedAgentConversations = normalizeAgentConversations(await getAllAgentConversations())
    let loadedAgentConversations = mergeAgentConversationsForStorage(storedAgentConversations, legacyAgentConversations)
    const currentAgentConversations = normalizeAgentConversations(getState().agentConversations)
    loadedAgentConversations = mergeAgentConversationsForStorage(loadedAgentConversations, currentAgentConversations)
    const activeAgentConversationId = getState().activeAgentConversationId && loadedAgentConversations.some((conversation) => conversation.id === getState().activeAgentConversationId)
      ? getState().activeAgentConversationId
      : loadedAgentConversations[0]?.id ?? null

    if (loadedAgentConversations.length > 0 || legacyAgentConversations.length > 0) {
      setState((state) => {
        const agentInputDrafts = cleanStaleAgentInputDrafts(
          normalizeAgentInputDrafts(state.agentInputDrafts, loadedAgentConversations),
          activeAgentConversationId,
        )
        return {
          agentConversations: loadedAgentConversations,
          agentConversationsLoaded: true,
          activeAgentConversationId,
          agentInputDrafts,
          ...(state.appMode === 'agent' ? restoreAgentInputDraftState(agentInputDrafts, activeAgentConversationId) : {}),
        }
      })
      await replaceStoredAgentConversations(loadedAgentConversations)
    } else {
      setState({ agentConversationsLoaded: true })
    }

    await finalizeAgentConversationPersistence()

    const { tasks: markedTasks, interruptedTasks } = markInterruptedOpenAIRunningTasks(storedTasks)
    const interruptedTaskIds = new Set(interruptedTasks.map((task) => task.id))
    const tasks = markedTasks.map(getPersistableTask)
    await Promise.all(tasks
      .filter((task, index) => interruptedTaskIds.has(task.id) || task.rawResponsePayload !== markedTasks[index]?.rawResponsePayload)
      .map((task) => putTask(task)))

    getState().setTasks(tasks)
    void backendSyncActions.syncBackendTasksToStore()
    void backendSyncActions.syncBackendAssetsToLocalCache()
    void cleanupExpiredTrashTasks()
    showSupportPromptForExistingLocalData(tasks)

    for (const task of tasks) {
      if (
        task.apiProvider === 'fal' &&
        task.falRequestId &&
        task.falEndpoint &&
        (task.status === 'running' || task.falRecoverable)
      ) {
        scheduleFalRecovery(task.id, 0)
      }
      if (
        task.customTaskId &&
        (task.status === 'running' || task.customRecoverable)
      ) {
        scheduleCustomRecovery(task.id, 0)
      }
    }

    const state = getState()
    const persistedInputImages = state.inputImages
    const galleryInputDraft = state.galleryInputDraft
    const agentConversations = state.agentConversations
    const agentInputDrafts = state.agentInputDrafts
    await cleanupBootstrapImageReferences({ inputImages: persistedInputImages, galleryInputDraft, agentConversations, agentInputDrafts, tasks })

    const { restoredImages: restoredInputImages, changed: inputImagesChanged } = await restorePersistedInputImages(persistedInputImages)
    if (inputImagesChanged) {
      getState().setInputImages(restoredInputImages)
    }

    const { draft: restoredGalleryDraft, changed: galleryDraftsChanged } = await restorePersistedGalleryDraft(galleryInputDraft)
    if (galleryDraftsChanged) {
      const latestState = getState()
      setState({
        galleryInputDraft: restoredGalleryDraft,
        ...(latestState.appMode === 'gallery'
          ? restoreGalleryInputDraftState(restoredGalleryDraft)
          : {}),
      })
    }

    const { restoredDrafts: restoredAgentInputDrafts, changed: agentDraftsChanged } = await restorePersistedAgentInputDrafts(agentInputDrafts)
    if (agentDraftsChanged) {
      const latestState = getState()
      setState({
        agentInputDrafts: restoredAgentInputDrafts,
        ...(latestState.appMode === 'agent'
          ? restoreAgentInputDraftState(restoredAgentInputDrafts, latestState.activeAgentConversationId)
          : {}),
      })
    }
  }
}
