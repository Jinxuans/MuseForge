import type { SettingsTab } from '../appState'

export function resolveMoveCategoryTaskIds(moveCategoryTaskIds: string[] | null) {
  return moveCategoryTaskIds?.length ? moveCategoryTaskIds : null
}

export function createLightboxState(lightboxImageId: string | null, list?: string[]) {
  return {
    lightboxImageId,
    lightboxImageList: list ?? (lightboxImageId ? [lightboxImageId] : []),
  }
}

export function createSettingsVisibilityState(showSettings: boolean, settingsTabRequest?: SettingsTab) {
  return {
    showSettings,
    ...(settingsTabRequest ? { settingsTabRequest } : {}),
    ...(!showSettings ? { settingsTabRequest: null } : {}),
  }
}

export function dismissSupportPromptState() {
  return { supportPromptOpen: false, supportPromptDismissed: true }
}
