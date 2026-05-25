import type { TaskRecord } from '../../types'
import { cancelQueuedServerTask, retryTask, updateTaskInStore } from '../../store'
import TaskActionButton from './TaskActionButton'

interface TaskActionStripProps {
  task: TaskRecord
  showCancelQueued: boolean
  isFalReconnecting: boolean
  alwaysShowRetryButton: boolean
  onReuse: () => void
  onEditOutputs: () => void
  onDelete: () => void
  onShareToSquare: () => void
}

export default function TaskActionStrip({
  task,
  showCancelQueued,
  isFalReconnecting,
  alwaysShowRetryButton,
  onReuse,
  onEditOutputs,
  onDelete,
  onShareToSquare,
}: TaskActionStripProps) {
  return (
    <div
      data-tag-scroll-area
      className="flex items-center gap-1 flex-shrink-0 mt-0.5 ml-auto max-w-full overflow-x-auto hide-scrollbar mask-edge-r pr-2"
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      onTouchCancel={(e) => e.stopPropagation()}
    >
      {showCancelQueued && !task.deletedAt && (
        <TaskActionButton
          tooltip="取消排队任务"
          onClick={() => { void cancelQueuedServerTask(task) }}
          className="p-1.5 rounded-md hover:bg-yellow-50 dark:hover:bg-yellow-500/10 text-gray-400 hover:text-yellow-500 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </TaskActionButton>
      )}
      {((task.status === 'error' && !isFalReconnecting) || alwaysShowRetryButton) && (
        <TaskActionButton
          tooltip="重试任务"
          onClick={() => retryTask(task)}
          className="p-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30 text-gray-400 hover:text-blue-500 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </TaskActionButton>
      )}
      <TaskActionButton
        tooltip={task.isFavorite ? '取消收藏' : '收藏记录'}
        onClick={() =>
          updateTaskInStore(task.id, { isFavorite: !task.isFavorite })
        }
        className={`p-1.5 rounded-md transition ${
          task.isFavorite
            ? 'text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-500/10'
            : 'text-gray-400 hover:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-500/10'
        }`}
      >
        <svg
          className="w-4 h-4"
          fill={task.isFavorite ? 'currentColor' : 'none'}
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
          />
        </svg>
      </TaskActionButton>
      <TaskActionButton
        tooltip="复用配置"
        onClick={onReuse}
        className="p-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30 text-gray-400 hover:text-blue-500 transition"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
          />
        </svg>
      </TaskActionButton>
      <TaskActionButton
        tooltip="编辑输出"
        onClick={onEditOutputs}
        className="p-1.5 rounded-md hover:bg-green-50 dark:hover:bg-green-950/30 text-gray-400 hover:text-green-500 transition disabled:opacity-30"
        disabled={!task.outputImages?.length}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      </TaskActionButton>
      {task.status === 'done' && !task.deletedAt && (
        <TaskActionButton
          tooltip="分享到广场"
          onClick={onShareToSquare}
          className="p-1.5 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-gray-400 hover:text-indigo-500 transition disabled:opacity-30"
          disabled={!task.outputImages?.length}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8a3 3 0 100-6 3 3 0 000 6zM17 14a3 3 0 100-6 3 3 0 000 6zM7 22a3 3 0 100-6 3 3 0 000 6zM9.6 6.6l4.8 2.8M14.4 12.6l-4.8 2.8" />
          </svg>
        </TaskActionButton>
      )}
      <TaskActionButton
        tooltip="删除记录"
        onClick={onDelete}
        className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500 transition"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </TaskActionButton>
    </div>
  )
}
