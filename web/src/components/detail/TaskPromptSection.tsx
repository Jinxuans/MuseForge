import type { TaskRecord } from '../../types'
import { ActualValueBadge } from '../../lib/paramDisplay'
import { CopyIcon } from '../../shared/ui/icons'

type TaskPromptSectionProps = {
  task: TaskRecord
  showPendingPrompt: boolean
  showPromptWarning: boolean
  showRevisedPrompt: boolean
  currentRevisedPrompt: string
  onCopyPrompt: () => void
  onShowPromptWarning: () => void
}

export default function TaskPromptSection({
  task,
  showPendingPrompt,
  showPromptWarning,
  showRevisedPrompt,
  currentRevisedPrompt,
  onCopyPrompt,
  onShowPromptWarning,
}: TaskPromptSectionProps) {
  return (
    <>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">
          输入内容
        </h3>
        {task.prompt && !showPendingPrompt && (
          <button
            onClick={onCopyPrompt}
            className="p-1 rounded text-gray-400 hover:bg-gray-100 dark:text-gray-500 dark:hover:bg-white/[0.06] transition"
            title="复制提示词"
          >
            <CopyIcon className="h-4 w-4" />
          </button>
        )}
        {showPromptWarning && (
          <span className="relative inline-flex">
            <button
              type="button"
              className="p-1 rounded text-amber-500 hover:bg-amber-50 dark:text-yellow-300 dark:hover:bg-yellow-500/10 transition"
              onClick={onShowPromptWarning}
              aria-label="提示词已被改写"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            </button>
          </span>
        )}
      </div>
      {showPendingPrompt ? (
        <div className="mb-4 leading-relaxed">
          <p className="text-sm text-gray-700 dark:text-gray-300">正在生成……</p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">输入内容将在响应完成时接收</p>
        </div>
      ) : (
        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap mb-4">
          {task.prompt || '(无提示词)'}
        </p>
      )}
      {showRevisedPrompt && currentRevisedPrompt && (
        <div className="mb-4">
          <ActualValueBadge
            value={currentRevisedPrompt}
            className="max-w-full rounded px-2 py-1 text-left text-xs leading-relaxed whitespace-pre-wrap"
          />
        </div>
      )}
    </>
  )
}
