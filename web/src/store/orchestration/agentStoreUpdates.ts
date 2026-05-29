import type { AgentConversation } from '../../types'
import type { AppState } from '../appState'
import { getActiveAgentConversationOrCreate } from '../agent/agentConversationActionsDomain'

type StoreSetState = (patch: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void

type AgentStoreUpdatesDeps = {
  getState: () => AppState
  setState: StoreSetState
}

export function createAgentStoreUpdates({ getState, setState }: AgentStoreUpdatesDeps) {
  function getActiveAgentConversation(): AgentConversation {
    const state = getState()
    return getActiveAgentConversationOrCreate(
      state.agentConversations,
      state.activeAgentConversationId,
      state.createAgentConversation,
      () => getState().agentConversations,
    )
  }

  function updateAgentConversation(conversationId: string, updater: (conversation: AgentConversation) => AgentConversation) {
    setState((state) => ({
      agentConversations: state.agentConversations.map((conversation) =>
        conversation.id === conversationId ? updater(conversation) : conversation,
      ),
    }))
  }

  return {
    getActiveAgentConversation,
    updateAgentConversation,
  }
}
