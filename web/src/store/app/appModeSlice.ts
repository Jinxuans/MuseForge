import type { StateCreator } from 'zustand'
import { getActiveApiProfile, normalizeSettings } from '../../lib/apiProfiles'
import type { AppState } from '../appState'
import { canEnterAgentMode, createAgentModeState, createNonAgentModeState, getAgentModeUnavailableDialog } from './appModeDomain'

type StoreSet = Parameters<StateCreator<AppState>>[0]
type StoreGet = Parameters<StateCreator<AppState>>[1]

type AppModeSlice = Pick<AppState, 'appMode' | 'setAppMode'>

type AppModeSliceDeps = {
  openApiSettings: () => void
}

export function createAppModeSlice(set: StoreSet, get: StoreGet, deps: AppModeSliceDeps): AppModeSlice {
  return {
    appMode: 'gallery',
    setAppMode: (appMode) => {
      if (appMode === 'gallery' || appMode === 'square') {
        set((state) => createNonAgentModeState(state, appMode))
        return
      }

      const state = get()
      const settings = normalizeSettings(state.settings)
      const activeProfile = getActiveApiProfile(settings)

      if (canEnterAgentMode(activeProfile)) {
        set((current) => createAgentModeState(current))
        return
      }

      state.setConfirmDialog(getAgentModeUnavailableDialog(activeProfile, deps.openApiSettings))
    },
  }
}
