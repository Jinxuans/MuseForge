import type { StateCreator } from 'zustand'
import type { AppState } from '../appState'
import { setTaskStreamPreviewInState } from '../shared'
import { createFilterFavoriteState, createFilterStatusState, createSearchQueryState, createTaskViewState } from '../simpleActionDomain'
import { setTaskListState } from './taskDomain'

type StoreSet = Parameters<StateCreator<AppState>>[0]

type TaskListSlice = Pick<
  AppState,
  | 'tasks'
  | 'setTasks'
  | 'streamPreviews'
  | 'streamPreviewSlots'
  | 'setTaskStreamPreview'
  | 'searchQuery'
  | 'setSearchQuery'
  | 'filterStatus'
  | 'setFilterStatus'
  | 'filterFavorite'
  | 'setFilterFavorite'
  | 'taskView'
  | 'setTaskView'
>

export function createTaskListSlice(set: StoreSet): TaskListSlice {
  return {
    tasks: [],
    setTasks: (tasks) => set(() => setTaskListState(tasks)),
    streamPreviews: {},
    streamPreviewSlots: {},
    setTaskStreamPreview: (taskId, image, requestIndex = 0) => {
      set((state) => setTaskStreamPreviewInState(state, taskId, image, requestIndex))
    },

    searchQuery: '',
    setSearchQuery: (searchQuery) => set(createSearchQueryState(searchQuery)),
    filterStatus: 'all',
    setFilterStatus: (filterStatus) => set(createFilterStatusState(filterStatus)),
    filterFavorite: false,
    setFilterFavorite: (filterFavorite) => set(createFilterFavoriteState(filterFavorite)),
    taskView: 'gallery',
    setTaskView: (taskView) => set(createTaskViewState(taskView)),
  }
}
