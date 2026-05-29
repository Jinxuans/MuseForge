import type { DragEvent, RefObject, TouchEvent } from 'react'
import {
  DEFAULT_FAL_BASE_URL,
  DEFAULT_FAL_MODEL,
  DEFAULT_IMAGES_MODEL,
  DEFAULT_RESPONSES_MODEL,
  DEFAULT_SETTINGS,
  getApiProviderLabel,
  normalizeStreamPartialImages,
} from '../../../lib/apiProfiles'
import Select from '../../../shared/ui/Select'
import { ChevronDownIcon, DragHandleIcon, EyeIcon, EyeOffIcon, LinkIcon, PlusIcon, TrashIcon } from '../../../shared/ui/icons'
import type { ApiProfile, AppSettings, CustomProviderDefinition } from '../../../types'
import ProfileHeaderActions from './ProfileHeaderActions'
import { getDefaultModelForMode } from './profileSettingsHelpers'

type ProviderOption = {
  label: string
  value: string | number
  variant?: 'action' | 'danger'
  draggable?: boolean
  actions?: Array<{
    label: string
    variant?: 'danger'
    onClick: () => void
  }>
}

type ApiSettingsTabProps = {
  draft: AppSettings
  activeProfile: ApiProfile
  activeCustomProvider?: CustomProviderDefinition
  providerOptions: ProviderOption[]
  activeProviderUsesApiUrl: boolean
  activeProviderIsOpenAICompatible: boolean
  directApiAccessEnabled: boolean
  apiProxyAvailable: boolean
  apiProxyLocked: boolean
  apiProxyChecked: boolean
  apiProxyEnabled: boolean
  showApiKey: boolean
  timeoutInput: string
  profileImportUrlTooltipVisible: boolean
  duplicateProfileTooltipVisible: boolean
  profileMenuRef: RefObject<HTMLDivElement | null>
  profileMenuTriggerRef: RefObject<HTMLButtonElement | null>
  showProfileMenu: boolean
  profileMenuMaxHeight: number
  draggedProfileId: string | null
  dragOverProfileId: string | null
  dragDropPosition: 'before' | 'after' | null
  serverProfileBusy: boolean
  onCopyProfileImportUrl: (profile: ApiProfile) => void
  onDuplicateActiveProfile: () => void
  onProfileImportUrlTooltipVisibleChange: (visible: boolean) => void
  onDuplicateProfileTooltipVisibleChange: (visible: boolean) => void
  onStartProfileImportUrlTooltipTouch: () => void
  onClearProfileImportUrlTooltipTimer: () => void
  onStartDuplicateProfileTooltipTouch: () => void
  onClearDuplicateProfileTooltipTimer: () => void
  onUpdateProfileMenuMaxHeight: () => void
  onProfileMenuVisibleChange: (visible: boolean) => void
  onCreateNewProfile: () => void
  onProfileDragStart: (event: DragEvent, id: string) => void
  onProfileDragOver: (event: DragEvent, targetId: string) => void
  onProfileDrop: (event: DragEvent, targetId: string) => void
  onProfileDragEnd: () => void
  onProfileTouchStart: (event: TouchEvent, profile: ApiProfile) => void
  onProfileTouchMove: (event: TouchEvent) => void
  onProfileTouchEnd: (event: TouchEvent) => void
  onSwitchProfile: (id: string) => void
  onRequestDeleteProfile: (profile: ApiProfile) => void
  onRequestDeleteServerProfile: () => void
  onSaveActiveProfileToServer: () => void
  onUpdateActiveProfile: (patch: Partial<ApiProfile>, commit?: boolean) => void
  onCommitActiveProfilePatch: (patch: Partial<ApiProfile>) => void
  onProviderTypeChange: (value: string | number) => void
  onProviderReorder: (sourceValue: string | number, targetValue: string | number, position: 'before' | 'after' | null) => void
  onToggleShowApiKey: () => void
  onTimeoutInputChange: (value: string) => void
  onCommitTimeout: () => void
}

