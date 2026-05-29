import type { TaskRecord } from '../../types'
import type { AppState } from '../appState'
import { createBackendSyncActions } from '../persistence/backendSyncActions'
import { createBackendSyncContextFactory } from './actionContexts'

type StoreBackendSyncActionsDeps = {
  deleteUnreferencedImageIds: (imageIds: Iterable<string>) => Promise<void>
  getState: () => AppState
  putTask: (task: TaskRecord) => Promise<unknown>
}

export function createStoreBackendSyncActions({
  deleteUnreferencedImageIds,
  getState,
  putTask,
}: StoreBackendSyncActionsDeps) {
  return createBackendSyncActions({
    createContext: createBackendSyncContextFactory({
      deleteUnreferencedImageIds,
      getState,
      putTask,
    }),
  })
}
