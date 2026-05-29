import type { TaskRecord } from '../../types'
import type { AppState } from '../appState'
import { createInitStoreAction } from '../persistence/initStoreActions'

type StoreSetState = (patch: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void

type BackendSyncActions = {
  syncBackendTasksToStore: () => Promise<void>
  syncBackendAssetsToLocalCache: () => Promise<void>
}

type StoreInitActionDeps = {
  backendSyncActions: BackendSyncActions
  cleanupExpiredTrashTasks: () => Promise<number>
  finalizeAgentConversationPersistence: () => Promise<void>
  getState: () => AppState
  putTask: (task: TaskRecord) => Promise<unknown>
  replaceStoredAgentConversations: (conversations: AppState['agentConversations']) => Promise<void>
  scheduleCustomRecovery: (taskId: string, delayMs?: number) => void
  scheduleFalRecovery: (taskId: string, delayMs?: number) => void
  setState: StoreSetState
  showSupportPromptForExistingLocalData: (tasks: TaskRecord[]) => void
}

export function createStoreInitAction(deps: StoreInitActionDeps) {
  return createInitStoreAction(deps)
}
