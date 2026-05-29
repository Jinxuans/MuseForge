import type { TaskRecord } from '../../types'
import { cancelQueuedServerTask, retryTask, updateTaskInStore } from '../../store'
import { CloseIcon, EditIcon, FavoriteIcon, RefreshIcon, RestoreIcon, ShareIcon, TrashIcon } from '../../shared/ui/icons'
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
          <CloseIcon className="w-4 h-4" />
        </TaskActionButton>
      )}
      {((task.status === 'error' && !isFalReconnecting) || alwaysShowRetryButton) && (
        <TaskActionButton
          tooltip="重试任务"
          onClick={() => retryTask(task)}
          className="p-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30 text-gray-400 hover:text-blue-500 transition"
        >
          <RefreshIcon className="w-4 h-4" />
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
        <FavoriteIcon className="w-4 h-4" filled={task.isFavorite} />
      </TaskActionButton>
      <TaskActionButton
        tooltip="复用配置"
        onClick={onReuse}
        className="p-1.5 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950/30 text-gray-400 hover:text-blue-500 transition"
      >
        <RestoreIcon className="w-4 h-4" />
      </TaskActionButton>
      <TaskActionButton
        tooltip="编辑输出"
        onClick={onEditOutputs}
        className="p-1.5 rounded-md hover:bg-green-50 dark:hover:bg-green-950/30 text-gray-400 hover:text-green-500 transition disabled:opacity-30"
        disabled={!task.outputImages?.length}
      >
        <EditIcon className="w-4 h-4" />
      </TaskActionButton>
      {task.status === 'done' && !task.deletedAt && (
        <TaskActionButton
          tooltip="分享到广场"
          onClick={onShareToSquare}
          className="p-1.5 rounded-md hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-gray-400 hover:text-indigo-500 transition disabled:opacity-30"
          disabled={!task.outputImages?.length}
        >
          <ShareIcon className="w-4 h-4" />
        </TaskActionButton>
      )}
      <TaskActionButton
        tooltip="删除记录"
        onClick={onDelete}
        className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500 transition"
      >
        <TrashIcon className="w-4 h-4" />
      </TaskActionButton>
    </div>
  )
}
