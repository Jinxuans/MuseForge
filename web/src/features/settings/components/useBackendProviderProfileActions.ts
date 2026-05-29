import { useState } from 'react'
import { createBackendProviderProfile, deleteBackendProviderProfile, updateBackendProviderProfile } from '../../../lib/backendProviderProfiles'
import type { ToastType } from '../../../store/errorMessages'
import type { ApiProfile, AppSettings, CustomProviderDefinition } from '../../../types'
import {
  applyDeletedBackendProviderProfile,
  applySavedBackendProviderProfile,
  createBackendProviderProfileInput,
} from './profileSettingsHelpers'

export function useBackendProviderProfileActions(input: {
  activeProfile: ApiProfile
  activeCustomProvider?: CustomProviderDefinition
  draft: AppSettings
  commitSettings: (nextDraft: AppSettings) => void
  showToast: (message: string, type?: ToastType) => void
}) {
  const [serverProfileBusy, setServerProfileBusy] = useState(false)

  const saveActiveProfileToServer = async () => {
    if (serverProfileBusy) return
    setServerProfileBusy(true)
    try {
      const profileInput = createBackendProviderProfileInput(input.activeProfile, input.activeCustomProvider)
      const saved = input.activeProfile.serverProfileId
        ? await updateBackendProviderProfile(input.activeProfile.serverProfileId, profileInput)
        : await createBackendProviderProfile({ ...profileInput, apiKey: input.activeProfile.apiKey.trim() })
      const serverProfileId = String(saved.id)
      const nextDraft = applySavedBackendProviderProfile(input.draft, input.activeProfile.id, serverProfileId)
      input.commitSettings(nextDraft)
      input.showToast(input.activeProfile.serverProfileId ? '服务器渠道已更新' : '服务器渠道已保存', 'success')
    } catch (err) {
      input.showToast(`服务器渠道保存失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setServerProfileBusy(false)
    }
  }

  const deleteActiveServerProfile = async () => {
    if (!input.activeProfile.serverProfileId || serverProfileBusy) return
    setServerProfileBusy(true)
    try {
      await deleteBackendProviderProfile(input.activeProfile.serverProfileId)
      const nextDraft = applyDeletedBackendProviderProfile(input.draft, input.activeProfile.id)
      input.commitSettings(nextDraft)
      input.showToast('服务器渠道已删除', 'success')
    } catch (err) {
      input.showToast(`服务器渠道删除失败：${err instanceof Error ? err.message : String(err)}`, 'error')
    } finally {
      setServerProfileBusy(false)
    }
  }

  return {
    serverProfileBusy,
    saveActiveProfileToServer,
    deleteActiveServerProfile,
  }
}
