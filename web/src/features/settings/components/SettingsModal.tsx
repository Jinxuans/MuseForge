import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { isApiProxyAvailable, isApiProxyLocked, readClientDevProxyConfig } from '../../../lib/devProxy'
import { useStore, exportData, importData, clearData, type SettingsTab } from '../../../store'
import {
  DEFAULT_SETTINGS,
  getActiveApiProfile,
  importCustomProviderSettingsFromJson,
  isOpenAICompatibleProvider,
  mergeImportedSettings,
  normalizeAgentMaxToolRounds,
  normalizeCustomProviderDefinition,
  normalizeSettings,
  switchApiProfileProvider,
} from '../../../lib/apiProfiles'
import { copyTextToClipboard, getClipboardFailureMessage } from '../../../lib/clipboard'
import { DEFAULT_AGENT_MAX_TOOL_ROUNDS, type ApiProfile, type AppSettings, type CustomProviderDefinition } from '../../../types'
import { useCloseOnEscape } from '../../../hooks/useCloseOnEscape'
import { usePreventBackgroundScroll } from '../../../hooks/usePreventBackgroundScroll'
import { CloseIcon, DragHandleIcon, SettingsIcon } from '../../../shared/ui/icons'
import AboutSettingsTab from './AboutSettingsTab'
import AgentSettingsTab from './AgentSettingsTab'
import ApiSettingsTab from './ApiSettingsTab'
import DataSettingsTab from './DataSettingsTab'
import GeneralSettingsTab from './GeneralSettingsTab'
import CustomProviderEditor from './CustomProviderEditor'
import ProfileImportUrlDialog from './ProfileImportUrlDialog'
import SettingsSidebar from './SettingsSidebar'
import { useBackendProviderProfileActions } from './useBackendProviderProfileActions'
import { useProfileListBehavior } from './useProfileListBehavior'
import { useProfileImportUrlActions } from './useProfileImportUrlActions'
import {
  createDefaultCustomProviderForm,
  customProviderFormToInput,
  customProviderToForm,
  CUSTOM_PROVIDER_LLM_PROMPT,
  type CustomProviderForm,
} from './customProvider'
import {
  ADD_CUSTOM_PROVIDER_VALUE,
  getImportedProfileFromMergedSettings,
  isPristineNewOpenAIProfile,
  normalizeSettingsDraftForCommit,
} from './profileSettingsHelpers'

