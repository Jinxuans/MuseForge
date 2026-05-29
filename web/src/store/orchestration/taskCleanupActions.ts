import type { TaskRecord } from '../../types'
import { deleteUnreferencedImageIds as deleteUnreferencedImageIdsInService } from '../../services/taskCleanup'
import type { AppState } from '../appState'
import { createTaskCleanupActions } from '../tasks/taskCleanupActions'
import { createTaskCleanupContextFactory } from './actionContexts'

type StoreSetState = (patch: Partial<AppState> | ((state: AppState) => Partial<AppState>)) => void

type StoreTaskCleanupActionsDeps = {
  deleteImage: (imageId: string) => Promise<unknown>
  deleteTask: (taskId: string) => Promise<unknown>
  getState: () => AppState
  putTask: (task: TaskRecord) => Promise<unknown>
  setState: StoreSetState
}

export function createStoreTaskCleanupActions({
  deleteImage,
  deleteTask,
  getState,
  putTask,
  setState,
}: StoreTaskCleanupActionsDeps) {
  const createTaskCleanupContext = createTaskCleanupContextFactory({
    deleteImage,
    deleteTask,
    getState,
    putTask,
    setState,
  })

  const actions = createTaskCleanupActions({
    createContext: createTaskCleanupContext,
    getState,
  })

  async function deleteUnreferencedImageIds(imageIds: Iterable<string>) {
    await deleteUnreferencedImageIdsInService(createTaskCleanupContext(), imageIds)
  }

  return {
    ...actions,
    deleteUnreferencedImageIds,
  }
}
