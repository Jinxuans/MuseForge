import type { ReactNode } from 'react'
import { ButtonTooltip } from './InputBarParts'

interface InputBarActionsProps {
  desktopParams: ReactNode
  mobileParams: ReactNode
  mobileCollapsed: boolean
  attachHover: boolean
  submitHover: boolean
  uploadImageTooltipText: string
  submitTooltipText: string
  submitButtonAriaLabel: string
  atImageLimit: boolean
  showMobileUploadMenu: boolean
  activeAgentIsRunning: boolean
  hasSubmitApiConfig: boolean
  canSubmit: boolean
  hasMaskDraft: boolean
  onAttachHoverChange: (hovered: boolean) => void
  onSubmitHoverChange: (hovered: boolean) => void
  onDesktopUpload: () => void
  onToggleMobileUploadMenu: () => void
  onCloseMobileUploadMenu: () => void
  onCameraUpload: () => void
  onFileUpload: () => void
  onSubmit: () => void
}

function SubmitIcon({ mobile = false }: { mobile?: boolean }) {
  const className = mobile ? 'w-4 h-4' : 'w-5 h-5'
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
    </svg>
  )
}

function StopIcon({ mobile = false }: { mobile?: boolean }) {
  const className = mobile ? 'w-4 h-4' : 'w-5 h-5'
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <rect x="7" y="7" width="10" height="10" rx="1.5" />
    </svg>
  )
}

export default function InputBarActions({
  desktopParams,
  mobileParams,
  mobileCollapsed,
  attachHover,
  submitHover,
  uploadImageTooltipText,
  submitTooltipText,
  submitButtonAriaLabel,
  atImageLimit,
  showMobileUploadMenu,
  activeAgentIsRunning,
  hasSubmitApiConfig,
  canSubmit,
  hasMaskDraft,
  onAttachHoverChange,
  onSubmitHoverChange,
  onDesktopUpload,
  onToggleMobileUploadMenu,
  onCloseMobileUploadMenu,
  onCameraUpload,
  onFileUpload,
  onSubmit,
}: InputBarActionsProps) {
  const uploadButtonClass = atImageLimit
    ? 'bg-gray-200 dark:bg-white/[0.04] text-gray-300 dark:text-gray-500 cursor-not-allowed'
    : 'bg-gray-200 dark:bg-white/[0.06] hover:bg-gray-300 dark:hover:bg-white/[0.1] text-gray-500 dark:text-gray-300'
  const submitButtonClass = activeAgentIsRunning
    ? 'bg-red-500 text-white hover:bg-red-600'
    : !hasSubmitApiConfig
    ? 'bg-gray-300 dark:bg-white/[0.06] text-white cursor-pointer'
    : 'bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-white/[0.04] disabled:opacity-50 disabled:cursor-not-allowed'
  const submitDisabled = activeAgentIsRunning ? false : hasSubmitApiConfig ? !canSubmit : false

  return (
    <div className="mt-3">
      <div className="hidden sm:flex items-end justify-between gap-3">
        {desktopParams}

        <div className="flex gap-2 flex-shrink-0 mb-0.5">
          <div
            className="relative"
            onMouseEnter={() => onAttachHoverChange(true)}
            onMouseLeave={() => onAttachHoverChange(false)}
          >
            <ButtonTooltip visible={attachHover} text={uploadImageTooltipText} />
            <button
              onClick={onDesktopUpload}
              className={`p-2.5 rounded-xl transition-all shadow-sm ${uploadButtonClass} ${atImageLimit ? '' : 'hover:shadow'}`}
              aria-label={uploadImageTooltipText}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>
          </div>
          <div
            className="relative"
            onMouseEnter={() => onSubmitHoverChange(true)}
            onMouseLeave={() => onSubmitHoverChange(false)}
          >
            <ButtonTooltip visible={(activeAgentIsRunning || !hasSubmitApiConfig) && submitHover} text={submitTooltipText} />
            <button
              onClick={onSubmit}
              disabled={submitDisabled}
              className={`p-2.5 rounded-xl transition-all shadow-sm hover:shadow ${submitButtonClass}`}
              aria-label={submitButtonAriaLabel}
            >
              {activeAgentIsRunning ? <StopIcon /> : <SubmitIcon />}
            </button>
          </div>
        </div>
      </div>

      <div className="sm:hidden flex flex-col gap-2">
        <div className={`collapse-section${mobileCollapsed ? ' collapsed' : ''}`}>
          <div className="collapse-inner">
            {mobileParams}
            <div className="h-2" />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="relative"
            onMouseEnter={() => onAttachHoverChange(true)}
            onMouseLeave={() => onAttachHoverChange(false)}
          >
            <ButtonTooltip visible={attachHover} text={uploadImageTooltipText} />
            <button
              onClick={onToggleMobileUploadMenu}
              className={`p-2.5 rounded-xl transition-all shadow-sm flex-shrink-0 ${uploadButtonClass}`}
              aria-label={uploadImageTooltipText}
            >
              <svg
                className={`w-5 h-5 transition-transform duration-200 ${showMobileUploadMenu ? 'rotate-90' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>

            {showMobileUploadMenu && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={onCloseMobileUploadMenu}
                />
                <div className="absolute bottom-full left-0 mb-2 w-32 bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <button
                    className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors"
                    onClick={onCameraUpload}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    拍照
                  </button>
                  <button
                    className="w-full px-4 py-3 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50 flex items-center gap-2 transition-colors"
                    onClick={onFileUpload}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    上传图片
                  </button>
                </div>
              </>
            )}
          </div>
          <div
            className="relative flex-1"
            onMouseEnter={() => onSubmitHoverChange(true)}
            onMouseLeave={() => onSubmitHoverChange(false)}
          >
            <ButtonTooltip visible={(activeAgentIsRunning || !hasSubmitApiConfig) && submitHover} text={submitTooltipText} />
            <button
              onClick={onSubmit}
              disabled={submitDisabled}
              aria-label={submitButtonAriaLabel}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all shadow-sm ${submitButtonClass}`}
            >
              {activeAgentIsRunning ? <StopIcon mobile /> : <SubmitIcon mobile />}
              {activeAgentIsRunning ? '停止生成' : hasMaskDraft ? '遮罩编辑' : '生成图像'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
