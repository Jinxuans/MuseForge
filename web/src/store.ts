import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  AgentConversation,
  AgentMessage,
  AgentRound,
  ApiProfile,
  AppSettings,
  InputImage,
  MaskDraft,
  TaskParams,
  TaskRecord,
  ResponsesOutputItem,
} from './types'
import { DEFAULT_AGENT_MAX_TOOL_ROUNDS, DEFAULT_PARAMS } from './types'
import { DEFAULT_SETTINGS, getActiveApiProfile, mergeImportedSettings, normalizeSettings, validateApiProfile } from './lib/apiProfiles'
import { dismissAllTooltips } from './lib/tooltipDismiss'
import {
  getAllTasks,
  putTask as dbPutTask,
  deleteTask as dbDeleteTask,
  getAllAgentConversations,
  replaceAgentConversations,
  getImage,
  putServerAsset,
  deleteImage,
  storeImage,
} from './lib/db'
import { callAgentResponsesApi } from './lib/agentApi'
import { extractAgentReferenceIds } from './lib/agentImageReferences'
import { IMAGE_FETCH_CORS_HINT } from './lib/imageApiShared'
import { normalizeParamsForSettings } from './lib/paramCompatibility'
import { getErrorToastMessage } from './store/errorMessages'
import { cacheImage, deleteCachedImage, deleteCachedImageState, ensureImageCached, ensureImageThumbnailCached, getCachedImage, scheduleThumbnailBackfill, subscribeImageThumbnail } from './store/imageCache'
import { appendAgentAssistantMessageDelta, appendRegeneratedAgentRound, attachTaskToAgentRound, completeAgentRoundInConversation, deleteAgentRoundFromConversation, ensureStreamingAssistantMessage, failAgentRoundInConversation, getActiveAgentRounds, getAgentBranchLeafId, getAgentRoundPath, getAgentSiblingRounds, remapAgentRoundMentionsForPathChange, restartErroredAgentRound, setAgentRoundResponseOutput, stopAgentRoundInConversation, submitAgentRoundToConversation, updateAgentConversationTitleIfUnchanged } from './store/agentRounds'
import { getPersistableResponseOutputItem, mergeAgentConversationsForStorage, mergeImportedAgentConversations, normalizeAgentConversations } from './store/agentConversationPersistence'
import { getBackendCapabilitiesCached, getTaskExecutionErrorMessage, shouldUseBackendTaskExecution } from './store/backendTaskExecution'
import { createStoredInputImageFromFile, createStoredInputImageFromUrl } from './store/fileData'
import { getPersistableTask } from './store/taskPersistence'
import { createTaskErrorDebug, getApiRequestNetworkErrorHint, getRawErrorPayload } from './store/taskErrorDebug'
import {
  addInputImageToDraftState,
  cleanStaleAgentInputDrafts,
  clearInputImagesFromDraftState,
  moveInputImageInDraftState,
  normalizeAgentInputDrafts,
  removeInputImageFromDraftState,
  replaceInputImageInDraftState,
  restoreAgentInputDraftState,
  restoreGalleryInputDraftState,
  setInputImagesInDraftState,
  setMaskDraftInDraftState,
  syncActiveInputDraft,
  type AgentInputDraft,
} from './store/agentInputDrafts'
import { isImageReferencedByState } from './store/imageReferences'
import { countResponseToolCalls, mergeResponseOutputItems } from './store/agentResponseOutput'
import { buildAgentApiInput, buildAgentContinuationInput, createAgentBatchImagesInputItem, resolveAgentReferenceImages } from './store/agentApiInputItems'
import { createSettingsForApiProfile, getCodexCliPromptKey, getExistingLocalDataSupportPromptPatch, getImportedDataSupportPromptPatch, getReusedTaskApiProfile, getTaskApiProfile, getTaskApiProfileName, isAsyncCustomProviderTask, markInterruptedOpenAIRunningTasks, shouldOpenSupportPromptForTaskUpdate, setTaskListState, updateTaskListItem, renameTaskCategory, clearTaskCategory } from './store/taskDomain'
import { addCategoryToList, addPromptLibraryItem, createCategoryListItem, createPromptLibraryItem, deleteCategoryFromList, deletePromptLibraryItemFromList, getActiveCategoryAfterDelete, mergeCategoryLists, mergePromptLibraryLists, normalizeCategories as normalizeCategoriesValue, renameCategoryInList, updatePromptLibraryItemInList } from './store/userCollectionNormalizers'
import { createAgentConversationTitle, renameAgentConversationInList, setAgentConversationActiveRound } from './store/agentConversationDomain'
import { createActiveAgentConversationState, createAgentConversationState, deleteAgentConversationState, getActiveAgentConversationOrCreate } from './store/agentConversationActionsDomain'
import { canEnterAgentMode, createAgentModeState, createNonAgentModeState, getAgentModeUnavailableDialog } from './store/appModeDomain'
import { AGENT_STOPPED_MESSAGE, createAgentAbortError, getAgentRoundControllerKey, uniqueIds } from './store/agentRuntimeDomain'
import { genId, resolveSelectedTaskIds, setTaskStreamPreviewInState, toggleTaskSelectionInList } from './store/shared'
import { createSettingsPatch } from './store/settingsDomain'
import { createLightboxState, createSettingsVisibilityState, dismissSupportPromptState, resolveMoveCategoryTaskIds } from './store/uiDomain'
import { clearToastIfCurrent, createActiveCategoryState, createAgentAssetPanelCollapsedState, createAgentAssetTabState, createAgentEditingConversationState, createAgentEditingRoundState, createAgentMobileHeaderVisibleState, createAgentSidebarCollapsedState, createConfirmDialogState, createDetailTaskState, createFilterFavoriteState, createFilterStatusState, createPromptLibraryVisibilityState, createReusedTaskApiProfileState, createSearchQueryState, createSquareShareTargetState, createTaskViewState, createToastState, setParamsInState } from './store/simpleActionDomain'
import { cancelQueuedBackendTask, completeAgentImageTask as completeAgentImageTaskInService, completeRecoveredCustomTask as completeRecoveredCustomTaskInService, completeRecoveredFalTask as completeRecoveredFalTaskInService, createCompletedAgentImageTask, createRetryTask, createSubmittedGalleryTask, ensureStreamingAgentTask as ensureStreamingAgentTaskInService, executeBackendTask as executeBackendTaskInService, persistTaskInputImages, runImageApiTaskRequest, saveImageApiTaskSuccess, type TaskExecutionContext } from './services/taskExecution'
import { syncBackendAssetsToLocalCache as syncBackendAssetsToLocalCacheInService, syncBackendTasksToStore as syncBackendTasksToStoreInService, type BackendSyncContext } from './services/backendSync'
import { clearLocalDataStorage, createExportDataZip, importDataFromZip, type ClearDataOptions, type DataImportOptions, type ExportOptions } from './services/dataPortability'
import { executeBatchImageFunctionCall, generateAgentConversationTitle as generateAgentConversationTitleInService } from './services/agentRuntime'
import { cleanupExpiredTrashTasks as cleanupExpiredTrashTasksInService, deleteUnreferencedImageIds as deleteUnreferencedImageIdsInService, emptyTrash as emptyTrashInService, moveTasksToCategory as moveTasksToCategoryInService, moveTasksToTrash as moveTasksToTrashInService, permanentlyDeleteTasks as permanentlyDeleteTasksInService, restoreTasksFromTrash as restoreTasksFromTrashInService, type TaskCleanupContext } from './services/taskCleanup'
import { cleanupBootstrapImageReferences, restorePersistedAgentInputDrafts, restorePersistedGalleryDraft, restorePersistedInputImages } from './services/storeBootstrap'
import { collectTaskOutputInputImages, prepareTaskReuse } from './services/taskReuse'
import { clearOpenAIWatchdogTimer, isTaskConnectionRecoverableError, scheduleCustomRecovery as scheduleCustomRecoveryInService, scheduleFalRecovery as scheduleFalRecoveryInService, scheduleOpenAIWatchdog as scheduleOpenAIWatchdogInService, type TaskRecoveryContext } from './services/taskRecovery'
import type { AppState, SettingsTab } from './store/appState'
import { getPersistableAgentConversation, getPersistedState as getPersistedStateInService, mergePersistedState as mergePersistedStateInService, migratePersistedState } from './store/persistedState'
export { migratePersistedState } from './store/persistedState'
export { ensureImageCached, ensureImageThumbnailCached, getCachedImage, subscribeImageThumbnail } from './store/imageCache'
export { getErrorToastMessage } from './store/errorMessages'
export { deleteAgentRoundFromConversation, getActiveAgentRounds, getAgentBranchLeafId, getAgentRoundPath, getAgentSiblingRounds, remapAgentRoundMentionsForPathChange } from './store/agentRounds'
export { cleanStaleAgentInputDrafts } from './store/agentInputDrafts'
export { getCodexCliPromptKey, getTaskApiProfile, markInterruptedOpenAIRunningTasks } from './store/taskDomain'
export { canCancelQueuedServerTask } from './store/backendTaskExecution'
export type { AppState, SettingsTab } from './store/appState'
export type { ExportOptions }
export type ImportOptions = DataImportOptions

