import type { TaskRecord } from '../../types'
import { buildAncestorChain, getChildTasks, getStatusLabel, getTaskTitle } from './detailHelpers'

type TaskContextSectionsProps = {
  task: TaskRecord
  tasks: TaskRecord[]
  formatTime: (ts: number | null) => string
  onSelectTask: (taskId: string) => void
}

function LineageTaskCard({
  task,
  label,
  isCurrent = false,
  formatTime,
  onSelectTask,
}: {
  task: TaskRecord
  label: string
  isCurrent?: boolean
  formatTime: (ts: number | null) => string
  onSelectTask: (taskId: string) => void
}) {
  const title = getTaskTitle(task)
  const outputCount = task.outputImages?.length ?? 0
  const content = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] font-semibold uppercase tracking-wider ${
          isCurrent ? 'text-blue-500 dark:text-blue-300' : 'text-gray-400 dark:text-gray-500'
        }`}>
          {label}
        </span>
        <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] ${
          task.status === 'done'
            ? 'bg-green-50 text-green-600 dark:bg-green-500/10 dark:text-green-300'
            : task.status === 'running'
              ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-500/10 dark:text-yellow-300'
              : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
        }`}>
          {getStatusLabel(task.status)}
        </span>
      </div>
      <div className="mt-1 truncate text-left font-medium text-gray-800 dark:text-gray-100" title={title}>
        {title}
      </div>
      <div className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-gray-400 dark:text-gray-500">
        <span className="truncate">{task.categoryName || '未分类'}</span>
        <span>·</span>
        <span>{formatTime(task.createdAt)}</span>
        {outputCount > 0 && (
          <>
            <span>·</span>
            <span>{outputCount} 张</span>
          </>
        )}
      </div>
    </>
  )

  if (isCurrent) {
    return (
      <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs dark:border-blue-500/20 dark:bg-blue-500/10">
        {content}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onSelectTask(task.id)}
      className="block w-full rounded-lg border border-gray-100 bg-white px-3 py-2 text-xs transition hover:border-blue-200 hover:bg-blue-50/70 dark:border-white/[0.06] dark:bg-white/[0.03] dark:hover:border-blue-500/20 dark:hover:bg-blue-500/10"
    >
      {content}
    </button>
  )
}

export default function TaskContextSections({ task, tasks, formatTime, onSelectTask }: TaskContextSectionsProps) {
  const { ancestors, parentMissing } = buildAncestorChain(task, tasks)
  const children = getChildTasks(task, tasks)
  const showLineage = ancestors.length > 0 || children.length > 0 || parentMissing || task.parentImageId

  if (!task.categoryName && !task.deletedAt && !showLineage) return null

  return (
    <div className="mb-4 space-y-2">
      {task.categoryName && (
        <div className="rounded-lg bg-purple-50 px-3 py-2 text-xs dark:bg-purple-500/10">
          <span className="text-purple-400 dark:text-purple-300">分类</span>
          <br />
          <span className="font-medium text-purple-700 dark:text-purple-200">{task.categoryName}</span>
        </div>
      )}
      {task.deletedAt && (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-xs dark:bg-red-500/10">
          <span className="text-red-400 dark:text-red-300">回收站</span>
          <br />
          <span className="font-medium text-red-700 dark:text-red-200">移入于 {formatTime(task.deletedAt)}</span>
        </div>
      )}
      {showLineage && (
        <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs dark:bg-white/[0.03]">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-gray-400 dark:text-gray-500">任务链路</span>
            {children.length > 0 && (
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-gray-500 dark:bg-white/[0.05] dark:text-gray-400">
                {children.length} 个后续
              </span>
            )}
          </div>
          <div className="space-y-1.5">
            {parentMissing && (
              <div className="rounded-lg border border-dashed border-gray-200 bg-white/70 px-3 py-2 text-gray-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-400">
                上游任务已删除
              </div>
            )}
            {ancestors.map((lineageTask, index) => (
              <LineageTaskCard
                key={lineageTask.id}
                task={lineageTask}
                label={`上游 ${index + 1}`}
                formatTime={formatTime}
                onSelectTask={onSelectTask}
              />
            ))}
            <LineageTaskCard
              task={task}
              label="当前"
              isCurrent
              formatTime={formatTime}
              onSelectTask={onSelectTask}
            />
            {children.map((lineageTask, index) => (
              <LineageTaskCard
                key={lineageTask.id}
                task={lineageTask}
                label={`后续 ${index + 1}`}
                formatTime={formatTime}
                onSelectTask={onSelectTask}
              />
            ))}
          </div>
          {task.parentImageId && (
            <div className="mt-2 truncate text-[11px] text-gray-400 dark:text-gray-500">来源图片 {task.parentImageId}</div>
          )}
        </div>
      )}
    </div>
  )
}
