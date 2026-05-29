import type { AgentConversation } from '../../types'
import type { AppState } from '../appState'
import { createAgentConversationPersistenceBridge } from '../agent/agentConversationPersistenceBridge'

type StorePersistenceBridgeDeps = {
  replaceAgentConversations: (conversations: AgentConversation[]) => Promise<unknown>
  uncategorizedCategoryId: string
}

type StoreAccess = {
  getState: () => AppState
  setState: (patch: Partial<AppState>) => void
}

export function createStorePersistenceBridge(deps: StorePersistenceBridgeDeps) {
  return createAgentConversationPersistenceBridge(deps)
}

export function connectStorePersistenceBridge(
  bridge: ReturnType<typeof createStorePersistenceBridge>,
  access: StoreAccess,
  subscribe: (listener: (state: AppState) => void) => unknown,
) {
  bridge.connect(access, subscribe)
}
