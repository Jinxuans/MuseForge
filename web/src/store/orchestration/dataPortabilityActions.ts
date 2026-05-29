import type { TaskRecord } from '../../types'
import type { AppState } from '../appState'
import { createDataPortabilityActions } from '../persistence/dataPortabilityActions'

type StoreSetState = (patch: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void

type StoreDataPortabilityActionsDeps = {
  getState: () => AppState
  putTask: (task: TaskRecord) => Promise<unknown>
  replaceStoredAgentConversations: (conversations: AppState['agentConversations']) => Promise<void>
  scheduleThumbnailBackfill: (imageIds: string[]) => void
  setState: StoreSetState
  skipSupportPromptForImportedData: (tasks: TaskRecord[]) => void
  uncategorizedCategoryId: string
}

export function createStoreDataPortabilityActions(deps: StoreDataPortabilityActionsDeps) {
  return createDataPortabilityActions(deps)
}