export default function ApiSettingsTab({
  draft,
  activeProfile,
  activeCustomProvider,
  providerOptions,
  activeProviderUsesApiUrl,
  activeProviderIsOpenAICompatible,
  directApiAccessEnabled,
  apiProxyAvailable,
  apiProxyLocked,
  apiProxyChecked,
  apiProxyEnabled,
  showApiKey,
  timeoutInput,
  profileImportUrlTooltipVisible,
  duplicateProfileTooltipVisible,
  profileMenuRef,
  profileMenuTriggerRef,
  showProfileMenu,
  profileMenuMaxHeight,
  draggedProfileId,
  dragOverProfileId,
  dragDropPosition,
  serverProfileBusy,
  onCopyProfileImportUrl,
  onDuplicateActiveProfile,
  onProfileImportUrlTooltipVisibleChange,
  onDuplicateProfileTooltipVisibleChange,
  onStartProfileImportUrlTooltipTouch,
  onClearProfileImportUrlTooltipTimer,
  onStartDuplicateProfileTooltipTouch,
  onClearDuplicateProfileTooltipTimer,
  onUpdateProfileMenuMaxHeight,
  onProfileMenuVisibleChange,
  onCreateNewProfile,
  onProfileDragStart,
  onProfileDragOver,
  onProfileDrop,
  onProfileDragEnd,
  onProfileTouchStart,
  onProfileTouchMove,
  onProfileTouchEnd,
  onSwitchProfile,
  onRequestDeleteProfile,
  onRequestDeleteServerProfile,
  onSaveActiveProfileToServer,
  onUpdateActiveProfile,
  onCommitActiveProfilePatch,
  onProviderTypeChange,
  onProviderReorder,
  onToggleShowApiKey,
  onTimeoutInputChange,
  onCommitTimeout,
}: ApiSettingsTabProps) {
  return (
    <div className="space-y-4">
      <div>
        <ProfileHeaderActions
          activeProfile={activeProfile}
          profileImportUrlTooltipVisible={profileImportUrlTooltipVisible}
          duplicateProfileTooltipVisible={duplicateProfileTooltipVisible}
          onCopyProfileImportUrl={onCopyProfileImportUrl}
          onDuplicateActiveProfile={onDuplicateActiveProfile}
          onProfileImportUrlTooltipVisibleChange={onProfileImportUrlTooltipVisibleChange}
          onDuplicateProfileTooltipVisibleChange={onDuplicateProfileTooltipVisibleChange}
          onStartProfileImportUrlTooltipTouch={onStartProfileImportUrlTooltipTouch}
          onClearProfileImportUrlTooltipTimer={onClearProfileImportUrlTooltipTimer}
          onStartDuplicateProfileTooltipTouch={onStartDuplicateProfileTooltipTouch}
          onClearDuplicateProfileTooltipTimer={onClearDuplicateProfileTooltipTimer}
        />
        <div ref={profileMenuRef} className="relative">
          <button
            ref={profileMenuTriggerRef}
            type="button"
            onClick={() => {
              if (!showProfileMenu) onUpdateProfileMenuMaxHeight()
              onProfileMenuVisibleChange(!showProfileMenu)
            }}
            className="flex w-full min-w-0 items-center justify-between gap-2 rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2 text-sm text-gray-700 outline-none transition hover:bg-gray-50 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:hover:bg-white/[0.06]"
            title={activeProfile.name}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate">{activeProfile.name}</span>
              <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-400">
                {getApiProviderLabel(draft, activeProfile.provider)}
              </span>
            </span>
            <ChevronDownIcon className={`w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${showProfileMenu ? 'rotate-180' : ''}`} />
          </button>

          {showProfileMenu && (
            <div
              className="absolute right-0 top-full z-50 mt-1.5 w-full overflow-hidden overflow-y-auto rounded-xl border border-gray-200/60 bg-white/95 py-1 shadow-[0_8px_30px_rgb(0,0,0,0.12)] ring-1 ring-black/5 backdrop-blur-xl animate-dropdown-down dark:border-white/[0.08] dark:bg-gray-900/95 dark:shadow-[0_8px_30px_rgb(0,0,0,0.3)] dark:ring-white/10 custom-scrollbar"
              style={{ maxHeight: profileMenuMaxHeight }}
            >
              <button
                type="button"
                onClick={(event) => {
                  event.preventDefault()
                  onCreateNewProfile()
                }}
                className="flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-blue-600 transition-colors hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-500/10"
              >
                <span className="truncate font-semibold">创建新配置</span>
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <PlusIcon className="h-4 w-4" />
                </span>
              </button>
              <div>
                {draft.profiles.map((profile) => (
                  <div
                    key={profile.id}
                    data-profile-id={profile.id}
                    title={profile.name}
                    draggable
                    onDragStart={(event) => onProfileDragStart(event, profile.id)}
                    onDragOver={(event) => onProfileDragOver(event, profile.id)}
                    onDrop={(event) => onProfileDrop(event, profile.id)}
                    onDragEnd={onProfileDragEnd}
                    onTouchStart={(event) => onProfileTouchStart(event, profile)}
                    onTouchMove={onProfileTouchMove}
                    onTouchEnd={onProfileTouchEnd}
                    onTouchCancel={onProfileDragEnd}
                    onClick={(event) => {
                      if ((event.target as HTMLElement).closest('[data-drag-handle]')) return
                      event.preventDefault()
                      onSwitchProfile(profile.id)
                    }}
                    className={`relative group flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-xs transition-colors ${draggedProfileId === profile.id ? 'opacity-40 bg-gray-100 dark:bg-white/[0.04]' : profile.id === activeProfile.id ? 'bg-blue-50 font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-400' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.06]'}`}
                  >
                    {dragOverProfileId === profile.id && dragDropPosition === 'before' && draggedProfileId !== profile.id && (
                      <div className="absolute -top-[1px] left-0 right-0 h-[2px] bg-blue-500 rounded-full z-40 shadow-sm pointer-events-none" />
                    )}
                    {dragOverProfileId === profile.id && dragDropPosition === 'after' && draggedProfileId !== profile.id && (
                      <div className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-blue-500 rounded-full z-40 shadow-sm pointer-events-none" />
                    )}
                    <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
                      <div
                        data-drag-handle
                        className="flex cursor-grab active:cursor-grabbing items-center justify-center text-gray-400 opacity-60 transition-opacity hover:opacity-100 dark:text-gray-500"
                        style={{ touchAction: 'none' }}
                        title="拖拽排序"
                      >
                        <DragHandleIcon className="h-3.5 w-3.5" />
                      </div>
                      <span className="min-w-0 truncate">{profile.name}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] shrink-0 ${profile.id === activeProfile.id ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300' : 'bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400'}`}>
                        {getApiProviderLabel(draft, profile.provider)}
                      </span>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          onCopyProfileImportUrl(profile)
                        }}
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 opacity-60 transition-all hover:bg-gray-100 hover:text-gray-600 hover:opacity-100 dark:hover:bg-white/[0.08] dark:hover:text-gray-200"
                        aria-label={`复制导入配置「${profile.name}」的 URL`}
                        title="复制导入 URL"
                      >
                        <LinkIcon className="h-3.5 w-3.5" />
                      </button>
                      {draft.profiles.length > 1 && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            onRequestDeleteProfile(profile)
                          }}
                          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 opacity-60 transition-all hover:bg-red-50 hover:text-red-500 hover:opacity-100 dark:hover:bg-red-500/10"
                          aria-label="删除配置"
                        >
                          <TrashIcon className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-gray-200/70 bg-white/50 px-3 py-2 dark:border-white/[0.08] dark:bg-white/[0.03]">
        <div className="min-w-0">
          <div className="truncate text-sm text-gray-700 dark:text-gray-200">服务器渠道</div>
          <div className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-500">
            {activeProfile.serverProfileId ? `ID ${activeProfile.serverProfileId}` : '未保存'}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {activeProfile.serverProfileId && (
            <button
              type="button"
              disabled={serverProfileBusy}
              onClick={onRequestDeleteServerProfile}
              className="rounded-lg border border-red-200/70 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10"
            >
              删除
            </button>
          )}
          <button
            type="button"
            disabled={serverProfileBusy}
            onClick={onSaveActiveProfileToServer}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-blue-500 dark:hover:bg-blue-400"
          >
            {serverProfileBusy ? '保存中' : activeProfile.serverProfileId ? '更新' : '保存'}
          </button>
        </div>
      </div>

      <label className="block">
        <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">配置名称</span>
        <input
          value={activeProfile.name}
          onChange={(event) => onUpdateActiveProfile({ name: event.target.value })}
          onBlur={(event) => onCommitActiveProfilePatch({ name: event.target.value })}
          type="text"
          className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
        />
      </label>

      <div className="block">
        <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">服务商类型</span>
        <Select
          value={activeProfile.provider}
          onChange={onProviderTypeChange}
          onReorder={onProviderReorder}
          options={providerOptions}
          className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
        />
      </div>

      {activeProviderUsesApiUrl && (
        <label className="block">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="block text-sm text-gray-600 dark:text-gray-300">API URL</span>
          </div>
          <input
            value={activeProfile.baseUrl}
            onChange={(event) => onUpdateActiveProfile({ baseUrl: event.target.value })}
            onBlur={(event) => onCommitActiveProfilePatch({ baseUrl: event.target.value })}
            type="text"
            disabled={apiProxyEnabled}
            placeholder={activeProfile.provider === 'fal' ? DEFAULT_FAL_BASE_URL : DEFAULT_SETTINGS.baseUrl}
            className={`w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50 ${apiProxyEnabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
          <div data-selectable-text className="mt-1.5 min-h-[22px] flex items-center text-xs text-gray-500 dark:text-gray-500">
            {apiProxyEnabled ? (
              <span className="text-yellow-600 dark:text-yellow-500">已开启代理，实际请求目标由部署端决定，此处设置被忽略。</span>
            ) : activeProfile.provider === 'fal' ? (
              <span>默认使用 <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">{DEFAULT_FAL_BASE_URL}</code>；填写自定义地址时将作为 fal.ai 代理 URL。</span>
            ) : activeProfile.directApiAccess ? (
              <span>浏览器将直接请求该地址，仅建议调试时开启。</span>
            ) : (
              <span>默认由本地 Go <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">/v1</code> 转发到该地址；Network 只会请求当前站点。</span>
            )}
          </div>
        </label>
      )}

      {activeProfile.provider === 'openai' && (
        <div className="block">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="block text-sm text-gray-600 dark:text-gray-300">浏览器直连调试</span>
            <button
              type="button"
              onClick={() => onUpdateActiveProfile({ directApiAccess: !activeProfile.directApiAccess }, true)}
              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${directApiAccessEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              role="switch"
              aria-checked={directApiAccessEnabled}
              aria-label="浏览器直连调试"
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${directApiAccessEnabled ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
            </button>
          </div>
          <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
            默认关闭。关闭时图片生成和编辑由当前 Go 服务的 <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">/v1</code> 代理转发；开启后浏览器直接请求 API URL。
          </div>
        </div>
      )}

      {apiProxyAvailable && activeProfile.provider === 'openai' && directApiAccessEnabled && (
        <div className="block">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="block text-sm text-gray-600 dark:text-gray-300">开发代理</span>
            <button
              type="button"
              onClick={() => {
                if (!apiProxyLocked) onUpdateActiveProfile({ apiProxy: !activeProfile.apiProxy }, true)
              }}
              disabled={apiProxyLocked}
              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${apiProxyChecked ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'} ${apiProxyLocked ? 'cursor-not-allowed opacity-70' : ''}`}
              role="switch"
              aria-checked={apiProxyChecked}
              aria-label="API 代理"
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${apiProxyChecked ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
            </button>
          </div>
          <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
            {apiProxyLocked ? '当前部署已锁定开发代理为开启，API URL 设置会被忽略。' : '仅用于浏览器直连调试时解决跨域限制；默认 Go 转发链路不需要开启。'}
          </div>
        </div>
      )}

      <div className="block">
        <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">API Key</span>
        <div className="relative">
          <input
            value={activeProfile.apiKey}
            onChange={(event) => onUpdateActiveProfile({ apiKey: event.target.value })}
            onBlur={(event) => onCommitActiveProfilePatch({ apiKey: event.target.value })}
            type={showApiKey ? 'text' : 'password'}
            placeholder={activeProfile.provider === 'fal' ? 'FAL_KEY' : 'sk-...'}
            className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 pr-10 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
          />
          <button
            type="button"
            onClick={onToggleShowApiKey}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
            tabIndex={-1}
          >
            {showApiKey ? (
              <EyeIcon className="w-4 h-4" />
            ) : (
              <EyeOffIcon className="w-4 h-4" />
            )}
          </button>
        </div>
        <div data-selectable-text className="mt-1.5 text-xs text-gray-500 dark:text-gray-500">
          支持通过查询参数覆盖：<code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">?apiKey=</code>
        </div>
      </div>

      {activeProfile.provider === 'openai' && (
        <div className="block">
          <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">API 接口</span>
          <Select
            value={activeProfile.apiMode ?? DEFAULT_SETTINGS.apiMode}
            onChange={(value) => {
              const apiMode = value as AppSettings['apiMode']
              const nextModel =
                activeProfile.model === DEFAULT_IMAGES_MODEL || activeProfile.model === DEFAULT_RESPONSES_MODEL
                  ? getDefaultModelForMode(apiMode)
                  : activeProfile.model
              onUpdateActiveProfile({ apiMode, model: nextModel }, true)
            }}
            options={[
              { label: 'Images API (/v1/images)', value: 'images' },
              { label: 'Responses API (/v1/responses)', value: 'responses' },
            ]}
            className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
          />
          <div data-selectable-text className="mt-1.5 text-xs text-gray-500 dark:text-gray-500">
            支持通过查询参数覆盖：<code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">apiMode=images</code> 或 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">apiMode=responses</code>。
          </div>
        </div>
      )}

      <label className="block">
        <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">
          模型 ID
        </span>
        <input
          value={activeProfile.model}
          onChange={(event) => onUpdateActiveProfile({ model: event.target.value })}
          onBlur={(event) => onCommitActiveProfilePatch({ model: event.target.value })}
          type="text"
          placeholder={activeProfile.provider === 'fal' ? DEFAULT_FAL_MODEL : getDefaultModelForMode(activeProfile.apiMode ?? DEFAULT_SETTINGS.apiMode)}
          className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
        />
        <div data-selectable-text className="mt-1.5 text-xs text-gray-500 dark:text-gray-500">
          {activeProfile.provider === 'fal' ? (
            <>当前适配 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">{DEFAULT_FAL_MODEL}</code>。</>
          ) : activeCustomProvider ? (
            <>当前使用 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">{activeCustomProvider.name}</code>。</>
          ) : (activeProfile.apiMode ?? DEFAULT_SETTINGS.apiMode) === 'responses' ? (
            <>Responses API 需要使用支持 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">image_generation</code> 工具的文本模型，例如 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">{DEFAULT_RESPONSES_MODEL}</code>。</>
          ) : (
            <>Images API 需要使用 GPT Image 模型，例如 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">{DEFAULT_IMAGES_MODEL}</code>。</>
          )}
          {activeProfile.provider === 'openai' && (
            <>支持通过查询参数覆盖：<code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">?model=</code>。</>
          )}
        </div>
      </label>

      {activeProfile.provider === 'openai' && (
        <div className="block space-y-3">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="block text-sm text-gray-600 dark:text-gray-300">流式传输</span>
              <button
                type="button"
                onClick={() => onUpdateActiveProfile({ streamImages: !activeProfile.streamImages }, true)}
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${activeProfile.streamImages ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                role="switch"
                aria-checked={!!activeProfile.streamImages}
                aria-label="流式传输"
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${activeProfile.streamImages ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
              </button>
            </div>
            <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
              开启后请求以流式传输，并非所有服务商和网关都支持此功能。官方接口在流式模式下不发送心跳，需要配合请求中间步骤图像来维持连接，避免超时断开。官方接口仅支持单图流式传输，因此数量大于 1 时会将多图生成拆分为并发单图。
            </div>
          </div>
          <label className={`block ${activeProfile.streamImages ? '' : 'opacity-60'}`}>
            <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">请求中间步骤图像数</span>
            <Select
              value={normalizeStreamPartialImages(activeProfile.streamPartialImages)}
              onChange={(value) => onUpdateActiveProfile({ streamPartialImages: normalizeStreamPartialImages(value) }, true)}
              disabled={!activeProfile.streamImages}
              options={[
                { label: '0，不请求', value: 0 },
                { label: '1 张', value: 1 },
                { label: '2 张', value: 2 },
                { label: '3 张', value: 3 },
              ]}
              className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
            />
            <div data-selectable-text className="mt-1.5 text-xs text-gray-500 dark:text-gray-500">
              对应 <code className="rounded bg-gray-100 px-1 py-0.5 dark:bg-white/[0.06]">partial_images</code> 参数（0-3）。建议设为 2 或 3 以避免长时间生成时连接超时断开。实际返回的每张中间图像会产生少量额外计费。设为 0 时不请求中间步骤图像，连接可能因无数据传输而被断开。
            </div>
          </label>
        </div>
      )}

      {activeProviderIsOpenAICompatible && (
        <div className="block">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="block text-sm text-gray-600 dark:text-gray-300">返回 Base64 图片数据</span>
            <button
              type="button"
              onClick={() => onUpdateActiveProfile({ responseFormatB64Json: !activeProfile.responseFormatB64Json }, true)}
              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${activeProfile.responseFormatB64Json ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              role="switch"
              aria-checked={!!activeProfile.responseFormatB64Json}
              aria-label="返回 Base64 图片数据"
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${activeProfile.responseFormatB64Json ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
            </button>
          </div>
          <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
            开启后在请求体中追加 <code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">response_format: b64_json</code>，使接口直接返回 Base64 编码的图片数据而非 URL。并非所有服务商和网关都支持此功能。
          </div>
        </div>
      )}

      {activeProfile.provider === 'openai' && (
        <div className="block">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="block text-sm text-gray-600 dark:text-gray-300">Codex CLI 兼容模式</span>
            <button
              type="button"
              onClick={() => onUpdateActiveProfile({ codexCli: !activeProfile.codexCli }, true)}
              className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${activeProfile.codexCli ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`}
              role="switch"
              aria-checked={activeProfile.codexCli}
              aria-label="Codex CLI 兼容模式"
            >
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${activeProfile.codexCli ? 'translate-x-[14px]' : 'translate-x-[2px]'}`} />
            </button>
          </div>
          <div data-selectable-text className="text-xs text-gray-500 dark:text-gray-500">
            开启后应用 Codex CLI 实际支持的参数。支持查询参数覆盖：<code className="bg-gray-100 dark:bg-white/[0.06] px-1 py-0.5 rounded">codexCli=true</code>。
          </div>
        </div>
      )}

      {activeProviderIsOpenAICompatible && (
        <label className="block">
          <span className="mb-1.5 block text-sm text-gray-600 dark:text-gray-300">请求超时 (秒)</span>
          <input
            value={timeoutInput}
            onChange={(event) => onTimeoutInputChange(event.target.value)}
            onBlur={onCommitTimeout}
            type="number"
            min={10}
            max={600}
            className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
          />
        </label>
      )}
    </div>
  )
}
