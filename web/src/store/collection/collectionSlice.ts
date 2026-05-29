import type { StateCreator } from 'zustand'
import { dismissAllTooltips } from '../../lib/tooltipDismiss'
import type { TaskRecord } from '../../types'
import type { AppState } from '../appState'
import { createPromptLibraryVisibilityState, createSquareShareTargetState } from '../simpleActionDomain'
import { genId } from '../shared'
import { clearTaskCategory, renameTaskCategory } from '../tasks/taskDomain'
import {
  addCategoryToList,
  addPromptLibraryItem,
  createCategoryListItem,
  createPromptLibraryItem,
  deleteCategoryFromList,
  deletePromptLibraryItemFromList,
  getActiveCategoryAfterDelete,
  renameCategoryInList,
  updatePromptLibraryItemInList,
} from './userCollectionNormalizers'

type StoreSet = Parameters<StateCreator<AppState>>[0]
type StoreGet = Parameters<StateCreator<AppState>>[1]

type CollectionSlice = Pick<
  AppState,
  | 'categories'
  | 'activeCategoryId'
  | 'setActiveCategoryId'
  | 'addCategory'
  | 'renameCategory'
  | 'deleteCategory'
  | 'promptLibrary'
  | 'showPromptLibrary'
  | 'setShowPromptLibrary'
  | 'savePromptToLibrary'
  | 'updatePromptLibraryItem'
  | 'deletePromptLibraryItem'
  | 'shareToSquareTarget'
  | 'setShareToSquareTarget'
>

type CollectionSliceDeps = {
  putTask: (task: TaskRecord) => Promise<unknown>
}

export function createCollectionSlice(set: StoreSet, get: StoreGet, deps: CollectionSliceDeps): CollectionSlice {
  return {
    categories: [],
    activeCategoryId: 'all',
    setActiveCategoryId: (activeCategoryId) => set({ activeCategoryId, selectedTaskIds: [] }),
    addCategory: (name) => {
      const category = createCategoryListItem(genId(), name)
      if (!category) return null
      set((state) => ({
        categories: addCategoryToList(state.categories, category),
        activeCategoryId: category.id,
      }))
      return category.id
    },
    renameCategory: (id, name) => {
      const trimmed = name.trim()
      if (!trimmed) return
      set((state) => ({
        categories: renameCategoryInList(state.categories, id, trimmed),
        tasks: renameTaskCategory(state.tasks, id, trimmed),
      }))
      for (const task of get().tasks.filter((item) => item.categoryId === id)) void deps.putTask(task)
    },
    deleteCategory: (id) => {
      set((state) => ({
        categories: deleteCategoryFromList(state.categories, id),
        activeCategoryId: getActiveCategoryAfterDelete(state.activeCategoryId, id),
        tasks: clearTaskCategory(state.tasks, id),
      }))
      for (const task of get().tasks.filter((item) => item.categoryId == null && item.categoryName == null)) void deps.putTask(task)
    },

    promptLibrary: [],
    showPromptLibrary: false,
    setShowPromptLibrary: (showPromptLibrary) => {
      if (showPromptLibrary) dismissAllTooltips()
      set(createPromptLibraryVisibilityState(showPromptLibrary))
    },
    savePromptToLibrary: (content, title) => {
      const item = createPromptLibraryItem(genId(), content, title)
      if (!item) return
      set((state) => ({ promptLibrary: addPromptLibraryItem(state.promptLibrary, item) }))
    },
    updatePromptLibraryItem: (id, patch) => set((state) => ({
      promptLibrary: updatePromptLibraryItemInList(state.promptLibrary, id, patch),
    })),
    deletePromptLibraryItem: (id) => set((state) => ({
      promptLibrary: deletePromptLibraryItemFromList(state.promptLibrary, id),
    })),
    shareToSquareTarget: null,
    setShareToSquareTarget: (shareToSquareTarget) => {
      if (shareToSquareTarget) dismissAllTooltips()
      set(createSquareShareTargetState(shareToSquareTarget))
    },
  }
}
