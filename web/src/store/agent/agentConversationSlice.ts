import type { StateCreator } from 'zustand'
import type { AppState } from '../appState'
import {
  createAgentAssetPanelCollapsedState,
  createAgentAssetTabState,
  createAgentEditingConversationState,
  createAgentEditingRoundState,
  createAgentMobileHeaderVisibleState,
  createAgentSidebarCollapsedState,
} from '../simpleActionDomain'
import { genId } from '../shared'
import { setAgentConversationActiveRound, renameAgentConversationInList } from './agentConversationDomain'
import {
  createActiveAgentConversationState,
  createAgentConversationState,
  deleteAgentConversationState,
} from './agentConversationActionsDomain'

type StoreSet = Parameters<StateCreator<AppState>>[0]
type StoreGet = Parameters<StateCreator<AppState>>[1]

type AgentConversationSlice = Pick<
  AppState,
  | 'agentConversations'
  | 'agentConversationsLoaded'
  | 'activeAgentConversationId'
  | 'agentInputDrafts'
  | 'agentSidebarCollapsed'
  | 'agentAssetTab'
  | 'agentAssetPanelCollapsed'
  | 'agentMobileHeaderVisible'
  | 'agentEditingRoundId'
  | 'agentEditingConversationId'
  | 'agentGeneratingTitleIds'
  | 'createAgentConversation'
  | 'setActiveAgentConversationId'
  | 'setActiveAgentRoundId'
  | 'renameAgentConversation'
  | 'deleteAgentConversation'
  | 'setAgentSidebarCollapsed'
  | 'setAgentAssetTab'
  | 'setAgentAssetPanelCollapsed'
  | 'setAgentMobileHeaderVisible'
  | 'setAgentEditingRoundId'
  | 'setAgentEditingConversationId'
>

export function createAgentConversationSlice(set: StoreSet, get: StoreGet): AgentConversationSlice {
  return {
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
    renameAgentConversation: (id, title) => set((state) => ({
      agentConversations: renameAgentConversationInList(state.agentConversations, id, title),
    })),
    deleteAgentConversation: (id) => set((state) => deleteAgentConversationState(state, id)),
    setAgentSidebarCollapsed: (agentSidebarCollapsed) => set(createAgentSidebarCollapsedState(agentSidebarCollapsed)),
    setAgentAssetTab: (agentAssetTab) => set(createAgentAssetTabState(agentAssetTab)),
    setAgentAssetPanelCollapsed: (agentAssetPanelCollapsed) => set(createAgentAssetPanelCollapsedState(agentAssetPanelCollapsed)),
    setAgentMobileHeaderVisible: (agentMobileHeaderVisible) => set(createAgentMobileHeaderVisibleState(agentMobileHeaderVisible)),
    setAgentEditingRoundId: (agentEditingRoundId) => set(createAgentEditingRoundState(agentEditingRoundId)),
    setAgentEditingConversationId: (agentEditingConversationId) => set(createAgentEditingConversationState(agentEditingConversationId)),
  }
}
