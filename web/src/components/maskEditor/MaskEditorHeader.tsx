import type { MaskDraft } from '../../types'

type MaskEditorHeaderProps = {
  imageId: string
  isReady: boolean
  isSaving: boolean
  maskDraft: MaskDraft | null
  showMaskInfo: boolean
  onClose: () => void
  onSave: () => void
  onRemoveMask: () => void
  onShowMaskInfo: () => void
  onHideMaskInfo: () => void
  onStartMaskInfoTouch: () => void
  onClearMaskInfoTimer: () => void
}

export default function MaskEditorHeader({
  imageId,
  isReady,
  isSaving,
  maskDraft,
  showMaskInfo,
  onClose,
  onSave,
  onRemoveMask,
  onShowMaskInfo,
  onHideMaskInfo,
  onStartMaskInfoTouch,
  onClearMaskInfoTimer,
}: MaskEditorHeaderProps) {
  return (
    <div className="flex-none flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-950 z-20">
      <div className="flex items-center gap-3">
        <button onClick={onClose} disabled={isSaving} className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-lg dark:text-gray-400 dark:hover:bg-gray-800 transition" title="取消">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
        <div className="relative flex items-center gap-1.5">
          <h2 className="text-sm font-medium text-gray-700 dark:text-gray-200" id="mask-editor-title">编辑遮罩</h2>
          <button
            type="button"
            onClick={onShowMaskInfo}
            onMouseEnter={onShowMaskInfo}
            onMouseLeave={onHideMaskInfo}
            onTouchStart={onStartMaskInfoTouch}
            onTouchEnd={onClearMaskInfoTimer}
            onTouchCancel={onHideMaskInfo}
            className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
            aria-label="遮罩编辑说明"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          {showMaskInfo && (
            <div className="absolute left-0 top-full mt-2 w-64 rounded-xl border border-gray-200/80 bg-white px-3 py-2 text-xs leading-5 text-gray-600 shadow-lg dark:border-white/[0.08] dark:bg-gray-900 dark:text-gray-300">
              <div className="absolute -top-1.5 left-16 h-3 w-3 rotate-45 border-l border-t border-gray-200/80 bg-white dark:border-white/[0.08] dark:bg-gray-900" />
              <p>根据官方文档说明，此功能仅基于提示词，无法完全控制模型编辑区域。</p>
              <p className="mt-2">建议附加类似“只编辑遮罩区域”的提示词以提升模型指令遵循程度。</p>
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {maskDraft?.targetImageId === imageId && (
          <button onClick={onRemoveMask} className="flex h-8 items-center gap-1.5 px-4 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition">
            移除遮罩
          </button>
        )}
        <button onClick={onSave} disabled={!isReady || isSaving} className="flex h-8 items-center gap-1.5 px-4 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg disabled:opacity-50 transition">
          {isSaving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}
