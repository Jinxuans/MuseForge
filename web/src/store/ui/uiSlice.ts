import type { StateCreator } from 'zustand'
import { dismissAllTooltips } from '../../lib/tooltipDismiss'
import type { AppState } from '../appState'
import { resolveSelectedTaskIds, toggleTaskSelectionInList } from '../shared'
import { clearToastIfCurrent, createConfirmDialogState, createDetailTaskState, createToastState } from '../simpleActionDomain'
import { createLightboxState, createSettingsVisibilityState, dismissSupportPromptState, resolveMoveCategoryTaskIds } from './uiDomain'

type StoreSet = Parameters<StateCreator<AppState>>[0]

type UiSlice = Pick<
  AppState,
  | 'selectedTaskIds'
  | 'setSelectedTaskIds'
  | 'toggleTaskSelection'
  | 'clearSelection'
  | 'detailTaskId'
  | 'setDetailTaskId'
  | 'lightboxImageId'
  | 'lightboxImageList'
  | 'setLightboxImageId'
  | 'showSettings'
  | 'settingsTabRequest'
  | 'setShowSettings'
  | 'supportPromptOpen'
  | 'supportPromptDismissed'
  | 'supportPromptSkippedForImportedData'
  | 'setSupportPromptOpen'
  | 'dismissSupportPrompt'
  | 'moveCategoryTaskIds'
  | 'setMoveCategoryTaskIds'
  | 'toast'
  | 'showToast'
  | 'confirmDialog'
  | 'setConfirmDialog'
>

export function createUiSlice(set: StoreSet): UiSlice {
  return {
    selectedTaskIds: [],
    setSelectedTaskIds: (updater) => set((state) => ({
      selectedTaskIds: resolveSelectedTaskIds(updater, state.selectedTaskIds),
    })),
    toggleTaskSelection: (id, force) => set((state) => ({
      selectedTaskIds: toggleTaskSelectionInList(state.selectedTaskIds, id, force),
    })),
    clearSelection: () => set({ selectedTaskIds: [] }),

    detailTaskId: null,
    setDetailTaskId: (detailTaskId) => {
      if (detailTaskId) dismissAllTooltips()
      set(createDetailTaskState(detailTaskId))
    },
    lightboxImageId: null,
    lightboxImageList: [],
    setLightboxImageId: (lightboxImageId, list) => {
      if (lightboxImageId) dismissAllTooltips()
      set(createLightboxState(lightboxImageId, list))
    },
    showSettings: false,
    settingsTabRequest: null,
    setShowSettings: (showSettings, settingsTabRequest) => {
      if (showSettings) dismissAllTooltips()
      set(createSettingsVisibilityState(showSettings, settingsTabRequest))
    },
    supportPromptOpen: false,
    supportPromptDismissed: false,
    supportPromptSkippedForImportedData: false,
    setSupportPromptOpen: (supportPromptOpen) => set({ supportPromptOpen }),
    dismissSupportPrompt: () => set(dismissSupportPromptState()),
    moveCategoryTaskIds: null,
    setMoveCategoryTaskIds: (moveCategoryTaskIds) => {
      if (moveCategoryTaskIds?.length) dismissAllTooltips()
      set({ moveCategoryTaskIds: resolveMoveCategoryTaskIds(moveCategoryTaskIds) })
    },

    toast: null,
    showToast: (message, type = 'info') => {
      const { toast } = createToastState(message, type)
      set({ toast })
      setTimeout(() => {
        set((state) => clearToastIfCurrent(state, toast))
      }, 3000)
    },

    confirmDialog: null,
    setConfirmDialog: (confirmDialog) => {
      if (confirmDialog) dismissAllTooltips()
      set(createConfirmDialogState(confirmDialog))
    },
  }
}