const agentRoundControllers = new Map<string, AbortController>()
let agentConversationPersistenceReady = false
let agentConversationMigrationPending = false
const UNCATEGORIZED_CATEGORY_ID = '__uncategorized__'

function skipSupportPromptForImportedData(tasks: TaskRecord[]) {
  useStore.setState((state) => getImportedDataSupportPromptPatch(tasks, state))
}

function showSupportPromptForExistingLocalData(tasks: TaskRecord[]) {
  useStore.setState((state) => getExistingLocalDataSupportPromptPatch(tasks, state))
}

function maybeOpenSupportPrompt(previousTasks: TaskRecord[], nextTasks: TaskRecord[], taskId: string) {
  const state = useStore.getState()
  if (shouldOpenSupportPromptForTaskUpdate(previousTasks, nextTasks, taskId, state)) {
    useStore.setState({ supportPromptOpen: true })
  }
}

function normalizeCategories(value: unknown) {
  return normalizeCategoriesValue(value, UNCATEGORIZED_CATEGORY_ID)
}

export function getPersistedState(state: AppState) {
  return getPersistedStateInService(state, {
    includeAgentConversations: agentConversationMigrationPending && !agentConversationPersistenceReady,
  })
}

async function replaceStoredAgentConversations(conversations: AgentConversation[]) {
  await replaceAgentConversations(conversations.map(getPersistableAgentConversation))
}

function mergePersistedState(persistedState: unknown, currentState: AppState): AppState {
  return mergePersistedStateInService(persistedState, currentState, {
    includeAgentConversations: agentConversationMigrationPending && !agentConversationPersistenceReady,
    uncategorizedCategoryId: UNCATEGORIZED_CATEGORY_ID,
    onAgentConversationMigrationPending: () => {
      agentConversationMigrationPending = true
    },
  })
}

