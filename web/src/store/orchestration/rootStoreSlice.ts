import type { StateCreator } from 'zustand'
import type { TaskRecord } from '../../types'
import type { AppState } from '../appState'
import { createAgentConversationSlice } from '../agent/agentConversationSlice'
import { createAppModeSlice } from '../app/appModeSlice'
import { createCollectionSlice } from '../collection/collectionSlice'
import { createInputSlice } from '../input/inputSlice'
import { createSettingsSlice } from '../settings/settingsSlice'
import { createTaskListSlice } from '../tasks/taskListSlice'
import { createUiSlice } from '../ui/uiSlice'

type StoreSet = Parameters<StateCreator<AppState>>[0]
type StoreGet = Parameters<StateCreator<AppState>>[1]

type RootStoreSliceDeps = {
  deleteImageIfUnreferenced: (imageId: string) => Promise<void>
  openApiSettings: () => void
  putTask: (task: TaskRecord) => Promise<unknown>
}

export function createRootStoreSlice(set: StoreSet, get: StoreGet, deps: RootStoreSliceDeps): AppState {
  return {
    ...createAppModeSlice(set, get, {
      openApiSettings: deps.openApiSettings,
    }),
    ...createSettingsSlice(set),
    ...createInputSlice(set, { deleteImageIfUnreferenced: deps.deleteImageIfUnreferenced }),

    ...createAgentConversationSlice(set, get),
    ...createTaskListSlice(set),
    ...createCollectionSlice(set, get, { putTask: deps.putTask }),

    ...createUiSlice(set),
  }
}
