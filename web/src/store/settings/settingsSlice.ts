import type { StateCreator } from 'zustand'
import { DEFAULT_PARAMS } from '../../types'
import { DEFAULT_SETTINGS } from '../../lib/apiProfiles'
import type { AppState } from '../appState'
import { createReusedTaskApiProfileState, setParamsInState } from '../simpleActionDomain'
import { createSettingsPatch } from './settingsDomain'

type StoreSet = Parameters<StateCreator<AppState>>[0]

type SettingsSlice = Pick<
  AppState,
  | 'settings'
  | 'setSettings'
  | 'dismissedCodexCliPrompts'
  | 'dismissCodexCliPrompt'
  | 'params'
  | 'setParams'
  | 'reusedTaskApiProfileId'
  | 'reusedTaskApiProfileName'
  | 'reusedTaskApiProfileMissing'
  | 'setReusedTaskApiProfile'
>

export function createSettingsSlice(set: StoreSet): SettingsSlice {
  return {
    settings: { ...DEFAULT_SETTINGS },
    setSettings: (settings) => set((state) => createSettingsPatch(state.settings, settings, state.reusedTaskApiProfileId)),
    dismissedCodexCliPrompts: [],
    dismissCodexCliPrompt: (key) => set((state) => ({
      dismissedCodexCliPrompts: state.dismissedCodexCliPrompts.includes(key)
        ? state.dismissedCodexCliPrompts
        : [...state.dismissedCodexCliPrompts, key],
    })),

    params: { ...DEFAULT_PARAMS },
    setParams: (params) => set((state) => setParamsInState(state, params)),
    reusedTaskApiProfileId: null,
    reusedTaskApiProfileName: null,
    reusedTaskApiProfileMissing: false,
    setReusedTaskApiProfile: (profileId, missing = false, profileName = null) => {
      set(createReusedTaskApiProfileState(profileId, missing, profileName))
    },
  }
}
