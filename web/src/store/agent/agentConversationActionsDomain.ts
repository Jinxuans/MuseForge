import type { AgentConversation } from '../../types'
import type { AppState } from '../appState'
import { clearInputDraftState, restoreAgentInputDraftState, saveActiveAgentInputDrafts } from './agentInputDrafts'
import {
  createEmptyAgentConversation,
  deleteAgentConversationFromList,
  getLatestAgentConversation,
  isEmptyAgentConversation,
  touchAgentConversation,
} from './agentConversationDomain'

export function createAgentConversationState(state: AppState, createId: () => string, now = Date.now()) {
  const latestConversation = getLatestAgentConversation(state.agentConversations)
  if (latestConversation && isEmptyAgentConversation(latestConversation)) {
    const agentInputDrafts = saveActiveAgentInputDrafts(state)
    return {
      conversationId: latestConversation.id,
      patch: {
        agentConversations: touchAgentConversation(state.agentConversations, latestConversation.id, now),
        activeAgentConversationId: latestConversation.id,
        agentInputDrafts,
        agentSidebarCollapsed: true,
        agentEditingRoundId: null,
        ...restoreAgentInputDraftState(agentInputDrafts, latestConversation.id),
      },
    }
  }

  const conversation = createEmptyAgentConversation(createId(), now)
  const agentInputDrafts = saveActiveAgentInputDrafts(state)
  return {
    conversationId: conversation.id,
    patch: {
      agentConversations: [
        ...state.agentConversations,
        conversation,
      ],
      activeAgentConversationId: conversation.id,
      agentInputDrafts,
      agentSidebarCollapsed: true,
      agentEditingRoundId: null,
      ...restoreAgentInputDraftState(agentInputDrafts, conversation.id),
    },
  }
}

export function createActiveAgentConversationState(state: AppState, id: string | null) {
  if (state.activeAgentConversationId === id) {
    return {
      activeAgentConversationId: id,
      agentSidebarCollapsed: true,
      agentAssetPanelCollapsed: true,
      agentEditingRoundId: null,
    }
  }

  const agentInputDrafts = saveActiveAgentInputDrafts(state)
  return {
    activeAgentConversationId: id,
    agentInputDrafts,
    agentSidebarCollapsed: true,
    agentAssetPanelCollapsed: true,
    agentEditingRoundId: null,
    ...restoreAgentInputDraftState(agentInputDrafts, id),
  }
}

export function deleteAgentConversationState(state: AppState, id: string) {
  const agentInputDrafts = { ...state.agentInputDrafts }
  delete agentInputDrafts[id]
  const activeDeleted = state.activeAgentConversationId === id
  return {
    agentConversations: deleteAgentConversationFromList(state.agentConversations, id),
    activeAgentConversationId: activeDeleted ? null : state.activeAgentConversationId,
    agentInputDrafts,
    ...(activeDeleted ? clearInputDraftState() : {}),
  }
}

export function getActiveAgentConversationOrCreate(
  conversations: AgentConversation[],
  activeConversationId: string | null,
  createConversation: () => string,
  getConversations: () => AgentConversation[],
) {
  const existing = conversations.find((conversation) => conversation.id === activeConversationId)
  if (existing) return existing

  const id = createConversation()
  return getConversations().find((conversation) => conversation.id === id)!
}