export default function SettingsModal() {
  const showSettings = useStore((s) => s.showSettings)
  const settingsTabRequest = useStore((s) => s.settingsTabRequest)
  const setShowSettings = useStore((s) => s.setShowSettings)
  const settings = useStore((s) => s.settings)
  const setSettings = useStore((s) => s.setSettings)
  const reusedTaskApiProfileId = useStore((s) => s.reusedTaskApiProfileId)
  const setReusedTaskApiProfile = useStore((s) => s.setReusedTaskApiProfile)
  const setConfirmDialog = useStore((s) => s.setConfirmDialog)
  const showToast = useStore((s) => s.showToast)
  const importInputRef = useRef<HTMLInputElement>(null)

  const duplicateProfileTooltipTimerRef = useRef<number | null>(null)
  const llmPromptTooltipTimerRef = useRef<number | null>(null)
  const settingsScrollBoundaryRef = useRef<HTMLDivElement>(null)
  const customProviderScrollBoundaryRef = useRef<HTMLDivElement>(null)
  
  const [draft, setDraft] = useState<AppSettings>(normalizeSettings(settings))
  const [timeoutInput, setTimeoutInput] = useState(String(getActiveApiProfile(settings).timeout))
  const [agentMaxToolRoundsInput, setAgentMaxToolRoundsInput] = useState(String(settings.agentMaxToolRounds))
  const [showApiKey, setShowApiKey] = useState(false)
  const [showCustomProviderImport, setShowCustomProviderImport] = useState(false)
  const [editingCustomProviderId, setEditingCustomProviderId] = useState<string | null>(null)
  const [customProviderForm, setCustomProviderForm] = useState<CustomProviderForm>(createDefaultCustomProviderForm())
  const [customProviderImportError, setCustomProviderImportError] = useState<string | null>(null)
  const [duplicateProfileTooltipVisible, setDuplicateProfileTooltipVisible] = useState(false)
  const [llmPromptTooltipVisible, setLlmPromptTooltipVisible] = useState(false)
  const [activeTab, setActiveTab] = useState<SettingsTab>('api')
  const [exportConfig, setExportConfig] = useState(true)
  const [exportTasks, setExportTasks] = useState(true)
  const [importConfig, setImportConfig] = useState(true)
  const [importTasks, setImportTasks] = useState(true)
  const [clearConfig, setClearConfig] = useState(true)
  const [clearTasks, setClearTasks] = useState(true)
  const [isImportingData, setIsImportingData] = useState(false)
  const [isImportingJson, setIsImportingJson] = useState(false)

  const apiProxyConfig = readClientDevProxyConfig()
  const apiProxyAvailable = isApiProxyAvailable(apiProxyConfig)
  const apiProxyLocked = isApiProxyLocked(apiProxyConfig)
  const activeProfile = draft.profiles.find((profile) => profile.id === draft.activeProfileId) ?? draft.profiles[0] ?? getActiveApiProfile(draft)
  const directApiAccessEnabled = activeProfile.provider === 'openai' && !!activeProfile.directApiAccess
  const apiProxyChecked = directApiAccessEnabled && (apiProxyLocked || activeProfile.apiProxy)
  const apiProxyEnabled = apiProxyAvailable && activeProfile.provider === 'openai' && apiProxyChecked
  const activeProviderIsOpenAICompatible = isOpenAICompatibleProvider(draft, activeProfile.provider)
  const activeProviderUsesApiUrl = activeProviderIsOpenAICompatible || activeProfile.provider === 'fal'
  const activeCustomProvider = draft.customProviders.find((provider) => provider.id === activeProfile.provider)
  const defaultProviderOrder = ['openai', 'fal', ...draft.customProviders.map(p => p.id)]
  const providerOrder = draft.providerOrder || defaultProviderOrder

  const unorderedProviderOptions = [
    { label: 'OpenAI 兼容接口', value: 'openai', draggable: true },
    { label: 'fal.ai', value: 'fal', draggable: true },
    ...draft.customProviders.map((provider) => ({
      label: provider.name,
      value: provider.id,
      draggable: true,
      actions: [
        { label: '编辑', onClick: () => openEditCustomProvider(provider) },
        {
          label: '删除',
          variant: 'danger' as const,
          onClick: () => confirmDeleteCustomProvider(provider),
        },
      ],
    })),
  ]

  const providerOptions = [
    { label: '创建自定义服务商', value: ADD_CUSTOM_PROVIDER_VALUE, variant: 'action' as const },
    ...unorderedProviderOptions.sort((a, b) => {
      const aIndex = providerOrder.indexOf(String(a.value))
      const bIndex = providerOrder.indexOf(String(b.value))
      const validA = aIndex !== -1 ? aIndex : defaultProviderOrder.indexOf(String(a.value))
      const validB = bIndex !== -1 ? bIndex : defaultProviderOrder.indexOf(String(b.value))
      return validA - validB
    })
  ]

  const wasSettingsOpenRef = useRef(false)

  useEffect(() => {
    if (!showSettings) {
      wasSettingsOpenRef.current = false
      return
    }
    if (wasSettingsOpenRef.current) return

    wasSettingsOpenRef.current = true
    const normalizedSettings = normalizeSettings(settings)
    const displaySettings = normalizedSettings.reuseTaskApiProfileTemporarily && reusedTaskApiProfileId && normalizedSettings.profiles.some((profile) => profile.id === reusedTaskApiProfileId)
      ? normalizeSettings({ ...normalizedSettings, activeProfileId: reusedTaskApiProfileId })
      : normalizedSettings
    const nextDraft = normalizeSettings({
      ...displaySettings,
      profiles: displaySettings.profiles.map((profile) => ({
        ...profile,
        apiProxy: profile.provider === 'openai' && apiProxyAvailable
          ? (apiProxyLocked || profile.apiProxy)
          : false,
      })),
    })
    setDraft(nextDraft)
    setTimeoutInput(String(getActiveApiProfile(nextDraft).timeout))
    setAgentMaxToolRoundsInput(String(nextDraft.agentMaxToolRounds))
  }, [apiProxyAvailable, apiProxyLocked, showSettings, settings, reusedTaskApiProfileId])

  useEffect(() => {
    setTimeoutInput(String(activeProfile.timeout))
  }, [activeProfile.id, activeProfile.timeout])

  useEffect(() => {
    if (showSettings && settingsTabRequest) setActiveTab(settingsTabRequest)
  }, [settingsTabRequest, showSettings])

  useEffect(() => () => {
    if (duplicateProfileTooltipTimerRef.current != null) window.clearTimeout(duplicateProfileTooltipTimerRef.current)
    if (llmPromptTooltipTimerRef.current != null) window.clearTimeout(llmPromptTooltipTimerRef.current)
  }, [])

  const clearDuplicateProfileTooltipTimer = () => {
    if (duplicateProfileTooltipTimerRef.current != null) {
      window.clearTimeout(duplicateProfileTooltipTimerRef.current)
      duplicateProfileTooltipTimerRef.current = null
    }
  }

  const clearLlmPromptTooltipTimer = () => {
    if (llmPromptTooltipTimerRef.current != null) {
      window.clearTimeout(llmPromptTooltipTimerRef.current)
      llmPromptTooltipTimerRef.current = null
    }
  }

  const closeCustomProviderEditor = () => {
    setShowCustomProviderImport(false)
    setEditingCustomProviderId(null)
  }

  const startLlmPromptTooltipTouch = () => {
    clearLlmPromptTooltipTimer()
    llmPromptTooltipTimerRef.current = window.setTimeout(() => {
      setLlmPromptTooltipVisible(true)
      llmPromptTooltipTimerRef.current = null
    }, 450)
  }

  const commitSettings = (nextDraft: AppSettings) => {
    const normalizedDraft = normalizeSettingsDraftForCommit(nextDraft, { apiProxyAvailable, apiProxyLocked })
    setDraft(normalizedDraft)
    setSettings(normalizedDraft)
  }

  const {
    serverProfileBusy,
    saveActiveProfileToServer,
    deleteActiveServerProfile,
  } = useBackendProviderProfileActions({
    activeProfile,
    activeCustomProvider,
    draft,
    commitSettings,
    showToast,
  })

  const {
    profileMenuRef,
    profileMenuTriggerRef,
    showProfileMenu,
    setShowProfileMenu,
    profileMenuMaxHeight,
    updateProfileMenuMaxHeight,
    draggedProfileId,
    dragOverProfileId,
    dragDropPosition,
    profileTouchDragPreview,
    createNewProfile,
    duplicateActiveProfile,
    switchProfile,
    handleProfileDragStart,
    handleProfileDragOver,
    handleProfileDragEnd,
    handleProfileDrop,
    handleProfileTouchStart,
    handleProfileTouchMove,
    handleProfileTouchEnd,
    deleteProfile,
  } = useProfileListBehavior({
    draft,
    activeProfile,
    reusedTaskApiProfileId,
    setReusedTaskApiProfile,
    commitSettings,
    hideDuplicateTooltip: () => setDuplicateProfileTooltipVisible(false),
  })

  const {
    profileImportUrlTooltipVisible,
    setProfileImportUrlTooltipVisible,
    copyImportUrlProfile,
    setCopyImportUrlProfile,
    copyImportUrlOptions,
    updateCopyImportUrlOptions,
    copyProfileImportUrl,
    confirmCopyProfileImportUrl,
    startProfileImportUrlTooltipTouch,
    clearProfileImportUrlTooltipTimer,
  } = useProfileImportUrlActions({
    customProviders: draft.customProviders,
    closeProfileMenu: () => setShowProfileMenu(false),
    showToast,
  })

  const getDraftWithActiveProfilePatch = (patch: Partial<ApiProfile>) => ({
      ...draft,
      profiles: draft.profiles.map((profile) => profile.id === activeProfile.id ? { ...profile, ...patch } : profile),
    })

  const updateActiveProfile = (patch: Partial<ApiProfile>, commit = false) => {
    const nextDraft = getDraftWithActiveProfilePatch(patch)
    setDraft(nextDraft)
    if (commit) commitSettings(nextDraft)
  }

  const commitActiveProfilePatch = (patch: Partial<ApiProfile>) => {
    const nextDraft = getDraftWithActiveProfilePatch(patch)
    commitSettings(nextDraft)
  }

  const handleClose = () => {
    const nextTimeout = Number(timeoutInput)
    const normalizedTimeout =
      timeoutInput.trim() === '' || Number.isNaN(nextTimeout)
        ? DEFAULT_SETTINGS.timeout
        : nextTimeout
    const normalizedAgentMaxToolRounds = agentMaxToolRoundsInput.trim() === ''
      ? DEFAULT_AGENT_MAX_TOOL_ROUNDS
      : normalizeAgentMaxToolRounds(agentMaxToolRoundsInput, draft.agentMaxToolRounds)
    const nextDraft = {
      ...draft,
      agentMaxToolRounds: normalizedAgentMaxToolRounds,
      profiles: activeProviderIsOpenAICompatible
        ? draft.profiles.map((profile) =>
            profile.id === activeProfile.id ? { ...profile, timeout: normalizedTimeout } : profile,
          )
        : draft.profiles,
    }
    setAgentMaxToolRoundsInput(String(normalizedAgentMaxToolRounds))
    commitSettings(nextDraft)
    setShowSettings(false)
  }

  const commitTimeout = useCallback(() => {
    if (!isOpenAICompatibleProvider(draft, activeProfile.provider)) return
    const nextTimeout = Number(timeoutInput)
    const normalizedTimeout =
      timeoutInput.trim() === '' ? DEFAULT_SETTINGS.timeout : Number.isNaN(nextTimeout) ? activeProfile.timeout : nextTimeout
    setTimeoutInput(String(normalizedTimeout))
    updateActiveProfile({ timeout: normalizedTimeout }, true)
  }, [draft, activeProfile.id, activeProfile.provider, activeProfile.timeout, timeoutInput])

  const commitAgentMaxToolRounds = useCallback(() => {
    const value = agentMaxToolRoundsInput.trim() === ''
      ? DEFAULT_AGENT_MAX_TOOL_ROUNDS
      : normalizeAgentMaxToolRounds(agentMaxToolRoundsInput, draft.agentMaxToolRounds)
    setAgentMaxToolRoundsInput(String(value))
    if (value !== draft.agentMaxToolRounds) commitSettings({ ...draft, agentMaxToolRounds: value })
  }, [agentMaxToolRoundsInput, draft])

  useCloseOnEscape(showSettings, handleClose)
  usePreventBackgroundScroll(showSettings, showCustomProviderImport ? customProviderScrollBoundaryRef : settingsScrollBoundaryRef)

  if (!showSettings) return null

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setIsImportingData(true)
      try {
        const imported = await importData(file, { importConfig, importTasks })
        if (imported) {
          const nextDraft = normalizeSettings(useStore.getState().settings)
          setDraft(nextDraft)
          setTimeoutInput(String(getActiveApiProfile(nextDraft).timeout))
          setShowProfileMenu(false)
        }
      } finally {
        setIsImportingData(false)
      }
    }
    e.target.value = ''
  }

  const handleClearAllData = async () => {
    await clearData({ clearConfig, clearTasks })
    const nextDraft = normalizeSettings(useStore.getState().settings)
    setDraft(nextDraft)
    setTimeoutInput(String(getActiveApiProfile(nextDraft).timeout))
    setShowProfileMenu(false)
  }

  const handleProviderReorder = (sourceValue: string | number, targetValue: string | number, position: 'before' | 'after' | null) => {
    const currentOrder = draft.providerOrder || ['openai', 'fal', ...draft.customProviders.map(p => p.id)]
    const sourceIndex = currentOrder.indexOf(String(sourceValue))
    const targetIndex = currentOrder.indexOf(String(targetValue))
    if (sourceIndex < 0 || targetIndex < 0) return

    const newOrder = [...currentOrder]
    const [removed] = newOrder.splice(sourceIndex, 1)

    let newTargetIndex = targetIndex
    if (position === 'after') newTargetIndex++
    if (sourceIndex < targetIndex) newTargetIndex--

    newOrder.splice(newTargetIndex, 0, removed)

    const nextDraft = normalizeSettings({ ...draft, providerOrder: newOrder })
    commitSettings(nextDraft)
  }

  const handleProviderTypeChange = (value: string | number) => {
    if (value === ADD_CUSTOM_PROVIDER_VALUE) {
      setEditingCustomProviderId(null)
      setCustomProviderForm(createDefaultCustomProviderForm())
      setShowCustomProviderImport(true)
      setCustomProviderImportError(null)
      return
    }

    const provider = String(value) as ApiProfile['provider']
    const customProvider = draft.customProviders.find((item) => item.id === provider)
    updateActiveProfile(switchApiProfileProvider(activeProfile, provider, customProvider), true)
  }

  const updateCustomProviderForm = (patch: Partial<CustomProviderForm>) => {
    setCustomProviderForm((current) => ({ ...current, ...patch }))
    setCustomProviderImportError(null)
  }

  const buildCustomProviderFromForm = () => {
    const input = customProviderFormToInput(customProviderForm)
    const usedIds = new Set(
      draft.customProviders
        .filter((item) => item.id !== editingCustomProviderId)
        .map((item) => item.id),
    )
    const provider = normalizeCustomProviderDefinition(
      editingCustomProviderId && input && typeof input === 'object'
        ? { ...input, id: editingCustomProviderId }
        : input,
      usedIds,
    )
    if (!provider) throw new Error('自定义服务商配置无效')
    return provider
  }

  function openEditCustomProvider(provider: CustomProviderDefinition) {
    setEditingCustomProviderId(provider.id)
    setCustomProviderForm(customProviderToForm(provider))
    setShowCustomProviderImport(true)
    setCustomProviderImportError(null)
  }

  const saveCustomProvider = () => {
    try {
      const customProvider = buildCustomProviderFromForm()
      if (editingCustomProviderId) {
        const nextDraft = normalizeSettings({
          ...draft,
          customProviders: draft.customProviders.map((provider) =>
            provider.id === editingCustomProviderId ? customProvider : provider,
          ),
        })
        commitSettings(nextDraft)
        setShowCustomProviderImport(false)
        setEditingCustomProviderId(null)
        setCustomProviderImportError(null)
        showToast('服务商配置已更新', 'success')
        return
      }

      const nextProfile = switchApiProfileProvider(activeProfile, customProvider.id, customProvider)
      const nextDraft = normalizeSettings({
        ...draft,
        customProviders: [...draft.customProviders, customProvider],
        profiles: draft.profiles.map((profile) => profile.id === activeProfile.id ? nextProfile : profile),
      })
      commitSettings(nextDraft)
      setShowCustomProviderImport(false)
      setEditingCustomProviderId(null)
      setCustomProviderImportError(null)
    } catch (err) {
      setCustomProviderImportError(err instanceof Error ? err.message : String(err))
    }
  }

  function confirmDeleteCustomProvider(provider: CustomProviderDefinition) {
    setConfirmDialog({
      title: '删除服务商',
      message: `确定要删除自定义服务商「${provider.name}」吗？正在使用它的配置会切回 OpenAI 兼容接口。`,
      action: () => deleteCustomProvider(provider),
    })
  }

  function deleteCustomProvider(provider: CustomProviderDefinition) {
    const providerId = provider.id
    const nextDraft = normalizeSettings({
      ...draft,
      customProviders: draft.customProviders.filter((provider) => provider.id !== providerId),
      profiles: draft.profiles.map((profile) =>
        profile.provider === providerId ? switchApiProfileProvider(profile, 'openai') : profile,
      ),
    })
    commitSettings(nextDraft)
    showToast('服务商已删除', 'success')
  }

  const copyCustomProviderLlmPrompt = async () => {
    try {
      await copyTextToClipboard(CUSTOM_PROVIDER_LLM_PROMPT)
      showToast('LLM 生成提示词已复制', 'success')
    } catch (err) {
      showToast(getClipboardFailureMessage('复制 LLM 生成提示词失败', err), 'error')
    }
  }

  const handleCustomProviderJsonPaste = async () => {
    setIsImportingJson(true)
    try {
      const text = await navigator.clipboard.readText()
      if (!text.trim()) {
        throw new Error('剪贴板为空')
      }
      const imported = importCustomProviderSettingsFromJson(text, draft.customProviders)
      if (imported.profiles.length > 0) {
        const previousProfileIds = new Set(draft.profiles.map((profile) => profile.id))
        const mergedDraft = mergeImportedSettings(draft, imported)
        const importedProfile = getImportedProfileFromMergedSettings(mergedDraft, previousProfileIds, imported)
        const importedProfileAlreadyExisted = previousProfileIds.has(importedProfile.id)
        const shouldReplaceActiveProfile = !editingCustomProviderId && isPristineNewOpenAIProfile(activeProfile) && !importedProfileAlreadyExisted
        const switchedToExistingProfile = !shouldReplaceActiveProfile && importedProfileAlreadyExisted
        const nextDraft = shouldReplaceActiveProfile
          ? normalizeSettings({
              ...mergedDraft,
              profiles: mergedDraft.profiles
                .filter((profile) => profile.id === activeProfile.id || profile.id !== importedProfile.id)
                .map((profile) => profile.id === activeProfile.id ? { ...importedProfile, id: activeProfile.id } : profile),
              activeProfileId: activeProfile.id,
            })
          : normalizeSettings({
              ...mergedDraft,
              activeProfileId: importedProfile.id,
            })
        setDraft(nextDraft)
        setSettings(nextDraft)
        setTimeoutInput(String(getActiveApiProfile(nextDraft).timeout))
        setShowCustomProviderImport(false)
        setEditingCustomProviderId(null)
        setCustomProviderImportError(null)
        showToast(shouldReplaceActiveProfile ? '已覆盖当前空配置' : switchedToExistingProfile ? '已存在相同配置，已切换到已有配置' : 'JSON 配置已导入并切换', 'success')
        return
      }

      const provider = imported.customProviders[0]
      setCustomProviderForm(customProviderToForm(provider))
      setCustomProviderImportError(null)
      showToast('JSON 配置已导入', 'success')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setCustomProviderImportError(null)
      if (err instanceof Error && err.name === 'NotAllowedError') {
        showToast('无法读取剪贴板，请允许浏览器访问剪贴板，或直接粘贴到输入框中', 'error')
      } else {
        showToast(msg, 'error')
      }
    } finally {
      setIsImportingJson(false)
    }
  }

  return (
        <div data-no-drag-select className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm animate-overlay-in"
        onClick={handleClose}
      />
      <div
        ref={settingsScrollBoundaryRef}
        className="relative z-10 w-full max-w-3xl rounded-3xl border border-white/50 bg-white/95 shadow-2xl ring-1 ring-black/5 animate-modal-in dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10 flex h-[85vh] sm:h-[600px] flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 p-5 border-b border-gray-100 dark:border-white/[0.08]">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-blue-500" />
            设置
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-400 dark:text-gray-500 font-mono select-none">v{__APP_VERSION__}</span>
            <button
              onClick={handleClose}
              className="rounded-full p-1 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
              aria-label="关闭"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 flex-col sm:flex-row">
          <SettingsSidebar activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Content */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-transparent relative overflow-hidden">
            <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar p-5 sm:p-6">
            {activeTab === 'general' && (
              <GeneralSettingsTab draft={draft} onCommitSettings={commitSettings} />
            )}

            {activeTab === 'agent' && (
              <AgentSettingsTab
                draft={draft}
                agentMaxToolRoundsInput={agentMaxToolRoundsInput}
                onAgentMaxToolRoundsInputChange={setAgentMaxToolRoundsInput}
                onCommitAgentMaxToolRounds={commitAgentMaxToolRounds}
                onCommitSettings={commitSettings}
              />
            )}
            
            {activeTab === 'api' && (
              <ApiSettingsTab
                draft={draft}
                activeProfile={activeProfile}
                activeCustomProvider={activeCustomProvider}
                providerOptions={providerOptions}
                activeProviderUsesApiUrl={activeProviderUsesApiUrl}
                activeProviderIsOpenAICompatible={activeProviderIsOpenAICompatible}
                directApiAccessEnabled={directApiAccessEnabled}
                apiProxyAvailable={apiProxyAvailable}
                apiProxyLocked={apiProxyLocked}
                apiProxyChecked={apiProxyChecked}
                apiProxyEnabled={apiProxyEnabled}
                showApiKey={showApiKey}
                timeoutInput={timeoutInput}
                profileImportUrlTooltipVisible={profileImportUrlTooltipVisible}
                duplicateProfileTooltipVisible={duplicateProfileTooltipVisible}
                profileMenuRef={profileMenuRef}
                profileMenuTriggerRef={profileMenuTriggerRef}
                showProfileMenu={showProfileMenu}
                profileMenuMaxHeight={profileMenuMaxHeight}
                draggedProfileId={draggedProfileId}
                dragOverProfileId={dragOverProfileId}
                dragDropPosition={dragDropPosition}
                serverProfileBusy={serverProfileBusy}
                onCopyProfileImportUrl={confirmCopyProfileImportUrl}
                onDuplicateActiveProfile={duplicateActiveProfile}
                onProfileImportUrlTooltipVisibleChange={setProfileImportUrlTooltipVisible}
                onDuplicateProfileTooltipVisibleChange={setDuplicateProfileTooltipVisible}
                onStartProfileImportUrlTooltipTouch={startProfileImportUrlTooltipTouch}
                onClearProfileImportUrlTooltipTimer={clearProfileImportUrlTooltipTimer}
                onStartDuplicateProfileTooltipTouch={() => {
                  clearDuplicateProfileTooltipTimer()
                  duplicateProfileTooltipTimerRef.current = window.setTimeout(() => {
                    setDuplicateProfileTooltipVisible(true)
                    duplicateProfileTooltipTimerRef.current = null
                  }, 450)
                }}
                onClearDuplicateProfileTooltipTimer={clearDuplicateProfileTooltipTimer}
                onUpdateProfileMenuMaxHeight={updateProfileMenuMaxHeight}
                onProfileMenuVisibleChange={setShowProfileMenu}
                onCreateNewProfile={createNewProfile}
                onProfileDragStart={handleProfileDragStart}
                onProfileDragOver={handleProfileDragOver}
                onProfileDrop={handleProfileDrop}
                onProfileDragEnd={handleProfileDragEnd}
                onProfileTouchStart={handleProfileTouchStart}
                onProfileTouchMove={handleProfileTouchMove}
                onProfileTouchEnd={handleProfileTouchEnd}
                onSwitchProfile={switchProfile}
                onRequestDeleteProfile={(profile) =>
                  setConfirmDialog({
                    title: '删除配置',
                    message: `确定要删除配置「${profile.name}」吗？`,
                    action: () => deleteProfile(profile.id),
                  })
                }
                onRequestDeleteServerProfile={() =>
                  setConfirmDialog({
                    title: '删除服务器渠道',
                    message: `确定要删除服务器渠道「${activeProfile.name}」吗？`,
                    action: deleteActiveServerProfile,
                  })
                }
                onSaveActiveProfileToServer={() => void saveActiveProfileToServer()}
                onUpdateActiveProfile={updateActiveProfile}
                onCommitActiveProfilePatch={commitActiveProfilePatch}
                onProviderTypeChange={handleProviderTypeChange}
                onProviderReorder={handleProviderReorder}
                onToggleShowApiKey={() => setShowApiKey((visible) => !visible)}
                onTimeoutInputChange={setTimeoutInput}
                onCommitTimeout={commitTimeout}
              />
            )}
            
            {activeTab === 'data' && (
              <DataSettingsTab
                exportConfig={exportConfig}
                exportTasks={exportTasks}
                importConfig={importConfig}
                importTasks={importTasks}
                clearConfig={clearConfig}
                clearTasks={clearTasks}
                isImportingData={isImportingData}
                importInputRef={importInputRef}
                onExportConfigChange={setExportConfig}
                onExportTasksChange={setExportTasks}
                onImportConfigChange={setImportConfig}
                onImportTasksChange={setImportTasks}
                onClearConfigChange={setClearConfig}
                onClearTasksChange={setClearTasks}
                onExport={() => exportData({ exportConfig, exportTasks })}
                onImportClick={() => importInputRef.current?.click()}
                onImport={handleImport}
                onClearClick={() =>
                  setConfirmDialog({
                    title: '清空所选数据',
                    message: `确定要清空所选的数据吗？此操作不可恢复。`,
                    action: () => handleClearAllData(),
                  })
                }
              />
            )}

            {activeTab === 'about' && (
              <AboutSettingsTab />
            )}
          </div>
        </div>
      </div>
      </div>

        {showCustomProviderImport && (
          <CustomProviderEditor
            editingCustomProviderId={editingCustomProviderId}
            customProviderForm={customProviderForm}
            customProviderImportError={customProviderImportError}
            isImportingJson={isImportingJson}
            llmPromptTooltipVisible={llmPromptTooltipVisible}
            customProviderScrollBoundaryRef={customProviderScrollBoundaryRef}
            onClose={closeCustomProviderEditor}
            onCopyLlmPrompt={copyCustomProviderLlmPrompt}
            onLlmPromptTooltipVisibleChange={setLlmPromptTooltipVisible}
            onLlmPromptTooltipTouchStart={startLlmPromptTooltipTouch}
            onClearLlmPromptTooltipTimer={clearLlmPromptTooltipTimer}
            onPasteJson={handleCustomProviderJsonPaste}
            onFormChange={updateCustomProviderForm}
            onSave={saveCustomProvider}
          />
        )}
        {profileTouchDragPreview && createPortal(
          <div
            className="fixed pointer-events-none z-[110] flex items-center justify-between gap-2 rounded-xl bg-white/95 px-3 py-2 text-xs text-gray-700 shadow-xl ring-1 ring-black/5 backdrop-blur-xl dark:bg-gray-900/95 dark:text-gray-300 dark:ring-white/10"
            style={{
              left: profileTouchDragPreview.x - profileTouchDragPreview.offsetX,
              top: profileTouchDragPreview.y - profileTouchDragPreview.offsetY,
              width: profileTouchDragPreview.width,
              minHeight: profileTouchDragPreview.height,
            }}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
              <DragHandleIcon className="h-3.5 w-3.5 shrink-0 text-gray-400 dark:text-gray-500" />
              <span className="min-w-0 truncate">{profileTouchDragPreview.label}</span>
              <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-white/[0.08] dark:text-gray-400">
                {profileTouchDragPreview.providerLabel}
              </span>
            </div>
          </div>,
          document.body,
        )}
        {copyImportUrlProfile && (
          <ProfileImportUrlDialog
            profile={copyImportUrlProfile}
            options={copyImportUrlOptions}
            onOptionsChange={updateCopyImportUrlOptions}
            onCopy={(options) => copyProfileImportUrl(copyImportUrlProfile, options)}
            onClose={() => setCopyImportUrlProfile(null)}
          />
        )}
    </div>
  )
}
