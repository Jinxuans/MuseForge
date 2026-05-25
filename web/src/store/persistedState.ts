import type { AppState } from './appState'
import type { AgentConversation, TaskView } from '../types'
import { normalizeSettings } from '../lib/apiProfiles'
import {
  cleanStaleAgentInputDrafts,
  getPersistableAgentInputDrafts,
  getPersistableGalleryInputDraft,
  getPersistableInputImage,
  isEmptyAgentInputDraft,
  normalizeAgentInputDraft,
  normalizeAgentInputDrafts,
  normalizeAgentInputDraftsByKey,
} from './agentInputDrafts'
import { getPersistableAgentConversations, normalizeAgentConversations, stripPersistedAgentConversations } from './agentConversationPersistence'
import { normalizeCategories as normalizeCategoriesValue, normalizePromptLibrary } from './userCollectionNormalizers'

export type PersistedStateOptions = {
  includeAgentConversations: boolean
  uncategorizedCategoryId: string
  onAgentConversationMigrationPending: () => void
}

export function migratePersistedState(persistedState: unknown): unknown {
  if (!isRecord(persistedState)) return persistedState
  return {
    ...persistedState,
    agentConversations: stripPersistedAgentConversations(persistedState.agentConversations),
  }
}

export function getPersistedState(state: AppState, options: Pick<PersistedStateOptions, 'includeAgentConversations'>) {
  const settings = normalizeSettings(state.settings)
  const galleryInputDraft = getPersistableGalleryInputDraft(state)
  return {
    settings,
    params: state.params,
    ...(settings.persistInputOnRestart && (state.appMode === 'gallery' || galleryInputDraft)
      ? {
          prompt: galleryInputDraft?.prompt ?? '',
          inputImages: galleryInputDraft?.inputImages.map(getPersistableInputImage) ?? [],
        }
      : {}),
    dismissedCodexCliPrompts: state.dismissedCodexCliPrompts,
    categories: state.categories,
    activeCategoryId: state.activeCategoryId,
    taskView: state.taskView,
    promptLibrary: state.promptLibrary,
    appMode: state.appMode,
    galleryInputDraft: settings.persistInputOnRestart && galleryInputDraft
      ? { ...galleryInputDraft, inputImages: galleryInputDraft.inputImages.map(getPersistableInputImage) }
      : null,
    ...(options.includeAgentConversations
      ? { agentConversations: getPersistableAgentConversations(state.agentConversations) }
      : {}),
    activeAgentConversationId: state.activeAgentConversationId,
    agentInputDrafts: getPersistableAgentInputDrafts(state),
    agentSidebarCollapsed: state.agentSidebarCollapsed,
    agentAssetTab: state.agentAssetTab,
    agentAssetPanelCollapsed: state.agentAssetPanelCollapsed,
    supportPromptDismissed: state.supportPromptDismissed,
    supportPromptOpen: state.supportPromptOpen,
    supportPromptSkippedForImportedData: state.supportPromptSkippedForImportedData,
  }
}

export function getPersistableAgentConversation(conversation: AgentConversation): AgentConversation {
  return getPersistableAgentConversations([conversation])[0]!
}

export function mergePersistedState(persistedState: unknown, currentState: AppState, options: PersistedStateOptions): AppState {
  if (!persistedState || typeof persistedState !== 'object') return currentState

  const persisted = persistedState as Partial<AppState>
  const settings = normalizeSettings(persisted.settings ?? currentState.settings)
  const hasPersistedAgentConversations = Array.isArray(persisted.agentConversations)
  if (hasPersistedAgentConversations && normalizeAgentConversations(persisted.agentConversations).length > 0) {
    options.onAgentConversationMigrationPending()
  }
  const agentConversations = hasPersistedAgentConversations
    ? normalizeAgentConversations(persisted.agentConversations)
    : currentState.agentConversations
  const activeAgentConversationId =
    typeof persisted.activeAgentConversationId === 'string' && (!hasPersistedAgentConversations || agentConversations.some((conversation) => conversation.id === persisted.activeAgentConversationId))
      ? persisted.activeAgentConversationId
      : agentConversations[0]?.id ?? null
  const appMode = persisted.appMode === 'agent' || persisted.appMode === 'square' ? persisted.appMode : 'gallery'
  const categories = normalizeCategoriesValue(persisted.categories, options.uncategorizedCategoryId)
  const activeCategoryId = typeof persisted.activeCategoryId === 'string' &&
    (persisted.activeCategoryId === options.uncategorizedCategoryId || categories.some((category) => category.id === persisted.activeCategoryId))
    ? persisted.activeCategoryId
    : 'all'
  const taskView: TaskView = persisted.taskView === 'trash' ? 'trash' : 'gallery'
  const galleryInputDraft = settings.persistInputOnRestart
    ? normalizeAgentInputDraft(persisted.galleryInputDraft ?? {
        prompt: persisted.prompt,
        inputImages: persisted.inputImages,
        maskDraft: null,
        maskEditorImageId: null,
      })
    : null
  const normalizedAgentInputDrafts = hasPersistedAgentConversations
    ? normalizeAgentInputDrafts(persisted.agentInputDrafts, agentConversations)
    : normalizeAgentInputDraftsByKey(persisted.agentInputDrafts)
  let agentInputDrafts = cleanStaleAgentInputDrafts(normalizedAgentInputDrafts, activeAgentConversationId)
  if (appMode === 'agent' && activeAgentConversationId && !agentInputDrafts[activeAgentConversationId] && settings.persistInputOnRestart && typeof persisted.prompt === 'string') {
    agentInputDrafts = {
      ...agentInputDrafts,
      [activeAgentConversationId]: normalizeAgentInputDraft({
        prompt: persisted.prompt,
        inputImages: persisted.inputImages,
        maskDraft: null,
        maskEditorImageId: null,
      }, Date.now()),
    }
  }
  const restoredAgentDraft = appMode === 'agent' && activeAgentConversationId
    ? agentInputDrafts[activeAgentConversationId] ?? null
    : null
  return {
    ...currentState,
    ...persisted,
    settings,
    appMode,
    categories,
    activeCategoryId,
    taskView,
    promptLibrary: normalizePromptLibrary(persisted.promptLibrary),
    showPromptLibrary: false,
    galleryInputDraft: galleryInputDraft && !isEmptyAgentInputDraft(galleryInputDraft) ? galleryInputDraft : null,
    agentConversations,
    activeAgentConversationId,
    agentInputDrafts,
    agentSidebarCollapsed: Boolean(persisted.agentSidebarCollapsed),
    agentAssetTab: persisted.agentAssetTab === 'references' ? 'references' : 'outputs',
    agentAssetPanelCollapsed: Boolean(persisted.agentAssetPanelCollapsed),
    supportPromptDismissed: Boolean(persisted.supportPromptDismissed),
    supportPromptOpen: Boolean(persisted.supportPromptOpen),
    supportPromptSkippedForImportedData: Boolean(persisted.supportPromptSkippedForImportedData),
    prompt: restoredAgentDraft ? restoredAgentDraft.prompt : galleryInputDraft?.prompt ?? '',
    inputImages: restoredAgentDraft ? restoredAgentDraft.inputImages : galleryInputDraft?.inputImages ?? [],
    maskDraft: restoredAgentDraft ? restoredAgentDraft.maskDraft : galleryInputDraft?.maskDraft ?? null,
    maskEditorImageId: restoredAgentDraft ? restoredAgentDraft.maskEditorImageId : galleryInputDraft?.maskEditorImageId ?? null,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}
