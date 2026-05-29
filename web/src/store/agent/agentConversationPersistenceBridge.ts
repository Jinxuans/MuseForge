import type { AgentConversation } from '../../types'
import type { AppState } from '../appState'
import { getPersistableAgentConversation, getPersistedState as getPersistedStateInService, mergePersistedState as mergePersistedStateInService } from '../persistence/persistedState'

type AgentConversationPersistenceBridgeDeps = {
  replaceAgentConversations: (conversations: AgentConversation[]) => Promise<unknown>
  uncategorizedCategoryId: string
}

type StoreAccess = {
  getState: () => AppState
  setState: (patch: Partial<AppState>) => void
}

export function createAgentConversationPersistenceBridge({
  replaceAgentConversations,
  uncategorizedCategoryId,
}: AgentConversationPersistenceBridgeDeps) {
  let persistenceReady = false
  let migrationPending = false
  let lastStoredAgentConversations: AgentConversation[] | null = null
  let persistRunning = false
  let persistQueued = false
  let storeAccess: StoreAccess | null = null

  async function replaceStoredAgentConversations(conversations: AgentConversation[]) {
    await replaceAgentConversations(conversations.map(getPersistableAgentConversation))
  }

  async function flushAgentConversationsToIndexedDB() {
    if (!storeAccess) return
    if (persistRunning) {
      persistQueued = true
      return
    }

    persistRunning = true
    try {
      do {
        persistQueued = false
        const conversations = storeAccess.getState().agentConversations
        await replaceStoredAgentConversations(conversations)
        lastStoredAgentConversations = conversations
      } while (
        persistQueued ||
        storeAccess.getState().agentConversations !== lastStoredAgentConversations
      )
    } finally {
      persistRunning = false
    }
  }

  return {
    getPersistedState(state: AppState) {
      return getPersistedStateInService(state, {
        includeAgentConversations: migrationPending && !persistenceReady,
      })
    },

    mergePersistedState(persistedState: unknown, currentState: AppState): AppState {
      return mergePersistedStateInService(persistedState, currentState, {
        includeAgentConversations: migrationPending && !persistenceReady,
        uncategorizedCategoryId,
        onAgentConversationMigrationPending: () => {
          migrationPending = true
        },
      })
    },

    replaceStoredAgentConversations,

    connect(access: StoreAccess, subscribe: (listener: (state: AppState) => void) => unknown) {
      storeAccess = access
      lastStoredAgentConversations = access.getState().agentConversations
      subscribe((state) => {
        if (state.agentConversations === lastStoredAgentConversations) return
        if (!persistenceReady) {
          persistQueued = true
          return
        }
        void flushAgentConversationsToIndexedDB()
      })
    },

    async finalizeAgentConversationPersistence() {
      if (!storeAccess) return
      const shouldRewritePersistedLocalState = migrationPending
      persistenceReady = true
      migrationPending = false
      if (persistQueued || storeAccess.getState().agentConversations !== lastStoredAgentConversations) {
        await flushAgentConversationsToIndexedDB()
      }
      if (shouldRewritePersistedLocalState) {
        storeAccess.setState({})
      }
    },
  }
}
