import type { AppState } from './appState'
import { getToastMessage } from './errorMessages'

export function setParamsInState(state: Pick<AppState, 'params'>, params: Partial<AppState['params']>) {
  return { params: { ...state.params, ...params } }
}

export function createReusedTaskApiProfileState(profileId: string | null, missing = false, profileName: string | null = null) {
  return {
    reusedTaskApiProfileId: profileId,
    reusedTaskApiProfileName: profileName,
    reusedTaskApiProfileMissing: missing,
  }
}

export function createAgentSidebarCollapsedState(agentSidebarCollapsed: boolean) {
  return { agentSidebarCollapsed }
}

export function createAgentAssetTabState(agentAssetTab: AppState['agentAssetTab']) {
  return { agentAssetTab }
}

export function createAgentAssetPanelCollapsedState(agentAssetPanelCollapsed: boolean) {
  return { agentAssetPanelCollapsed }
}

export function createAgentMobileHeaderVisibleState(agentMobileHeaderVisible: boolean) {
  return { agentMobileHeaderVisible }
}

export function createAgentEditingRoundState(agentEditingRoundId: string | null) {
  return { agentEditingRoundId }
}

export function createAgentEditingConversationState(agentEditingConversationId: string | null) {
  return { agentEditingConversationId }
}

export function createSearchQueryState(searchQuery: string) {
  return { searchQuery }
}

export function createFilterStatusState(filterStatus: AppState['filterStatus']) {
  return { filterStatus }
}

export function createFilterFavoriteState(filterFavorite: boolean) {
  return { filterFavorite }
}

export function createTaskViewState(taskView: AppState['taskView']) {
  return { taskView, selectedTaskIds: [] }
}

export function createActiveCategoryState(activeCategoryId: string) {
  return { activeCategoryId, selectedTaskIds: [] }
}

export function createPromptLibraryVisibilityState(showPromptLibrary: boolean) {
  return { showPromptLibrary }
}

export function createSquareShareTargetState(shareToSquareTarget: AppState['shareToSquareTarget']) {
  return { shareToSquareTarget }
}

export function createDetailTaskState(detailTaskId: string | null) {
  return { detailTaskId }
}

export function createToastState(message: string, type: NonNullable<AppState['toast']>['type']) {
  const toast = { message: getToastMessage(message, type), type }
  return { toast }
}

export function clearToastIfCurrent(state: Pick<AppState, 'toast'>, toast: NonNullable<AppState['toast']>) {
  return state.toast === toast ? { toast: null } : state
}

export function createConfirmDialogState(confirmDialog: AppState['confirmDialog']) {
  return { confirmDialog }
}
