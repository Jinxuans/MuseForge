import { useEffect, useRef, useState } from 'react'
import { copyTextToClipboard, getClipboardFailureMessage } from '../../../lib/clipboard'
import type { ToastType } from '../../../store/errorMessages'
import type { ApiProfile, CustomProviderDefinition } from '../../../types'
import {
  createProfileImportUrl,
  readCopyImportUrlOptions,
  saveCopyImportUrlOptions,
  type CopyImportUrlOptions,
} from './profileSettingsHelpers'

export function useProfileImportUrlActions(input: {
  customProviders: CustomProviderDefinition[]
  closeProfileMenu: () => void
  showToast: (message: string, type?: ToastType) => void
}) {
  const tooltipTimerRef = useRef<number | null>(null)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [copyImportUrlProfile, setCopyImportUrlProfile] = useState<ApiProfile | null>(null)
  const [copyImportUrlOptions, setCopyImportUrlOptions] = useState<CopyImportUrlOptions>(readCopyImportUrlOptions)

  const clearTooltipTimer = () => {
    if (tooltipTimerRef.current != null) {
      window.clearTimeout(tooltipTimerRef.current)
      tooltipTimerRef.current = null
    }
  }

  const startTooltipTouch = () => {
    clearTooltipTimer()
    tooltipTimerRef.current = window.setTimeout(() => {
      setTooltipVisible(true)
      tooltipTimerRef.current = null
    }, 450)
  }

  useEffect(() => clearTooltipTimer, [])

  const updateCopyImportUrlOptions = (patch: Partial<CopyImportUrlOptions>) => {
    setCopyImportUrlOptions((previous) => {
      const next = { ...previous, ...patch, includeApiKey: false }
      saveCopyImportUrlOptions(next)
      return next
    })
  }

  const copyProfileImportUrl = async (profile: ApiProfile, options: CopyImportUrlOptions) => {
    try {
      await copyTextToClipboard(createProfileImportUrl(profile, options, input.customProviders, window.location.href))
      input.showToast(options.includeApiKey ? '导入 URL 已复制（包含 API Key）' : '导入 URL 已复制', 'success')
      setCopyImportUrlProfile(null)
    } catch (err) {
      input.showToast(getClipboardFailureMessage('复制导入 URL 失败', err), 'error')
    }
  }

  const confirmCopyProfileImportUrl = (profile: ApiProfile) => {
    input.closeProfileMenu()
    setTooltipVisible(false)
    setCopyImportUrlProfile(profile)
    setCopyImportUrlOptions(readCopyImportUrlOptions())
  }

  return {
    profileImportUrlTooltipVisible: tooltipVisible,
    setProfileImportUrlTooltipVisible: setTooltipVisible,
    copyImportUrlProfile,
    setCopyImportUrlProfile,
    copyImportUrlOptions,
    updateCopyImportUrlOptions,
    copyProfileImportUrl,
    confirmCopyProfileImportUrl,
    startProfileImportUrlTooltipTouch: startTooltipTouch,
    clearProfileImportUrlTooltipTimer: clearTooltipTimer,
  }
}