export async function deleteImageIfUnreferenced(imageId: string) {
  deleteCachedImageState(imageId)
  if (isImageReferencedByState(useStore.getState(), imageId)) return
  try {
    await deleteImage(imageId)
  } catch {
    // 清理是内存/存储优化，失败不影响替换结果。
  }
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Mode
      appMode: 'gallery',
      setAppMode: (appMode) => {
        if (appMode === 'gallery' || appMode === 'square') {
          set((state) => createNonAgentModeState(state, appMode))
          return
        }

        const state = get()
        const settings = normalizeSettings(state.settings)
        const activeProfile = getActiveApiProfile(settings)

        if (canEnterAgentMode(activeProfile)) {
          set((state) => createAgentModeState(state))
          return
        }

        state.setConfirmDialog(getAgentModeUnavailableDialog(activeProfile, () => {
          useStore.getState().setShowSettings(true, 'api')
        }))
      },

      // Settings
      settings: { ...DEFAULT_SETTINGS },
      setSettings: (s) => set((st) => createSettingsPatch(st.settings, s, st.reusedTaskApiProfileId)),
      dismissedCodexCliPrompts: [],
      dismissCodexCliPrompt: (key) => set((st) => ({
        dismissedCodexCliPrompts: st.dismissedCodexCliPrompts.includes(key)
          ? st.dismissedCodexCliPrompts
          : [...st.dismissedCodexCliPrompts, key],
      })),

      // Input
      prompt: '',
      setPrompt: (prompt) => set((s) => syncActiveInputDraft(s, { prompt })),
      inputImages: [],
      addInputImage: (img) => set((s) => addInputImageToDraftState(s, img)),
      replaceInputImage: (idx, img) => {
        let removedImageId: string | null = null
        set((s) => {
          const result = replaceInputImageInDraftState(s, idx, img)
          removedImageId = result.removedImageId
          return result.patch
        })
        if (removedImageId) void deleteImageIfUnreferenced(removedImageId)
      },
      removeInputImage: (idx) => set((s) => removeInputImageFromDraftState(s, idx)),
      clearInputImages: () =>
        set((s) => {
          for (const img of s.inputImages) deleteCachedImage(img.id)
          return clearInputImagesFromDraftState(s)
        }),
      setInputImages: (imgs, options) => set((s) => setInputImagesInDraftState(s, imgs, options)),
      moveInputImage: (fromIdx, toIdx) => set((s) => moveInputImageInDraftState(s, fromIdx, toIdx)),
      maskDraft: null,
      setMaskDraft: (maskDraft) => set((s) => setMaskDraftInDraftState(s, maskDraft)),
      clearMaskDraft: () => set((s) => syncActiveInputDraft(s, { maskDraft: null })),
      maskEditorImageId: null,
      setMaskEditorImageId: (maskEditorImageId) => {
        if (maskEditorImageId) dismissAllTooltips()
        set((s) => syncActiveInputDraft(s, { maskEditorImageId }))
      },
      galleryInputDraft: null,

      // Params
      params: { ...DEFAULT_PARAMS },
      setParams: (p) => set((s) => setParamsInState(s, p)),
      reusedTaskApiProfileId: null,
      reusedTaskApiProfileName: null,
      reusedTaskApiProfileMissing: false,
      setReusedTaskApiProfile: (profileId, missing = false, profileName = null) => set(createReusedTaskApiProfileState(profileId, missing, profileName)),

      // Agent
      agentConversations: [],
      agentConversationsLoaded: false,
      activeAgentConversationId: null,
      agentInputDrafts: {},
      agentSidebarCollapsed: true,
      agentAssetTab: 'outputs',
      agentAssetPanelCollapsed: false,
      agentMobileHeaderVisible: false,
      agentEditingRoundId: null,
      agentEditingConversationId: null,
      agentGeneratingTitleIds: {},
      createAgentConversation: () => {
        const result = createAgentConversationState(get(), genId)
        set(result.patch)
        return result.conversationId
      },
      setActiveAgentConversationId: (id) => set((state) => createActiveAgentConversationState(state, id)),
      setActiveAgentRoundId: (conversationId, roundId) => set((state) => ({
        agentConversations: setAgentConversationActiveRound(state.agentConversations, conversationId, roundId),
      })),
      renameAgentConversation: (id, title) => set((state) => ({ agentConversations: renameAgentConversationInList(state.agentConversations, id, title) })),
      deleteAgentConversation: (id) => set((state) => deleteAgentConversationState(state, id)),
      setAgentSidebarCollapsed: (agentSidebarCollapsed) => set(createAgentSidebarCollapsedState(agentSidebarCollapsed)),
      setAgentAssetTab: (agentAssetTab) => set(createAgentAssetTabState(agentAssetTab)),
      setAgentAssetPanelCollapsed: (agentAssetPanelCollapsed) => set(createAgentAssetPanelCollapsedState(agentAssetPanelCollapsed)),
      setAgentMobileHeaderVisible: (agentMobileHeaderVisible) => set(createAgentMobileHeaderVisibleState(agentMobileHeaderVisible)),
      setAgentEditingRoundId: (agentEditingRoundId) => set(createAgentEditingRoundState(agentEditingRoundId)),
      setAgentEditingConversationId: (agentEditingConversationId) => set(createAgentEditingConversationState(agentEditingConversationId)),

      // Tasks
      tasks: [],
      setTasks: (tasks) => set(() => setTaskListState(tasks)),
      streamPreviews: {},
      streamPreviewSlots: {},
      setTaskStreamPreview: (taskId, image, requestIndex = 0) => set((s) => setTaskStreamPreviewInState(s, taskId, image, requestIndex)),

      // Search & Filter
      searchQuery: '',
      setSearchQuery: (searchQuery) => set(createSearchQueryState(searchQuery)),
      filterStatus: 'all',
      setFilterStatus: (filterStatus) => set(createFilterStatusState(filterStatus)),
      filterFavorite: false,
      setFilterFavorite: (filterFavorite) => set(createFilterFavoriteState(filterFavorite)),
      taskView: 'gallery',
      setTaskView: (taskView) => set(createTaskViewState(taskView)),
      categories: [],
      activeCategoryId: 'all',
      setActiveCategoryId: (activeCategoryId) => set(createActiveCategoryState(activeCategoryId)),
      addCategory: (name) => {
        const category = createCategoryListItem(genId(), name)
        if (!category) return null
        set((state) => ({
          categories: addCategoryToList(state.categories, category),
          activeCategoryId: category.id,
        }))
        return category.id
      },
      renameCategory: (id, name) => {
        const trimmed = name.trim()
        if (!trimmed) return
        set((state) => ({
          categories: renameCategoryInList(state.categories, id, trimmed),
          tasks: renameTaskCategory(state.tasks, id, trimmed),
        }))
        for (const task of useStore.getState().tasks.filter((item) => item.categoryId === id)) void putTask(task)
      },
      deleteCategory: (id) => {
        set((state) => ({
          categories: deleteCategoryFromList(state.categories, id),
          activeCategoryId: getActiveCategoryAfterDelete(state.activeCategoryId, id),
          tasks: clearTaskCategory(state.tasks, id),
        }))
        for (const task of useStore.getState().tasks.filter((item) => item.categoryId == null && item.categoryName == null)) void putTask(task)
      },
      moveCategoryTaskIds: null,
      setMoveCategoryTaskIds: (moveCategoryTaskIds) => {
        if (moveCategoryTaskIds?.length) dismissAllTooltips()
        set({ moveCategoryTaskIds: resolveMoveCategoryTaskIds(moveCategoryTaskIds) })
      },

      // Prompt library
      promptLibrary: [],
      showPromptLibrary: false,
      setShowPromptLibrary: (showPromptLibrary) => {
        if (showPromptLibrary) dismissAllTooltips()
        set(createPromptLibraryVisibilityState(showPromptLibrary))
      },
      savePromptToLibrary: (content, title) => {
        const item = createPromptLibraryItem(genId(), content, title)
        if (!item) return
        set((state) => ({ promptLibrary: addPromptLibraryItem(state.promptLibrary, item) }))
      },
      updatePromptLibraryItem: (id, patch) => set((state) => ({
        promptLibrary: updatePromptLibraryItemInList(state.promptLibrary, id, patch),
      })),
      deletePromptLibraryItem: (id) => set((state) => ({
        promptLibrary: deletePromptLibraryItemFromList(state.promptLibrary, id),
      })),
      shareToSquareTarget: null,
      setShareToSquareTarget: (shareToSquareTarget) => {
        if (shareToSquareTarget) dismissAllTooltips()
        set(createSquareShareTargetState(shareToSquareTarget))
      },

      // Selection
      selectedTaskIds: [],
      setSelectedTaskIds: (updater) => set((s) => ({
        selectedTaskIds: resolveSelectedTaskIds(updater, s.selectedTaskIds)
      })),
      toggleTaskSelection: (id, force) => set((s) => ({
        selectedTaskIds: toggleTaskSelectionInList(s.selectedTaskIds, id, force)
      })),
      clearSelection: () => set({ selectedTaskIds: [] }),

      // UI
      detailTaskId: null,
      setDetailTaskId: (detailTaskId) => {
        if (detailTaskId) dismissAllTooltips()
        set(createDetailTaskState(detailTaskId))
      },
      lightboxImageId: null,
      lightboxImageList: [],
      setLightboxImageId: (lightboxImageId, list) => {
        if (lightboxImageId) dismissAllTooltips()
        set(createLightboxState(lightboxImageId, list))
      },
      showSettings: false,
      settingsTabRequest: null,
      setShowSettings: (showSettings, settingsTabRequest) => {
        if (showSettings) dismissAllTooltips()
        set(createSettingsVisibilityState(showSettings, settingsTabRequest))
      },
      supportPromptOpen: false,
      supportPromptDismissed: false,
      supportPromptSkippedForImportedData: false,
      setSupportPromptOpen: (supportPromptOpen) => set({ supportPromptOpen }),
      dismissSupportPrompt: () => set(dismissSupportPromptState()),

      // Toast
      toast: null,
      showToast: (message, type = 'info') => {
        const { toast } = createToastState(message, type)
        set({ toast })
        setTimeout(() => {
          set((s) => clearToastIfCurrent(s, toast))
        }, 3000)
      },

      // Confirm
      confirmDialog: null,
      setConfirmDialog: (confirmDialog) => {
        if (confirmDialog) dismissAllTooltips()
        set(createConfirmDialogState(confirmDialog))
      },
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

let lastStoredAgentConversations = useStore.getState().agentConversations
let agentConversationPersistRunning = false
let agentConversationPersistQueued = false

async function flushAgentConversationsToIndexedDB() {
  if (agentConversationPersistRunning) {
    agentConversationPersistQueued = true
    return
  }

  agentConversationPersistRunning = true
  try {
    do {
      agentConversationPersistQueued = false
      const conversations = useStore.getState().agentConversations
      await replaceStoredAgentConversations(conversations)
      lastStoredAgentConversations = conversations
    } while (agentConversationPersistQueued || useStore.getState().agentConversations !== lastStoredAgentConversations)
  } finally {
    agentConversationPersistRunning = false
  }
}

useStore.subscribe((state) => {
  if (state.agentConversations === lastStoredAgentConversations) return
  if (!agentConversationPersistenceReady) {
    agentConversationPersistQueued = true
    return
  }
  void flushAgentConversationsToIndexedDB()
})

// ===== Actions =====

function putTask(task: TaskRecord): Promise<IDBValidKey> {
  return dbPutTask(getPersistableTask(task))
}

function createTaskExecutionContext(): TaskExecutionContext {
  return {
    ensureImageCached,
    storeGeneratedImage: async (dataUrl) => {
      const imageId = await storeImage(dataUrl, 'generated')
      cacheImage(imageId, dataUrl)
      return imageId
    },
    putServerAsset,
    putTask,
    prependTask: (task) => useStore.getState().setTasks([task, ...useStore.getState().tasks]),
    updateTask: updateTaskInStore,
    getTask: (taskId) => useStore.getState().tasks.find((item) => item.id === taskId),
    getTaskByToolCallId: (toolCallId) => useStore.getState().tasks.find((task) => task.agentToolCallId === toolCallId),
    setTaskStreamPreview: (taskId, image, requestIndex) => useStore.getState().setTaskStreamPreview(taskId, image, requestIndex),
    persistTaskStreamPartialImage,
    showToast: (message, type = 'info') => useStore.getState().showToast(message, type),
  }
}

function createBackendSyncContext(): BackendSyncContext {
  const state = useStore.getState()
  return {
    settings: state.settings,
    tasks: state.tasks,
    setTasks: state.setTasks,
    putTask,
    deleteUnreferencedImageIds,
  }
}

function createTaskCleanupContext(): TaskCleanupContext {
  const state = useStore.getState()
  return {
    tasks: state.tasks,
    inputImages: state.inputImages,
    galleryInputDraft: state.galleryInputDraft,
    agentConversations: state.agentConversations,
    agentInputDrafts: state.agentInputDrafts,
    selectedTaskIds: state.selectedTaskIds,
    setTasks: state.setTasks,
    setAgentConversations: (agentConversations) => useStore.setState({ agentConversations }),
    setMoveCategoryTaskIds: (updater) => useStore.setState((current) => ({ moveCategoryTaskIds: updater(current.moveCategoryTaskIds) })),
    setSelectedTaskIds: state.setSelectedTaskIds,
    putTask,
    deleteTask: dbDeleteTask,
    deleteImage,
    showToast: state.showToast,
  }
}

function createTaskRecoveryContext(): TaskRecoveryContext {
  return {
    getSettings: () => useStore.getState().settings,
    getTasks: () => useStore.getState().tasks,
    updateTask: updateTaskInStore,
    completeRecoveredFalTask: (task, result) => completeRecoveredFalTaskInService(createTaskExecutionContext(), task, result),
    completeRecoveredCustomTask: (task, result) => completeRecoveredCustomTaskInService(createTaskExecutionContext(), task, result),
    showToast: (message, type = 'info') => useStore.getState().showToast(message, type),
  }
}

function scheduleOpenAIWatchdog(taskId: string, timeoutSeconds: number, profile?: ApiProfile | null) {
  scheduleOpenAIWatchdogInService(createTaskRecoveryContext(), taskId, timeoutSeconds, profile)
}

export function showCodexCliPrompt(force = false, reason = '接口返回的提示词已被改写') {
  const state = useStore.getState()
  const settings = state.settings
  const promptKey = getCodexCliPromptKey(settings)
  if (!force && (settings.codexCli || state.dismissedCodexCliPrompts.includes(promptKey))) return

  state.setConfirmDialog({
    title: '检测到 Codex CLI API',
    message: `${reason}，当前 API 来源很可能是 Codex CLI。\n\n是否开启 Codex CLI 兼容模式？开启后会禁用在此处无效的质量参数，并在 Images API 多图生成时使用并发请求，解决该 API 数量参数无效的问题。同时，提示词文本开头会加入简短的不改写要求，避免模型重写提示词，偏离原意。`,
    confirmText: '开启',
    action: () => {
      const state = useStore.getState()
      state.dismissCodexCliPrompt(promptKey)
      state.setSettings({ codexCli: true })
    },
    cancelAction: () => useStore.getState().dismissCodexCliPrompt(promptKey),
  })
}

function scheduleFalRecovery(taskId: string, delayMs?: number) {
  scheduleFalRecoveryInService(createTaskRecoveryContext(), taskId, delayMs)
}

function scheduleCustomRecovery(taskId: string, delayMs?: number) {
  scheduleCustomRecoveryInService(createTaskRecoveryContext(), taskId, delayMs)
}

/** 初始化：从 IndexedDB 加载任务，按需恢复输入图片，并清理孤立图片 */
export async function initStore() {
  const legacyAgentConversations = normalizeAgentConversations(useStore.getState().agentConversations)
  const storedTasks = await getAllTasks()
  const storedAgentConversations = normalizeAgentConversations(await getAllAgentConversations())
  let loadedAgentConversations = mergeAgentConversationsForStorage(storedAgentConversations, legacyAgentConversations)
  const currentAgentConversations = normalizeAgentConversations(useStore.getState().agentConversations)
  loadedAgentConversations = mergeAgentConversationsForStorage(loadedAgentConversations, currentAgentConversations)
  const activeAgentConversationId = useStore.getState().activeAgentConversationId && loadedAgentConversations.some((conversation) => conversation.id === useStore.getState().activeAgentConversationId)
    ? useStore.getState().activeAgentConversationId
    : loadedAgentConversations[0]?.id ?? null
  if (loadedAgentConversations.length > 0 || legacyAgentConversations.length > 0) {
    useStore.setState((state) => {
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
    useStore.setState({ agentConversationsLoaded: true })
  }
  const shouldRewritePersistedLocalState = agentConversationMigrationPending
  agentConversationPersistenceReady = true
  agentConversationMigrationPending = false
  if (agentConversationPersistQueued || useStore.getState().agentConversations !== lastStoredAgentConversations) {
    await flushAgentConversationsToIndexedDB()
  }
  if (shouldRewritePersistedLocalState) {
    useStore.setState({})
  }
  const { tasks: markedTasks, interruptedTasks } = markInterruptedOpenAIRunningTasks(storedTasks)
  const interruptedTaskIds = new Set(interruptedTasks.map((task) => task.id))
  const tasks = markedTasks.map(getPersistableTask)
  await Promise.all(tasks
    .filter((task, index) => interruptedTaskIds.has(task.id) || task.rawResponsePayload !== markedTasks[index]?.rawResponsePayload)
    .map((task) => putTask(task)))
  useStore.getState().setTasks(tasks)
  void syncBackendTasksToStore()
  void syncBackendAssetsToLocalCache()
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

  const state = useStore.getState()
  const persistedInputImages = state.inputImages
  const galleryInputDraft = state.galleryInputDraft
  const agentConversations = state.agentConversations
  const agentInputDrafts = state.agentInputDrafts
  await cleanupBootstrapImageReferences({ inputImages: persistedInputImages, galleryInputDraft, agentConversations, agentInputDrafts, tasks })

  const { restoredImages: restoredInputImages, changed: inputImagesChanged } = await restorePersistedInputImages(persistedInputImages)
  if (inputImagesChanged) {
    useStore.getState().setInputImages(restoredInputImages)
  }

  const { draft: restoredGalleryDraft, changed: galleryDraftsChanged } = await restorePersistedGalleryDraft(galleryInputDraft)
  if (galleryDraftsChanged) {
    const latestState = useStore.getState()
    useStore.setState({
      galleryInputDraft: restoredGalleryDraft,
      ...(latestState.appMode === 'gallery'
        ? restoreGalleryInputDraftState(restoredGalleryDraft)
        : {}),
    })
  }

  const { restoredDrafts: restoredAgentInputDrafts, changed: agentDraftsChanged } = await restorePersistedAgentInputDrafts(agentInputDrafts)
  if (agentDraftsChanged) {
    const latestState = useStore.getState()
    useStore.setState({
      agentInputDrafts: restoredAgentInputDrafts,
      ...(latestState.appMode === 'agent'
        ? restoreAgentInputDraftState(restoredAgentInputDrafts, latestState.activeAgentConversationId)
        : {}),
    })
  }
}

async function syncBackendTasksToStore() {
  await syncBackendTasksToStoreInService(createBackendSyncContext())
}

async function syncBackendAssetsToLocalCache() {
  await syncBackendAssetsToLocalCacheInService(createBackendSyncContext())
}

export async function submitTask(options: { allowFullMask?: boolean; useCurrentApiProfileWhenReusedMissing?: boolean } = {}) {
  const { settings, prompt, inputImages, maskDraft, params, reusedTaskApiProfileId, reusedTaskApiProfileName, reusedTaskApiProfileMissing, activeCategoryId, categories, showToast, setConfirmDialog } =
    useStore.getState()

  const normalizedSettings = normalizeSettings(settings)
  let activeProfile = getActiveApiProfile(settings)
  let requestSettings = createSettingsForApiProfile(normalizedSettings, activeProfile)
  if (normalizedSettings.reuseTaskApiProfileTemporarily && (reusedTaskApiProfileId || reusedTaskApiProfileMissing)) {
    const reusedProfile = getReusedTaskApiProfile(normalizedSettings, reusedTaskApiProfileId)
    if (!reusedProfile) {
      if (options.useCurrentApiProfileWhenReusedMissing) {
        useStore.getState().setReusedTaskApiProfile(null)
      } else {
        setConfirmDialog({
          title: '找不到 API 配置',
      message: `找不到复用任务所使用的 API 配置「${reusedTaskApiProfileName || '未知配置'}」，要使用当前的 API 配置「${activeProfile.name}」提交任务吗？`,
      confirmText: '使用当前配置提交',
      cancelText: '放弃提交',
      action: () => {
        void submitTask({ ...options, useCurrentApiProfileWhenReusedMissing: true })
      },
        })
        return
      }
    } else {
      activeProfile = reusedProfile
      requestSettings = createSettingsForApiProfile(normalizedSettings, reusedProfile)
    }
  }

  if (validateApiProfile(activeProfile)) {
    showToast(`请先完善请求 API 配置：${validateApiProfile(activeProfile)}`, 'error')
    useStore.getState().setShowSettings(true)
    return
  }

  if (!prompt.trim()) {
    showToast('请输入提示词', 'error')
    return
  }

  const taskId = genId()
  const prepared = await createSubmittedGalleryTask(createTaskExecutionContext(), {
    taskId,
    prompt,
    params,
    inputImages,
    maskDraft,
    activeProfile,
    requestSettings,
    categories,
    activeCategoryId,
    uncategorizedCategoryId: UNCATEGORIZED_CATEGORY_ID,
    allowFullMask: options.allowFullMask,
  })

  if (prepared.status === 'full-mask') {
    setConfirmDialog({
      title: '确认编辑整张图片？',
      message: '当前遮罩覆盖了整张图片，提交后可能会重绘全部内容。是否继续？',
      confirmText: '继续提交',
      tone: 'warning',
      action: () => {
        void submitTask({ allowFullMask: true })
      },
    })
    return
  }

  if (prepared.status === 'error') {
    if (prepared.clearMaskDraft) useStore.getState().clearMaskDraft()
    showToast(prepared.message, 'error')
    return
  }

  if (Object.keys(prepared.normalizedParamPatch).length) {
    useStore.getState().setParams(prepared.normalizedParamPatch)
  }
  useStore.getState().showToast('任务已提交', 'success')

  if (settings.clearInputAfterSubmit) {
    useStore.getState().setPrompt('')
    useStore.getState().clearInputImages()
  }
  useStore.getState().setReusedTaskApiProfile(null)

  // 异步调用 API
  executeTask(taskId)
}

function getActiveAgentConversation(): AgentConversation {
  const state = useStore.getState()
  return getActiveAgentConversationOrCreate(
    state.agentConversations,
    state.activeAgentConversationId,
    state.createAgentConversation,
    () => useStore.getState().agentConversations,
  )
}

function updateAgentConversation(conversationId: string, updater: (conversation: AgentConversation) => AgentConversation) {
  useStore.setState((state) => ({
    agentConversations: state.agentConversations.map((conversation) =>
      conversation.id === conversationId ? updater(conversation) : conversation,
    ),
  }))
}

function markAgentRoundTasksStopped(conversationId: string, roundId: string, now = Date.now()) {
  const runningTasks = useStore.getState().tasks.filter((task) =>
    task.status === 'running' &&
    task.agentConversationId === conversationId &&
    task.agentRoundId === roundId,
  )

  for (const task of runningTasks) {
    updateTaskInStore(task.id, {
      status: 'error',
      error: AGENT_STOPPED_MESSAGE,
      falRecoverable: false,
      customRecoverable: false,
      finishedAt: now,
      elapsed: Math.max(0, now - task.createdAt),
    })
  }
  return runningTasks.length > 0
}

function markAgentRoundStopped(conversationId: string, roundId: string) {
  const now = Date.now()
  const stoppedTasks = markAgentRoundTasksStopped(conversationId, roundId, now)
  let stoppedRound = false
  updateAgentConversation(conversationId, (current) => {
    const result = stopAgentRoundInConversation(current, roundId, now)
    stoppedRound = result.stopped
    return result.conversation
  })
  return stoppedRound || stoppedTasks
}

function appendAgentAssistantMessageContent(conversationId: string, messageId: string, delta: string) {
  if (!delta) return
  updateAgentConversation(conversationId, (current) => appendAgentAssistantMessageDelta(current, messageId, delta))
}

async function generateAgentConversationTitle(
  conversationId: string,
  prompt: string,
  inputImageIds: string[],
  requestSettings: AppSettings,
  activeProfile: ApiProfile,
  fallbackTitle: string,
) {
  useStore.setState((state) => {
    const next = { ...state.agentGeneratingTitleIds, [conversationId]: true as const }
    return { agentGeneratingTitleIds: next }
  })
  try {
    const title = await generateAgentConversationTitleInService({
      settings: requestSettings,
      profile: activeProfile,
      prompt,
      inputImageIds,
      fallbackTitle,
    })
    if (!title) return

    updateAgentConversation(conversationId, (current) =>
      updateAgentConversationTitleIfUnchanged(current, prompt, fallbackTitle, title),
    )
  } catch {
    // Title generation is best-effort; keep the local fallback title on failure.
  } finally {
    useStore.setState((state) => {
      const next = { ...state.agentGeneratingTitleIds }
      delete next[conversationId]
      return { agentGeneratingTitleIds: next }
    })
  }
}

export function stopAgentResponse(conversationId = useStore.getState().activeAgentConversationId) {
  if (!conversationId) return
  const conversation = useStore.getState().agentConversations.find((item) => item.id === conversationId)
  if (!conversation) return
  const activeRunningRound = [...getActiveAgentRounds(conversation)].reverse().find((round) => round.status === 'running')
  const runningRound = activeRunningRound ?? conversation.rounds.find((round) => round.status === 'running')
  if (!runningRound) return

  const controller = agentRoundControllers.get(getAgentRoundControllerKey(conversationId, runningRound.id))
  if (controller) {
    controller.abort()
    if (markAgentRoundStopped(conversationId, runningRound.id)) {
      useStore.getState().showToast('已停止生成', 'info')
    }
    return
  }

  markAgentRoundStopped(conversationId, runningRound.id)
  useStore.getState().showToast('已停止生成', 'info')
}


async function deleteUnreferencedImageIds(imageIds: Iterable<string>) {
  await deleteUnreferencedImageIdsInService(createTaskCleanupContext(), imageIds)
}

async function persistTaskStreamPartialImage(taskId: string, dataUrl: string) {
  try {
    const imgId = await storeImage(dataUrl, 'generated')
    cacheImage(imgId, dataUrl)

    const latestTask = useStore.getState().tasks.find((task) => task.id === taskId)
    if (!latestTask || latestTask.status === 'done') {
      await deleteUnreferencedImageIds([imgId])
      return
    }

    const currentIds = latestTask.streamPartialImageIds || []
    if (currentIds.includes(imgId)) return
    updateTaskInStore(taskId, { streamPartialImageIds: [...currentIds, imgId] })
  } catch (err) {
    console.error(err)
  }
}

export async function submitAgentMessage() {
  const state = useStore.getState()
  const { settings, prompt, inputImages, maskDraft, params, showToast } = state
  const normalizedSettings = normalizeSettings(settings)
  const activeProfile = getActiveApiProfile(normalizedSettings)

  if (activeProfile.provider !== 'openai' || activeProfile.apiMode !== 'responses') {
    state.setAppMode('agent')
    return
  }

  if (validateApiProfile(activeProfile)) {
    showToast(`请先完善请求 API 配置：${validateApiProfile(activeProfile)}`, 'error')
    state.setShowSettings(true)
    return
  }

  const trimmedPrompt = prompt.trim()
  if (!trimmedPrompt) {
    showToast('请输入消息', 'error')
    return
  }

  const conversation = getActiveAgentConversation()
  if (conversation.rounds.some((round) => round.status === 'running')) {
    showToast('请等待生成完成，或先停止生成', 'info')
    return
  }

  const persistedInputs = await persistTaskInputImages(inputImages, maskDraft, { allowFullMask: true })
  if (persistedInputs.status === 'error') {
    if (persistedInputs.clearMaskDraft) state.clearMaskDraft()
    showToast(persistedInputs.message, 'error')
    return
  }
  if (persistedInputs.status === 'full-mask') return

  const { orderedInputImages, maskImageId, maskTargetImageId } = persistedInputs
  const inputImageIds = uniqueIds(orderedInputImages.map((image) => image.id))

  const requestSettings = createSettingsForApiProfile(normalizedSettings, activeProfile)
  const now = Date.now()
  const editingRound = state.agentEditingRoundId
    ? conversation.rounds.find((item) => item.id === state.agentEditingRoundId) ?? null
    : null
  const editingRoundAssistantMessage = editingRound?.assistantMessageId
    ? conversation.messages.find((message) => message.id === editingRound.assistantMessageId) ?? null
    : conversation.messages.find((message) => message.roundId === editingRound?.id && message.role === 'assistant') ?? null
  const editingRoundHasAssistantMessage = Boolean(editingRoundAssistantMessage)
  const editingRoundHasErrorAssistantMessage = Boolean(
    editingRound?.status === 'error' && editingRoundAssistantMessage?.content.startsWith('请求失败：'),
  )
  const editingRoundHasChildren = editingRound
    ? conversation.rounds.some((round) => (round.parentRoundId ?? null) === editingRound.id)
    : false
  const shouldAppendToEditingRound = Boolean(
    editingRound && !editingRoundHasChildren && (!editingRoundHasAssistantMessage || editingRoundHasErrorAssistantMessage),
  )
  const roundId = shouldAppendToEditingRound && editingRound ? editingRound.id : genId()
  const userMessageId = shouldAppendToEditingRound && editingRound ? editingRound.userMessageId : genId()
  const activeRounds = getActiveAgentRounds(conversation)
  const activeLeafId = activeRounds[activeRounds.length - 1]?.id ?? null
  const parentRoundId = editingRound ? editingRound.parentRoundId ?? null : activeLeafId
  const parentPath = parentRoundId ? getAgentRoundPath(conversation, parentRoundId) : []
  const normalizedParams = {
    ...normalizeParamsForSettings(params, requestSettings, { hasInputImages: inputImageIds.length > 0 }),
    n: DEFAULT_PARAMS.n,
  }
  const round: AgentRound = {
    id: roundId,
    index: shouldAppendToEditingRound && editingRound ? editingRound.index : parentPath.length + 1,
    parentRoundId,
    ...(editingRoundHasErrorAssistantMessage && editingRoundAssistantMessage ? { assistantMessageId: editingRoundAssistantMessage.id } : {}),
    userMessageId,
    prompt: trimmedPrompt,
    inputImageIds,
    maskTargetImageId,
    maskImageId,
    outputTaskIds: [],
    status: 'running',
    error: null,
    createdAt: now,
    finishedAt: null,
  }
  const userMessage: AgentMessage = {
    id: userMessageId,
    role: 'user',
    content: trimmedPrompt,
    roundId,
    inputImageIds,
    maskTargetImageId,
    maskImageId,
    createdAt: now,
  }

  let fallbackTitle: string | null = null
  updateAgentConversation(conversation.id, (current) => {
    const nextTitle = current.rounds.length === 0 ? createAgentConversationTitle(trimmedPrompt, current.title) : current.title
    const result = submitAgentRoundToConversation(current, round, userMessage, {
      nextTitle,
      shouldAppendToEditingRound,
      editingRoundHasErrorAssistantMessage,
      editingAssistantMessageId: editingRoundAssistantMessage?.id,
      now,
    })
    fallbackTitle = result.fallbackTitle
    return result.conversation
  })

  state.setPrompt('')
  state.clearInputImages()
  state.clearMaskDraft()
  state.setAgentEditingRoundId(null)

  if (fallbackTitle) {
    void generateAgentConversationTitle(conversation.id, trimmedPrompt, inputImageIds, requestSettings, activeProfile, fallbackTitle)
  }

  void executeAgentRound(conversation.id, roundId, normalizedParams, requestSettings, activeProfile)
}

export async function regenerateAgentAssistantMessage(conversationId: string, roundId: string) {
  const state = useStore.getState()
  const { settings, params, showToast } = state
  const normalizedSettings = normalizeSettings(settings)
  const activeProfile = getActiveApiProfile(normalizedSettings)

  if (activeProfile.provider !== 'openai' || activeProfile.apiMode !== 'responses') {
    state.setAppMode('agent')
    return
  }

  if (validateApiProfile(activeProfile)) {
    showToast(`请先完善请求 API 配置：${validateApiProfile(activeProfile)}`, 'error')
    state.setShowSettings(true)
    return
  }

  const conversation = state.agentConversations.find((item) => item.id === conversationId)
  const sourceRound = conversation?.rounds.find((item) => item.id === roundId) ?? null
  const sourceUserMessage = sourceRound
    ? conversation?.messages.find((message) => message.id === sourceRound.userMessageId) ?? null
    : null
  if (!conversation || !sourceRound || !sourceUserMessage) {
    showToast('找不到要重新生成的 Agent 消息', 'error')
    return
  }

  if (conversation.rounds.some((round) => round.status === 'running')) {
    showToast('请等待生成完成，或先停止生成', 'info')
    return
  }

  const inputImageIds = uniqueIds(sourceRound.inputImageIds)
  const requestSettings = createSettingsForApiProfile(normalizedSettings, activeProfile)
  const normalizedParams = {
    ...normalizeParamsForSettings(params, requestSettings, { hasInputImages: inputImageIds.length > 0 }),
    n: DEFAULT_PARAMS.n,
  }
  const now = Date.now()
  if (sourceRound.status === 'error') {
    const assistantMessageId = sourceRound.assistantMessageId
      ?? conversation.messages.find((message) => message.roundId === sourceRound.id && message.role === 'assistant')?.id
    updateAgentConversation(conversationId, (current) => restartErroredAgentRound(current, sourceRound.id, assistantMessageId, now))
    state.setAgentEditingRoundId(null)
    void executeAgentRound(conversationId, sourceRound.id, normalizedParams, requestSettings, activeProfile)
    return
  }

  const newRoundId = genId()
  const newUserMessageId = genId()
  const newRound: AgentRound = {
    id: newRoundId,
    index: sourceRound.index,
    parentRoundId: sourceRound.parentRoundId ?? null,
    userMessageId: newUserMessageId,
    prompt: sourceRound.prompt || sourceUserMessage.content.trim(),
    inputImageIds,
    maskTargetImageId: sourceRound.maskTargetImageId ?? sourceUserMessage.maskTargetImageId ?? null,
    maskImageId: sourceRound.maskImageId ?? sourceUserMessage.maskImageId ?? null,
    outputTaskIds: [],
    status: 'running',
    error: null,
    createdAt: now,
    finishedAt: null,
  }
  const newUserMessage: AgentMessage = {
    id: newUserMessageId,
    role: 'user',
    content: sourceUserMessage.content,
    roundId: newRoundId,
    inputImageIds,
    maskTargetImageId: sourceRound.maskTargetImageId ?? sourceUserMessage.maskTargetImageId ?? null,
    maskImageId: sourceRound.maskImageId ?? sourceUserMessage.maskImageId ?? null,
    createdAt: now,
  }

  updateAgentConversation(conversationId, (current) => appendRegeneratedAgentRound(current, newRound, newUserMessage, now))
  state.setAgentEditingRoundId(null)
  void executeAgentRound(conversationId, newRoundId, normalizedParams, requestSettings, activeProfile)
}

async function executeAgentRound(
  conversationId: string,
  roundId: string,
  params: TaskParams,
  requestSettings: AppSettings,
  activeProfile: ApiProfile,
) {
  const startedAt = Date.now()
  const controller = new AbortController()
  const controllerKey = getAgentRoundControllerKey(conversationId, roundId)
  agentRoundControllers.set(controllerKey, controller)
  try {
    const latestState = useStore.getState()
    const conversation = latestState.agentConversations.find((item) => item.id === conversationId)
    if (!conversation) return
    const round = conversation.rounds.find((item) => item.id === roundId)
    const userMessage = round ? conversation.messages.find((message) => message.id === round.userMessageId) : null
    if (!round || !userMessage) return
    const maskDataUrl = round.maskImageId ? await ensureImageCached(round.maskImageId) : undefined
    if (round.maskImageId && !maskDataUrl) throw new Error('遮罩图片已不存在')

    const apiInput = await buildAgentApiInput(conversation, round, latestState.tasks)
    if (controller.signal.aborted) throw createAgentAbortError()
    const existingAssistantMessage = round.assistantMessageId
      ? conversation.messages.find((message) => message.id === round.assistantMessageId) ?? null
      : conversation.messages.find((message) => message.roundId === roundId && message.role === 'assistant') ?? null
    const assistantMessageId = existingAssistantMessage?.id ?? genId()
    const shouldStreamAssistantMessage = activeProfile.streamImages === true
    const streamingTaskIds: string[] = []
    const taskIdByToolCallId = new Map<string, string>()

    const attachTaskToAgentRoundInStore = (taskId: string) => {
      if (streamingTaskIds.includes(taskId)) return
      streamingTaskIds.push(taskId)
      updateAgentConversation(conversationId, (current) => attachTaskToAgentRound(current, roundId, assistantMessageId, taskId))
    }

    const ensureStreamingAgentTask = async (
      toolCallId: string,
      taskPrompt = '',
      inputImageIds = round.inputImageIds ?? [],
      options: { createdAt?: number; agentBatchCallId?: string; maskTargetImageId?: string | null; maskImageId?: string | null } = {},
    ) => {
      return ensureStreamingAgentTaskInService(createTaskExecutionContext(), taskIdByToolCallId, {
        taskId: genId(),
        toolCallId,
        prompt: taskPrompt,
        params,
        profile: activeProfile,
        inputImageIds,
        maskTargetImageId: options.maskTargetImageId !== undefined ? options.maskTargetImageId : round.maskTargetImageId ?? null,
        maskImageId: options.maskImageId !== undefined ? options.maskImageId : round.maskImageId ?? null,
        conversationId,
        roundId,
        assistantMessageId,
        createdAt: options.createdAt ?? Date.now(),
        ...(options.agentBatchCallId ? { agentBatchCallId: options.agentBatchCallId } : {}),
        attachTask: attachTaskToAgentRoundInStore,
      })
    }

    const completeAgentImageTask = async (image: Parameters<typeof completeAgentImageTaskInService>[2], rawResponsePayload?: string) => {
      const toolCallId = image.toolCallId ?? genId()
      const taskId = await ensureStreamingAgentTask(toolCallId)
      return completeAgentImageTaskInService(createTaskExecutionContext(), taskId, image, rawResponsePayload, startedAt)
    }

    if (shouldStreamAssistantMessage) {
      updateAgentConversation(conversationId, (current) => ensureStreamingAssistantMessage(current, roundId, assistantMessageId))
    }
    const maxToolCalls = Number.isFinite(requestSettings.agentMaxToolRounds)
      ? Math.max(1, Math.trunc(requestSettings.agentMaxToolRounds))
      : DEFAULT_AGENT_MAX_TOOL_ROUNDS
    let apiInputForTurn = apiInput
    let accumulatedOutputItems: ResponsesOutputItem[] = []
    let accumulatedText = ''
    const textSegments: string[] = []
    let lastResponseId: string | undefined
    let toolCallsUsed = 0
    let reachedToolLimit = false
    let pendingToolTextSeparator = false

    // Helper: resolve reference image ids to data URLs for batch image calls
    const resolveReferenceImages = async (referenceIds: string[]): Promise<{ dataUrls: string[]; imageIds: string[] }> => {
      const latestConv = useStore.getState().agentConversations.find((item) => item.id === conversationId)
      if (!latestConv) return { dataUrls: [], imageIds: [] }
      return resolveAgentReferenceImages(latestConv, roundId, referenceIds, useStore.getState().tasks)
    }

    // Helper: execute a generate_image_batch function call concurrently
    const executeBatchFunctionCall = async (functionCallItem: ResponsesOutputItem): Promise<string> => {
      const { output, successCount } = await executeBatchImageFunctionCall({
        profile: activeProfile,
        params,
        signal: controller.signal,
        shouldStreamAssistantMessage,
        genId,
        resolveReferenceImages,
        ensureStreamingAgentTask,
        completeAgentImageTask,
        getTaskIdByToolCallId: (toolCallId) => taskIdByToolCallId.get(toolCallId),
        setTaskStreamPreview: (taskId, image, requestIndex) => useStore.getState().setTaskStreamPreview(taskId, image, requestIndex),
        persistTaskStreamPartialImage,
      }, functionCallItem)
      toolCallsUsed += successCount
      return output
    }

    while (true) {
      if (controller.signal.aborted) throw createAgentAbortError()
      const textBeforeResponse = accumulatedText
      let currentResponseOutputItems: ResponsesOutputItem[] = []
      const result = await callAgentResponsesApi({
        settings: requestSettings,
        profile: activeProfile,
        params,
        input: apiInputForTurn,
        maskDataUrl,
        signal: controller.signal,
        onTextDelta: shouldStreamAssistantMessage
          ? (delta) => {
              if (controller.signal.aborted) return
              if (pendingToolTextSeparator && delta && accumulatedText.trim()) {
                accumulatedText += '\n\n'
                appendAgentAssistantMessageContent(conversationId, assistantMessageId, '\n\n')
              }
              pendingToolTextSeparator = false
              accumulatedText += delta
              appendAgentAssistantMessageContent(conversationId, assistantMessageId, delta)
            }
          : undefined,
        onOutputItems: shouldStreamAssistantMessage
          ? (outputItems) => {
              if (controller.signal.aborted) return
              currentResponseOutputItems = outputItems
              updateAgentConversation(conversationId, (current) =>
                setAgentRoundResponseOutput(current, roundId, mergeResponseOutputItems(accumulatedOutputItems, outputItems)),
              )
            }
          : undefined,
        onImageToolStarted: shouldStreamAssistantMessage
          ? async ({ toolCallId }) => {
              if (controller.signal.aborted) return
              await ensureStreamingAgentTask(toolCallId)
            }
          : undefined,
        onImagePartialImage: shouldStreamAssistantMessage
          ? async ({ toolCallId, image, partialImageIndex }) => {
              if (controller.signal.aborted) return
              const taskId = await ensureStreamingAgentTask(toolCallId)
              if (controller.signal.aborted) return
              useStore.getState().setTaskStreamPreview(taskId, image, partialImageIndex)
              if (partialImageIndex === 0 || partialImageIndex == null) {
                void persistTaskStreamPartialImage(taskId, image)
              }
            }
          : undefined,
        onImageToolCompleted: shouldStreamAssistantMessage
          ? async (image) => {
              if (controller.signal.aborted) return
              await completeAgentImageTask(image)
            }
          : undefined,
      })
      if (controller.signal.aborted) throw createAgentAbortError()

      lastResponseId = result.responseId ?? lastResponseId
      currentResponseOutputItems = currentResponseOutputItems.length ? currentResponseOutputItems : result.outputItems ?? []
      accumulatedOutputItems = mergeResponseOutputItems(accumulatedOutputItems, currentResponseOutputItems)

      const responseText = result.text.trim()
      if (responseText && accumulatedText === textBeforeResponse) {
        const textToAppend = accumulatedText ? `\n\n${responseText}` : responseText
        accumulatedText += textToAppend
        if (shouldStreamAssistantMessage) appendAgentAssistantMessageContent(conversationId, assistantMessageId, textToAppend)
      }
      const newTextInThisResponse = accumulatedText.slice(textBeforeResponse.length).trim()
      if (newTextInThisResponse) textSegments.push(newTextInThisResponse)

      // Process built-in image_generation_call results (single images)
      for (const image of result.images) {
        if (image.toolCallId && taskIdByToolCallId.has(image.toolCallId)) {
          const completedTaskId = await completeAgentImageTask(image, result.rawResponsePayload)
          const promptRefIds = uniqueIds(extractAgentReferenceIds(image.revisedPrompt ?? ''))
          if (promptRefIds.length > 0) {
            const promptRefs = await resolveReferenceImages(promptRefIds)
            if (promptRefs.imageIds.length > 0) {
              const latestTask = useStore.getState().tasks.find((t) => t.id === completedTaskId)
              if (latestTask) {
                const mergedInputIds = uniqueIds([...latestTask.inputImageIds, ...promptRefs.imageIds])
                if (mergedInputIds.length !== latestTask.inputImageIds.length) {
                  updateTaskInStore(completedTaskId, { inputImageIds: mergedInputIds })
                }
              }
            }
          }
          continue
        }
        const promptRefIds = uniqueIds(extractAgentReferenceIds(image.revisedPrompt ?? ''))
        const promptRefs = await resolveReferenceImages(promptRefIds)
        await createCompletedAgentImageTask(createTaskExecutionContext(), {
          taskId: genId(),
          image,
          prompt: image.revisedPrompt ?? round?.prompt ?? userMessage.content,
          params,
          profile: activeProfile,
          inputImageIds: uniqueIds([...(round?.inputImageIds ?? []), ...promptRefs.imageIds]),
          maskTargetImageId: round?.maskTargetImageId ?? null,
          maskImageId: round?.maskImageId ?? null,
          rawResponsePayload: result.rawResponsePayload,
          conversationId,
          roundId,
          assistantMessageId,
          startedAt,
          attachTask: attachTaskToAgentRoundInStore,
        })
      }

      if (result.rawResponsePayload && streamingTaskIds.length > 0) {
        for (const taskId of streamingTaskIds) {
          const latestTask = useStore.getState().tasks.find((task) => task.id === taskId)
          if (latestTask && !latestTask.rawResponsePayload) updateTaskInStore(taskId, { rawResponsePayload: result.rawResponsePayload })
        }
      }

      // Check for function calls that require continuation
      const batchFunctionCalls = currentResponseOutputItems.filter(
        (item) => item.type === 'function_call' && item.name === 'generate_image_batch',
      )
      const continueFunctionCalls = currentResponseOutputItems.filter(
        (item) => item.type === 'function_call' && item.name === 'continue_generation',
      )

      // Count built-in tool calls (image_generation, web_search) for budget tracking
      const responseToolCalls = countResponseToolCalls(currentResponseOutputItems)
      toolCallsUsed += responseToolCalls

      // Collect function_call_output items for all function calls that need responses
      const functionCallOutputs: ResponsesOutputItem[] = []

      if (batchFunctionCalls.length > 0) {
        for (const fc of batchFunctionCalls) {
          const output = await executeBatchFunctionCall(fc)
          functionCallOutputs.push({
            type: 'function_call_output',
            call_id: fc.call_id,
            output,
          })
        }
      }

      for (const fc of continueFunctionCalls) {
        functionCallOutputs.push({
          type: 'function_call_output',
          call_id: fc.call_id,
          output: JSON.stringify({ status: 'continued' }),
        })
      }

      // If no function calls need output → model decided the task is done → break
      if (functionCallOutputs.length === 0) {
        updateAgentConversation(conversationId, (current) =>
          setAgentRoundResponseOutput(current, roundId, accumulatedOutputItems, lastResponseId),
        )
        break
      }

      const accumulatedOutputItemsWithFunctionOutputs = mergeResponseOutputItems(accumulatedOutputItems, functionCallOutputs)

      updateAgentConversation(conversationId, (current) =>
        setAgentRoundResponseOutput(current, roundId, accumulatedOutputItemsWithFunctionOutputs, lastResponseId),
      )

      if (toolCallsUsed >= maxToolCalls) {
        reachedToolLimit = true
        break
      }

      // Build continuation input with function call outputs and available refs
      const latestConversation = useStore.getState().agentConversations.find((item) => item.id === conversationId)
      const latestRound = latestConversation?.rounds.find((item) => item.id === roundId)
      if (!latestRound) break

      const continuationBase = buildAgentContinuationInput(
        apiInput,
        latestRound,
        useStore.getState().tasks,
        accumulatedOutputItems,
        toolCallsUsed,
        maxToolCalls,
      )
      // Insert function_call_output items before the continuation system message
      continuationBase.splice(continuationBase.length - 1, 0, ...functionCallOutputs)
      // Inject batch-generated images as input_image user message for model visibility
      const batchImagesItem = await createAgentBatchImagesInputItem(latestRound, useStore.getState().tasks, streamingTaskIds)
      if (batchImagesItem) continuationBase.splice(continuationBase.length - 1, 0, batchImagesItem)
      apiInputForTurn = continuationBase
      accumulatedOutputItems = accumulatedOutputItemsWithFunctionOutputs
      pendingToolTextSeparator = true
    }

    const taskIds: string[] = [...streamingTaskIds]
    const outputIds = taskIds.flatMap((taskId) => useStore.getState().tasks.find((task) => task.id === taskId)?.outputImages ?? [])
    const limitNotice = reachedToolLimit ? `已达到最大工具调用次数（${maxToolCalls}），已停止自动续跑。` : ''
    const joinedText = textSegments.join('\n\n').trim()
    const finalContent = [joinedText, limitNotice]
      .filter(Boolean)
      .join(joinedText ? '\n\n' : '')
      || (taskIds.length > 0 || outputIds.length > 0 ? '图像已生成。' : '')

    const assistantMessage: AgentMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: finalContent,
      roundId,
      outputTaskIds: taskIds,
      createdAt: Date.now(),
    }

    updateAgentConversation(conversationId, (current) =>
      completeAgentRoundInConversation(current, roundId, assistantMessage, taskIds, accumulatedOutputItems, lastResponseId),
    )

    useStore.getState().showToast(outputIds.length > 0 ? 'Agent 已生成图片' : 'Agent 已回复', 'success')
  } catch (err) {
    if (controller.signal.aborted) {
      if (markAgentRoundStopped(conversationId, roundId)) {
        useStore.getState().showToast('已停止生成', 'info')
      }
      return
    }

    let message = err instanceof Error ? err.message : String(err)
    const usesApiProxy = activeProfile.apiProxy ?? requestSettings.apiProxy
    const networkErrorHint = getApiRequestNetworkErrorHint(err, startedAt, usesApiProxy, activeProfile)
    if (networkErrorHint && !message.includes(IMAGE_FETCH_CORS_HINT)) {
      message += `\n${networkErrorHint}`
    }

    updateAgentConversation(conversationId, (current) =>
      failAgentRoundInConversation(current, roundId, message, genId()),
    )
    useStore.getState().showToast(`Agent 请求失败：${message}`, 'error')
  } finally {
    if (agentRoundControllers.get(controllerKey) === controller) {
      agentRoundControllers.delete(controllerKey)
    }
  }
}

async function executeBackendTask(taskId: string, task: TaskRecord, profile: ApiProfile) {
  await executeBackendTaskInService(createTaskExecutionContext(), taskId, task, profile)
}

async function executeTask(taskId: string) {
  const { settings } = useStore.getState()
  const task = useStore.getState().tasks.find((t) => t.id === taskId)
  if (!task) return
  const taskProfile = getTaskApiProfile(settings, task)
  if (!taskProfile && task.apiProfileId) {
    updateTaskInStore(taskId, {
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
      useStore.getState().setTaskStreamPreview(taskId)
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
    useStore.getState().setTaskStreamPreview(taskId)
    void deleteUnreferencedImageIds(success.partialImageIdsToClean)
    const currentMask = useStore.getState().maskDraft
    if (
      maskDataUrl &&
      currentMask &&
      currentMask.targetImageId === task.maskTargetImageId &&
      currentMask.maskDataUrl === maskDataUrl
    ) {
      useStore.getState().clearMaskDraft()
    }
  } catch (err) {
    clearOpenAIWatchdogTimer(taskId)
    const latestTask = useStore.getState().tasks.find((t) => t.id === taskId) ?? task
    if (latestTask.status !== 'running') return
    useStore.getState().setTaskStreamPreview(taskId)
    const latestFalRequestInfo = falRequestInfo ?? (latestTask.falRequestId && latestTask.falEndpoint
      ? { requestId: latestTask.falRequestId, endpoint: latestTask.falEndpoint }
      : null)
    const latestCustomTaskInfo = customTaskInfo ?? (latestTask.customTaskId ? { taskId: latestTask.customTaskId } : null)
    if (latestTask.apiProvider === 'fal' && latestFalRequestInfo && isTaskConnectionRecoverableError(err)) {
      updateTaskInStore(taskId, {
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
      updateTaskInStore(taskId, {
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
      const settings = useStore.getState().settings
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
      updateTaskInStore(taskId, {
        status: 'error',
        error: errorMessage,
        ...rawPayload,
        errorDebug: createTaskErrorDebug(latestTask, errorMessage, rawPayload),
        falRecoverable: false,
        customRecoverable: false,
        finishedAt: Date.now(),
        elapsed: Date.now() - task.createdAt,
      })
      useStore.getState().setDetailTaskId(taskId)
    }
  } finally {
    // 释放输入图片的内存缓存（已持久化到 IndexedDB，后续按需从 DB 加载）
    for (const imgId of task.inputImageIds) {
      deleteCachedImage(imgId)
    }
  }
}

export function updateTaskInStore(taskId: string, patch: Partial<TaskRecord>) {
  const { tasks, setTasks } = useStore.getState()
  const updated = updateTaskListItem(tasks, taskId, patch)
  setTasks(updated)
  maybeOpenSupportPrompt(tasks, updated, taskId)
  const task = updated.find((t) => t.id === taskId)
  if (task) putTask(task)
}

export async function cancelQueuedServerTask(task: TaskRecord) {
  return cancelQueuedBackendTask(createTaskExecutionContext(), task)
}

export function moveTasksToCategory(taskIds: string[], categoryId: string | null) {
  const { categories } = useStore.getState()
  const category = categoryId ? categories.find((item) => item.id === categoryId) ?? null : null
  void moveTasksToCategoryInService(createTaskCleanupContext(), taskIds, category)
}

export function moveTasksToTrash(taskIds: string[]) {
  void moveTasksToTrashInService(createTaskCleanupContext(), taskIds)
}

export function restoreTasksFromTrash(taskIds: string[]) {
  void restoreTasksFromTrashInService(createTaskCleanupContext(), taskIds)
}

/** 重试失败的任务：创建新任务并执行 */
export async function retryTask(task: TaskRecord) {
  const { settings } = useStore.getState()
  const taskId = genId()
  await createRetryTask(createTaskExecutionContext(), task, settings, taskId)
  executeTask(taskId)
}

/** 复用配置 */
export async function reuseConfig(task: TaskRecord) {
  const { settings, setPrompt, setParams, setInputImages, setMaskDraft, clearMaskDraft, showToast, setConfirmDialog, setReusedTaskApiProfile } = useStore.getState()
  const reuse = await prepareTaskReuse(task, settings)

  setParams(reuse.params)
  setReusedTaskApiProfile(
    reuse.reusedProfileId,
    reuse.missingReusedProfile,
    reuse.taskProfileName,
  )
  clearMaskDraft()
  setInputImages(reuse.inputImages)
  setPrompt(reuse.prompt)
  if (reuse.maskDraft) setMaskDraft(reuse.maskDraft)
  else clearMaskDraft()

  if (reuse.missingReusedProfile) {
    setConfirmDialog({
      title: '找不到 API 配置',
      message: `找不到复用任务所使用的 API 配置「${reuse.taskProfileName}」，要使用当前的 API 配置「${reuse.currentProfileName}」提交任务吗？`,
      confirmText: '使用当前配置提交',
      cancelText: '放弃提交',
      action: () => {
        void submitTask({ useCurrentApiProfileWhenReusedMissing: true })
      },
    })
    return
  }

  showToast(
    reuse.shouldTemporarilyReuseProfile && reuse.reusedProfileName
      ? `已临时复用该任务的 API 配置「${reuse.reusedProfileName}」`
      : '已复用配置到输入框',
    'success',
  )
}

/** 编辑输出：将输出图加入输入 */
export async function editOutputs(task: TaskRecord) {
  const { inputImages, addInputImage, showToast } = useStore.getState()
  if (!task.outputImages?.length) return

  const images = await collectTaskOutputInputImages(task, inputImages)
  for (const image of images) addInputImage(image)
  showToast(`已添加 ${images.length} 张输出图到输入`, 'success')
}

async function permanentlyDeleteTasks(taskIds: string[], options: { showToast?: boolean } = { showToast: true }) {
  await permanentlyDeleteTasksInService(createTaskCleanupContext(), taskIds, options)
}

/** 删除多条任务 */
export async function removeMultipleTasks(taskIds: string[]) {
  await permanentlyDeleteTasks(taskIds, { showToast: true })
}

/** 删除单条任务 */
export async function removeTask(task: TaskRecord) {
  await permanentlyDeleteTasks([task.id], { showToast: false })
  useStore.getState().showToast('记录已删除', 'success')
}

export async function emptyTrash() {
  await emptyTrashInService(createTaskCleanupContext())
}

export async function cleanupExpiredTrashTasks(now = Date.now()) {
  return cleanupExpiredTrashTasksInService(createTaskCleanupContext(), now)
}

/** 清空数据选项 */
export type ClearOptions = ClearDataOptions

/** 清空数据 */
export async function clearData(options: ClearOptions = { clearConfig: true, clearTasks: true }) {
  const { setTasks, clearInputImages, clearMaskDraft, setSettings, setParams, showToast } = useStore.getState()

  if (options.clearTasks) {
    await clearLocalDataStorage(options)
    setTasks([])
    useStore.setState({
      agentConversations: [],
      activeAgentConversationId: null,
      categories: [],
      activeCategoryId: 'all',
      taskView: 'gallery',
      supportPromptOpen: false,
      supportPromptSkippedForImportedData: false,
      moveCategoryTaskIds: null,
    })
    clearInputImages()
    clearMaskDraft()
  }

  if (options.clearConfig) {
    useStore.setState({ dismissedCodexCliPrompts: [], promptLibrary: [], supportPromptDismissed: false })
    setSettings({ ...DEFAULT_SETTINGS })
    setParams({ ...DEFAULT_PARAMS })
  }

  showToast('所选数据已清空', 'success')
}

/** 导出数据为 ZIP */
export async function exportData(options: ExportOptions = { exportConfig: true, exportTasks: true }) {
  try {
    const { settings, agentConversations, categories, promptLibrary } = useStore.getState()
    const { blob, fileName } = await createExportDataZip({ settings, agentConversations, categories, promptLibrary }, options)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
    useStore.getState().showToast('数据已导出', 'success')
  } catch (e) {
    useStore
      .getState()
      .showToast(
        `导出失败：${e instanceof Error ? e.message : String(e)}`,
        'error',
      )
  }
}

/** 导入 ZIP 数据 */
export async function importData(file: File, options: ImportOptions = { importConfig: true, importTasks: true }): Promise<boolean> {
  try {
    const { data, tasks, importedAgentConversations, importedImageIds } = await importDataFromZip(file, options, putTask)

    if (options.importTasks && data.tasks) {
      useStore.getState().setTasks(tasks)
      useStore.setState((state) => {
        const agentConversations = mergeImportedAgentConversations(state.agentConversations, importedAgentConversations)
        const activeAgentConversationId = state.activeAgentConversationId && agentConversations.some((conversation) => conversation.id === state.activeAgentConversationId)
          ? state.activeAgentConversationId
          : importedAgentConversations[0]?.id ?? agentConversations[0]?.id ?? null
        return {
          agentConversations,
          activeAgentConversationId,
        }
      })
      await replaceStoredAgentConversations(useStore.getState().agentConversations)
      skipSupportPromptForImportedData(tasks)
      scheduleThumbnailBackfill(importedImageIds)
    }

    if (options.importConfig && data.settings) {
      const state = useStore.getState()
      state.setSettings(mergeImportedSettings(state.settings, data.settings))
    }

    if (options.importConfig || options.importTasks) {
      useStore.setState((state) => ({
        categories: mergeCategoryLists(state.categories ?? [], data.categories ?? [], UNCATEGORIZED_CATEGORY_ID),
        promptLibrary: mergePromptLibraryLists(state.promptLibrary, data.promptLibrary ?? []),
      }))
    }

    let msg = '数据已成功导入'
    if (options.importTasks && data.tasks) {
      msg = `已导入 ${data.tasks.length} 条记录`
    } else if (options.importConfig && data.settings) {
      msg = '配置已成功导入'
    }

    useStore.getState().showToast(msg, 'success')
    return true
  } catch (e) {
    useStore
      .getState()
      .showToast(
        `导入失败：${e instanceof Error ? e.message : String(e)}`,
        'error',
      )
    return false
  }
}

/** 添加图片到输入（文件上传） */
export async function addImageFromFile(file: File): Promise<void> {
  const image = await createInputImageFromFile(file)
  if (!image) return
  useStore.getState().addInputImage(image)
}

export async function createInputImageFromFile(file: File): Promise<InputImage | null> {
  return createStoredInputImageFromFile(file)
}

/** 添加图片到输入（右键菜单）—— 支持 data/blob/http URL */
export async function addImageFromUrl(src: string): Promise<void> {
  useStore.getState().addInputImage(await createStoredInputImageFromUrl(src))
}
