import type { TaskRecord, TaskView } from '../../types'
import { EditIcon, TrashIcon } from '../../shared/ui/icons'

type TaskActionBarProps = {
  task: TaskRecord
  taskView: TaskView
  outputLen: number
  onReuse: () => void
  onEdit: () => void
  onShare: () => void
  onRestore: () => void
  onDelete: () => void
  onToggleFavorite: () => void
}

export default function TaskActionBar({
  task,
  taskView,
  outputLen,
  onReuse,
  onEdit,
  onShare,
  onRestore,
  onDelete,
  onToggleFavorite,
}: TaskActionBarProps) {
  return (
    <div className="grid grid-cols-4 gap-2 pt-4 border-t border-gray-100 dark:border-white/[0.08] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_2.75rem]">
      <button
        onClick={onReuse}
        className="col-span-2 sm:col-span-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition text-sm font-medium whitespace-nowrap"
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
        </svg>
        <span className="min-w-0 truncate">复用配置</span>
      </button>
      <button
        onClick={onEdit}
        disabled={!outputLen}
        className="col-span-2 sm:col-span-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition text-sm font-medium whitespace-nowrap"
      >
        <EditIcon className="w-4 h-4 flex-shrink-0" />
        <span className="min-w-0 truncate">编辑输出</span>
      </button>
      {!task.deletedAt && (
        <button
          onClick={onShare}
          disabled={task.status !== 'done' || !outputLen}
          className="col-span-2 sm:col-span-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition text-sm font-medium whitespace-nowrap"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8a3 3 0 100-6 3 3 0 000 6zM17 14a3 3 0 100-6 3 3 0 000 6zM7 22a3 3 0 100-6 3 3 0 000 6zM9.6 6.6l4.8 2.8M14.4 12.6l-4.8 2.8" />
          </svg>
          <span className="min-w-0 truncate">分享</span>
        </button>
      )}
      {task.deletedAt && (
        <button
          onClick={onRestore}
          className="col-span-2 sm:col-span-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition text-sm font-medium whitespace-nowrap"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
          <span className="min-w-0 truncate">恢复</span>
        </button>
      )}
      <button
        onClick={onDelete}
        className="col-span-3 sm:col-span-1 min-w-0 flex items-center justify-center gap-1.5 px-2 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 transition text-sm font-medium whitespace-nowrap"
      >
        <TrashIcon className="w-4 h-4 flex-shrink-0" />
        <span className="min-w-0 truncate">{taskView === 'trash' ? '彻底删除' : '删除记录'}</span>
      </button>
      <button
        onClick={onToggleFavorite}
        className={`col-span-1 sm:col-span-1 w-full flex items-center justify-center rounded-xl transition ${
          task.isFavorite
            ? 'bg-yellow-50 text-yellow-500 hover:bg-yellow-100 dark:bg-yellow-500/10 dark:hover:bg-yellow-500/20'
            : 'bg-gray-50 text-gray-400 hover:bg-yellow-50 hover:text-yellow-500 dark:bg-white/[0.04] dark:hover:bg-yellow-500/10'
        }`}
        title={task.isFavorite ? '取消收藏' : '收藏记录'}
      >
        <svg className="w-5 h-5" fill={task.isFavorite ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
        </svg>
      </button>
    </div>
  )
}
