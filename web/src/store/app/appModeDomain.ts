import type { ApiProfile } from '../../types'
import type { AppState } from '../appState'
import { restoreAgentInputDraftState, restoreGalleryInputDraftState, saveActiveAgentInputDrafts, saveGalleryInputDraft } from '../agent/agentInputDrafts'

export function createNonAgentModeState(state: AppState, appMode: 'gallery' | 'square') {
  const agentInputDrafts = saveActiveAgentInputDrafts(state)
  const galleryInputDraft = saveGalleryInputDraft(state)
  return {
    appMode,
    agentInputDrafts,
    galleryInputDraft,
    agentMobileHeaderVisible: true,
    selectedTaskIds: [],
    agentEditingRoundId: null,
    ...(appMode === 'gallery' && state.appMode === 'agent' ? restoreGalleryInputDraftState(galleryInputDraft) : {}),
  }
}

export function canEnterAgentMode(activeProfile: ApiProfile) {
  return activeProfile.provider === 'openai' && activeProfile.apiMode === 'responses'
}

export function createAgentModeState(state: AppState) {
  const galleryInputDraft = saveGalleryInputDraft(state)
  return {
    appMode: 'agent' as const,
    galleryInputDraft,
    agentMobileHeaderVisible: false,
    agentSidebarCollapsed: true,
    agentAssetPanelCollapsed: true,
    selectedTaskIds: [],
    ...restoreAgentInputDraftState(state.agentInputDrafts, state.activeAgentConversationId),
  }
}

export function getAgentModeUnavailableDialog(activeProfile: ApiProfile, openSettings: () => void) {
  if (activeProfile.provider === 'openai') {
    return {
      title: '需要 Responses API 配置',
      message: `当前配置「${activeProfile.name}」使用的是 Images API，仅支持生成图片，无 Agent 模式需要的对话能力。\n\n请前往 API 配置页，将当前配置调整为 Responses API，或切换/新建一个支持 Responses API 的配置。`,
      confirmText: '去设置',
      cancelText: '取消',
      action: openSettings,
    }
  }

  return {
    title: '配置不支持 Agent 模式',
    message: `当前配置「${activeProfile.name}」所属的服务商暂不支持 Agent 模式。Agent 模式需要使用支持 Responses API 的 OpenAI 配置。\n\n请前往 API 配置页，切换或新建一个支持 Responses API 的配置。`,
    confirmText: '去设置',
    cancelText: '取消',
    action: openSettings,
  }
}
