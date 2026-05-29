import type { TaskRecord } from '../../types'
import { DEFAULT_FAL_MODEL, DEFAULT_IMAGES_MODEL } from '../../lib/apiProfiles'
import { ActualValueBadge, getParamDisplay } from '../../lib/paramDisplay'
import { CodeIcon } from '../../shared/ui/icons'

interface TaskMetaTagsProps {
  task: TaskRecord
}

export default function TaskMetaTags({ task }: TaskMetaTagsProps) {
  const qualityDisplay = getParamDisplay(task, 'quality')
  const showQuality = task.params.quality !== 'auto' || qualityDisplay.isMismatch

  const sizeDisplay = getParamDisplay(task, 'size')
  const showSize = task.params.size !== 'auto' || sizeDisplay.isMismatch

  const formatDisplay = getParamDisplay(task, 'output_format')
  const showFormat = task.params.output_format !== 'png' || formatDisplay.isMismatch

  const nDisplay = getParamDisplay(task, 'n')
  const isAgentTask = task.sourceMode === 'agent' || Boolean(task.agentConversationId || task.agentRoundId)
  const showN = !isAgentTask && (task.params.n > 1 || nDisplay.isMismatch)

  const defaultModelForProvider = task.apiProvider === 'fal' ? DEFAULT_FAL_MODEL : DEFAULT_IMAGES_MODEL
  const showModel = task.apiModel && task.apiModel !== defaultModelForProvider

  return (
    <div
      data-tag-scroll-area
      className="flex overflow-x-auto hide-scrollbar pt-0.5 gap-1.5 whitespace-nowrap mask-edge-r min-w-0 pr-2"
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onTouchCancel={(e) => e.stopPropagation()}
    >
      {task.categoryName && (
        <span
          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-300 text-xs flex-shrink-0"
          title={task.categoryName}
        >
          <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
          </svg>
          <span className="truncate max-w-[8rem]">{task.categoryName}</span>
        </span>
      )}
      {task.deletedAt && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-50 dark:bg-red-500/10 text-red-500 dark:text-red-300 text-xs flex-shrink-0">
          回收站
        </span>
      )}
      {(task.apiProfileName || task.apiProvider) && (
        <span
          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.04] text-gray-600 dark:text-gray-300 text-xs flex-shrink-0"
          title={task.apiProfileName || task.apiProvider}
        >
          <CodeIcon className="w-3 h-3 flex-shrink-0 text-gray-400" />
          <span className="truncate max-w-[8rem]">
            {task.apiProfileName || task.apiProvider}
          </span>
        </span>
      )}
      {showModel && (
        <span
          className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.04] text-gray-600 dark:text-gray-300 text-xs flex-shrink-0"
          title={task.apiModel}
        >
          <svg className="w-3 h-3 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
          </svg>
          <span className="truncate max-w-[8rem]">
            {task.apiModel}
          </span>
        </span>
      )}
      {task.maskImageId && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs flex-shrink-0">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
          </svg>
          局部重绘
        </span>
      )}
      {showQuality && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.04] text-xs flex-shrink-0">
          <span className="text-gray-400 dark:text-gray-500">质量</span>
          {qualityDisplay.isMismatch ? <ActualValueBadge value={qualityDisplay.displayValue} className="px-1 rounded-sm" /> : <span className="text-gray-600 dark:text-gray-300">{qualityDisplay.displayValue}</span>}
        </span>
      )}
      {showSize && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.04] text-xs flex-shrink-0">
          <span className="text-gray-400 dark:text-gray-500">尺寸</span>
          {sizeDisplay.isMismatch ? <ActualValueBadge value={sizeDisplay.displayValue} className="px-1 rounded-sm" /> : <span className="text-gray-600 dark:text-gray-300">{sizeDisplay.displayValue}</span>}
        </span>
      )}
      {showFormat && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.04] text-xs flex-shrink-0">
          <span className="text-gray-400 dark:text-gray-500">格式</span>
          {formatDisplay.isMismatch ? <ActualValueBadge value={formatDisplay.displayValue} className="px-1 rounded-sm" /> : <span className="text-gray-600 dark:text-gray-300">{formatDisplay.displayValue}</span>}
        </span>
      )}
      {showN && (
        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-white/[0.04] text-xs flex-shrink-0">
          <span className="text-gray-400 dark:text-gray-500">数量</span>
          {nDisplay.isMismatch ? <ActualValueBadge value={nDisplay.displayValue} className="px-1 rounded-sm" /> : <span className="text-gray-600 dark:text-gray-300">{nDisplay.displayValue}</span>}
        </span>
      )}
    </div>
  )
}
